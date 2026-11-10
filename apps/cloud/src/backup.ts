// Projects backed up on Enclose Cloud. The app sends each file once, under its SHA-256,
// and then each project as it is: its files' paths and hashes (a snapshot). Nothing is
// sent twice: the app asks first which of its files the server has not got.
//
//   POST /v1/backup/missing        { hashes }  -> { missing }   which are not kept yet
//   PUT  /v1/backup/files/<hash>   the file    -> { size }      kept, if it is that hash
//   POST /v1/backup/snapshots      { project, files } -> { id } the project as it is now
//   GET  /v1/backup/projects       -> { projects }             each, as last backed up
//   POST /v1/backup/remove         { projects } -> { freed }   gone, and what only they used
//
// Everything is the signed-in account's own, under `u/<user>/` in R2, and counted in D1
// (migrations/0002_backups.sql): an account may keep STORAGE_LIMIT, and all of them
// together SERVICE_LIMIT. Deleting the account deletes all of it (removeAll).
import { z } from "zod"

import { FILE_LIMIT, SERVICE_LIMIT, STORAGE_LIMIT } from "./account"

const HASH = /^[0-9a-f]{64}$/
/** How many values D1 takes bound to one statement, and so how many are asked of at once. */
const BOUND = 90

const fileKey = (user: string, hash: string) => `u/${user}/files/${hash}`
const snapshotKey = (user: string, id: string) =>
  `u/${user}/snapshots/${id}.json`

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } })

const refuse = (status: number, code: string, message: string, more = {}) =>
  json({ code, message, ...more }, status)

/** How much an account keeps, in bytes. */
export async function usedBy(env: Env, user: string): Promise<number> {
  const row = await env.DB.prepare(
    `select coalesce(sum("size"), 0) as used from "file" where "userId" = ?`
  )
    .bind(user)
    .first<{ used: number }>()
  return row?.used ?? 0
}

/** How many of its projects an account has backed up, and when it last did. */
export async function backedUp(
  env: Env,
  user: string
): Promise<{ projects: number; at: number | null }> {
  const row = await env.DB.prepare(
    `select count(distinct "projectId") as projects, max("createdAt") as at from "snapshot" where "userId" = ?`
  )
    .bind(user)
    .first<{ projects: number; at: number | null }>()
  return { projects: row?.projects ?? 0, at: row?.at ?? null }
}

/** Which of these hashes the account keeps a file of. */
async function kept(
  env: Env,
  user: string,
  hashes: string[]
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let at = 0; at < hashes.length; at += BOUND) {
    const some = hashes.slice(at, at + BOUND)
    const { results } = await env.DB.prepare(
      `select "hash" from "file" where "userId" = ? and "hash" in (${some.map(() => "?").join(",")})`
    )
      .bind(user, ...some)
      .all<{ hash: string }>()
    for (const row of results) found.add(row.hash)
  }
  return found
}

const Missing = z.object({ hashes: z.array(z.string().regex(HASH)).max(1000) })

const Remove = z.object({
  projects: z.array(z.string().min(1).max(200)).min(1).max(1000),
})

/** Statements run together in one batch, at most: D1 takes so many at once. */
const BATCH = 50

const Snapshot = z.object({
  project: z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(500),
  }),
  files: z
    .array(
      z.object({
        // a path within the project: no way out of it, nor to the top of the disk
        path: z
          .string()
          .min(1)
          .max(1024)
          .refine(
            (path) =>
              !path.startsWith("/") &&
              !path.includes("\\") &&
              !path.split("/").some((part) => part === ".." || part === ""),
            "not a path within the project"
          ),
        hash: z.string().regex(HASH),
        size: z.number().int().min(0).max(FILE_LIMIT),
      })
    )
    .max(50_000),
})

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** A request under /v1/backup, from the account signed in as `user`. */
export async function backup(
  request: Request,
  env: Env,
  path: string,
  user: string
): Promise<Response> {
  if (path === "/v1/backup/missing" && request.method === "POST") {
    const asked = Missing.safeParse(await request.json().catch(() => null))
    if (!asked.success)
      return refuse(400, "BAD_REQUEST", "Those aren't file hashes.")
    const hashes = [...new Set(asked.data.hashes)]
    const have = await kept(env, user, hashes)
    return json({ missing: hashes.filter((hash) => !have.has(hash)) })
  }

  const file = /^\/v1\/backup\/files\/([0-9a-f]{64})$/.exec(path)
  if (file && request.method === "PUT") {
    const hash = file[1]
    const size = Number(request.headers.get("content-length"))
    if (!request.body || !Number.isInteger(size) || size < 0)
      return refuse(411, "LENGTH_REQUIRED", "Say how big the file is.")
    if (size > FILE_LIMIT)
      return refuse(413, "TOO_BIG", "That file is too big to back up.", {
        limit: FILE_LIMIT,
      })
    if ((await kept(env, user, [hash])).has(hash)) {
      // (kept already: what was sent is let be)
      await request.body.cancel()
      return json({ size })
    }
    const used = await usedBy(env, user)
    if (used + size > STORAGE_LIMIT) {
      await request.body.cancel()
      return refuse(413, "FULL", "Your account has no room for that.", {
        used,
        limit: STORAGE_LIMIT,
      })
    }
    const all = await env.DB.prepare(
      `select coalesce(sum("size"), 0) as used from "file"`
    ).first<{ used: number }>()
    if ((all?.used ?? 0) + size > SERVICE_LIMIT) {
      await request.body.cancel()
      return refuse(
        507,
        "SERVICE_FULL",
        "Enclose Cloud isn't taking more files right now. Try again later."
      )
    }
    // (R2 checks what it was sent is that hash, and keeps nothing where it isn't)
    try {
      await env.FILES.put(fileKey(user, hash), request.body, { sha256: hash })
    } catch {
      return refuse(400, "NOT_THAT_FILE", "That file isn't what its hash says.")
    }
    await env.DB.prepare(
      `insert or ignore into "file" ("userId", "hash", "size", "createdAt") values (?, ?, ?, ?)`
    )
      .bind(user, hash, size, Date.now())
      .run()
    return json({ size })
  }

  if (path === "/v1/backup/snapshots" && request.method === "POST") {
    const asked = Snapshot.safeParse(await request.json().catch(() => null))
    if (!asked.success)
      return refuse(400, "BAD_REQUEST", "That isn't a project's files.")
    const { project, files } = asked.data
    const hashes = [...new Set(files.map((one) => one.hash))]
    const have = await kept(env, user, hashes)
    const missing = hashes.filter((hash) => !have.has(hash))
    if (missing.length)
      return refuse(409, "MISSING", "Some of those files aren't kept yet.", {
        missing,
      })
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1))
    const text = JSON.stringify({ project, files: sorted })
    const manifest = await sha256(JSON.stringify(sorted))
    // (the project as it was last time: nothing new to keep of it)
    const last = await env.DB.prepare(
      `select "id", "manifest" from "snapshot" where "userId" = ? and "projectId" = ? order by "createdAt" desc limit 1`
    )
      .bind(user, project.id)
      .first<{ id: string; manifest: string }>()
    if (last?.manifest === manifest) return json({ id: last.id, new: false })
    const id = crypto.randomUUID()
    // which files the project uses, as long as it is kept (for removeProjects)
    const uses: D1PreparedStatement[] = []
    for (let at = 0; at < hashes.length; at += BOUND / 3) {
      const some = hashes.slice(at, at + BOUND / 3)
      uses.push(
        env.DB.prepare(
          `insert or ignore into "project_file" ("userId", "projectId", "hash") values ${some.map(() => "(?, ?, ?)").join(", ")}`
        ).bind(...some.flatMap((hash) => [user, project.id, hash]))
      )
    }
    for (let at = 0; at < uses.length; at += BATCH)
      await env.DB.batch(uses.slice(at, at + BATCH))
    await env.FILES.put(snapshotKey(user, id), text, {
      httpMetadata: { contentType: "application/json" },
    })
    await env.DB.prepare(
      `insert into "snapshot" ("id", "userId", "projectId", "name", "manifest", "files", "bytes", "createdAt") values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        user,
        project.id,
        project.name,
        manifest,
        files.length,
        files.reduce((sum, one) => sum + one.size, 0),
        Date.now()
      )
      .run()
    return json({ id, new: true })
  }

  if (path === "/v1/backup/projects" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `select "projectId" as id, "name", "files", "bytes", "createdAt" as at from "snapshot" s where "userId" = ? and "createdAt" = (select max("createdAt") from "snapshot" where "userId" = s."userId" and "projectId" = s."projectId") order by "bytes" desc`
    )
      .bind(user)
      .all<{
        id: string
        name: string
        files: number
        bytes: number
        at: number
      }>()
    return json({ projects: results })
  }

  if (path === "/v1/backup/remove" && request.method === "POST") {
    const asked = Remove.safeParse(await request.json().catch(() => null))
    if (!asked.success)
      return refuse(400, "BAD_REQUEST", "Those aren't projects.")
    const freed = await removeProjects(env, user, asked.data.projects)
    return json({ freed })
  }

  return refuse(404, "NOT_FOUND", "Not found.")
}

/**
 * Projects taken off Enclose Cloud: their snapshots, and every file none of the account's
 * other projects has used. How many bytes that frees.
 */
export async function removeProjects(
  env: Env,
  user: string,
  projects: string[]
): Promise<number> {
  for (let at = 0; at < projects.length; at += BOUND - 1) {
    const some = projects.slice(at, at + BOUND - 1)
    const marks = some.map(() => "?").join(",")
    const { results } = await env.DB.prepare(
      `select "id" from "snapshot" where "userId" = ? and "projectId" in (${marks})`
    )
      .bind(user, ...some)
      .all<{ id: string }>()
    for (let one = 0; one < results.length; one += 1000)
      await env.FILES.delete(
        results.slice(one, one + 1000).map((row) => snapshotKey(user, row.id))
      )
    await env.DB.batch([
      env.DB.prepare(
        `delete from "snapshot" where "userId" = ? and "projectId" in (${marks})`
      ).bind(user, ...some),
      env.DB.prepare(
        `delete from "project_file" where "userId" = ? and "projectId" in (${marks})`
      ).bind(user, ...some),
    ])
  }
  // what no project uses any more
  const { results: unused } = await env.DB.prepare(
    `select "hash", "size" from "file" f where "userId" = ? and not exists (select 1 from "project_file" p where p."userId" = f."userId" and p."hash" = f."hash")`
  )
    .bind(user)
    .all<{ hash: string; size: number }>()
  for (let at = 0; at < unused.length; at += 1000)
    await env.FILES.delete(
      unused.slice(at, at + 1000).map((row) => fileKey(user, row.hash))
    )
  const drops: D1PreparedStatement[] = []
  for (let at = 0; at < unused.length; at += BOUND - 1) {
    const some = unused.slice(at, at + BOUND - 1).map((row) => row.hash)
    drops.push(
      env.DB.prepare(
        `delete from "file" where "userId" = ? and "hash" in (${some.map(() => "?").join(",")})`
      ).bind(user, ...some)
    )
  }
  for (let at = 0; at < drops.length; at += BATCH)
    await env.DB.batch(drops.slice(at, at + BATCH))
  return unused.reduce((sum, row) => sum + row.size, 0)
}

/** Everything an account keeps on Enclose Cloud, deleted (as the account is). */
export async function removeAll(env: Env, user: string): Promise<void> {
  let cursor: string | undefined
  do {
    const listed = await env.FILES.list({ prefix: `u/${user}/`, cursor })
    if (listed.objects.length)
      await env.FILES.delete(listed.objects.map((one) => one.key))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
  await env.DB.batch([
    env.DB.prepare(`delete from "file" where "userId" = ?`).bind(user),
    env.DB.prepare(`delete from "snapshot" where "userId" = ?`).bind(user),
    env.DB.prepare(`delete from "project_file" where "userId" = ?`).bind(user),
  ])
}
