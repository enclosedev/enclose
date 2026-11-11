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
// (migrations/): an account may keep STORAGE_LIMIT, files and snapshots together, and all
// of them SERVICE_LIMIT. The room is taken (`usage`) before anything is kept, so that
// uploads at once cannot both have the last of it. Deleting the account deletes all of it
// (removeAll).
import { z } from "zod"

import { FILE_LIMIT, SERVICE_LIMIT, STORAGE_LIMIT } from "./account"

const HASH = /^[0-9a-f]{64}$/
/** How many hashes go to D1 in one value (as JSON): it takes no string over 2 MB. */
const HASHES_AT_ONCE = 20_000
/** How many snapshots of each project are kept: the oldest go, past these. */
export const SNAPSHOTS_KEPT = 30
/** How many projects an account may back up. */
export const PROJECTS_LIMIT = 500
/** How big a request's JSON may be, bytes: a snapshot's, and every other's. */
const SNAPSHOT_BODY = 10 * 1024 ** 2
const OTHER_BODY = 256 * 1024
const HOUR = 60 * 60 * 1000
/** The row of `usage` that is all accounts together. */
const ALL = "*"

const fileKey = (user: string, hash: string) => `u/${user}/files/${hash}`
const snapshotKey = (user: string, id: string) =>
  `u/${user}/snapshots/${id}.json`

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } })

const refuse = (status: number, code: string, message: string, more = {}) =>
  json({ code, message, ...more }, status)

/** A request's JSON, where it says so and is no bigger than `most` bytes: null otherwise. */
async function bodyOf(request: Request, most: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    return null
  const size = Number(request.headers.get("content-length"))
  if (!Number.isInteger(size) || size > most) return null
  return request.json().catch(() => null)
}

/** How much an account keeps, in bytes. */
export async function usedBy(env: Env, user: string): Promise<number> {
  const row = await env.DB.prepare(
    `select "used" from "usage" where "userId" = ?`
  )
    .bind(user)
    .first<{ used: number }>()
  return row?.used ?? 0
}

/**
 * Take `bytes` of an account's room, and of the service's: whether there was room in both
 * (and if not, nothing is taken).
 */
async function reserve(
  env: Env,
  user: string,
  bytes: number
): Promise<"ok" | "full" | "service-full"> {
  await env.DB.batch([
    env.DB.prepare(
      `insert or ignore into "usage" ("userId", "used") values (?, 0), (?, 0)`
    ).bind(user, ALL),
  ])
  const take = `update "usage" set "used" = "used" + ?1 where "userId" = ?2 and "used" + ?1 <= ?3`
  const mine = await env.DB.prepare(take).bind(bytes, user, STORAGE_LIMIT).run()
  if (!mine.meta.changes) return "full"
  const all = await env.DB.prepare(take).bind(bytes, ALL, SERVICE_LIMIT).run()
  if (!all.meta.changes) {
    await release(env, user, bytes, false)
    return "service-full"
  }
  return "ok"
}

/** Give back `bytes` of an account's room (and of the service's). */
async function release(env: Env, user: string, bytes: number, all = true) {
  if (bytes <= 0) return
  await env.DB.prepare(
    `update "usage" set "used" = max(0, "used" - ?) where "userId" in (?, ?)`
  )
    .bind(bytes, user, all ? ALL : user)
    .run()
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
  for (let at = 0; at < hashes.length; at += HASHES_AT_ONCE) {
    const { results } = await env.DB.prepare(
      `select "hash" from "file" where "userId" = ? and "hash" in (select value from json_each(?))`
    )
      .bind(user, JSON.stringify(hashes.slice(at, at + HASHES_AT_ONCE)))
      .all<{ hash: string }>()
    for (const row of results) found.add(row.hash)
  }
  return found
}

const Missing = z.object({ hashes: z.array(z.string().regex(HASH)).max(1000) })

const Remove = z.object({
  projects: z.array(z.string().min(1).max(200)).min(1).max(1000),
})

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
              !/^[A-Za-z]:/.test(path) &&
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
    const asked = Missing.safeParse(await bodyOf(request, OTHER_BODY))
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
    const room = await reserve(env, user, size)
    if (room !== "ok") {
      await request.body.cancel()
      return room === "full"
        ? refuse(413, "FULL", "Your account has no room for that.", {
            used: await usedBy(env, user),
            limit: STORAGE_LIMIT,
          })
        : refuse(
            507,
            "SERVICE_FULL",
            "Enclose Cloud isn't taking more files right now. Try again later."
          )
    }
    // (R2 checks what it was sent is that hash, and keeps nothing where it isn't)
    try {
      await env.FILES.put(fileKey(user, hash), request.body, { sha256: hash })
    } catch {
      await release(env, user, size)
      return refuse(400, "NOT_THAT_FILE", "That file isn't what its hash says.")
    }
    const added = await env.DB.prepare(
      `insert or ignore into "file" ("userId", "hash", "size", "createdAt") values (?, ?, ?, ?)`
    )
      .bind(user, hash, size, Date.now())
      .run()
    // (the same file, sent at the same time by another upload, is kept, and counted, once)
    if (!added.meta.changes) await release(env, user, size)
    return json({ size })
  }

  if (path === "/v1/backup/snapshots" && request.method === "POST") {
    const asked = Snapshot.safeParse(await bodyOf(request, SNAPSHOT_BODY))
    if (!asked.success)
      return refuse(400, "BAD_REQUEST", "That isn't a project's files.")
    const { project, files } = asked.data
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1))
    const manifest = await sha256(JSON.stringify(sorted))
    // (the project as it was last time: nothing new to keep of it)
    const last = await env.DB.prepare(
      `select "id", "manifest" from "snapshot" where "userId" = ? and "projectId" = ? order by "createdAt" desc limit 1`
    )
      .bind(user, project.id)
      .first<{ id: string; manifest: string }>()
    if (last?.manifest === manifest) return json({ id: last.id, new: false })
    if (!last) {
      const { projects } = await backedUp(env, user)
      if (projects >= PROJECTS_LIMIT)
        return refuse(
          409,
          "TOO_MANY_PROJECTS",
          `An account can back up ${PROJECTS_LIMIT} projects.`
        )
    }
    // Which files the project uses, said before they are looked for: a project taken off
    // Enclose Cloud meanwhile (removeProjects) then leaves them be.
    const hashes = [...new Set(files.map((one) => one.hash))]
    const now = Date.now()
    for (let at = 0; at < hashes.length; at += HASHES_AT_ONCE)
      await env.DB.prepare(
        `insert into "project_file" ("userId", "projectId", "hash", "lastSeen") select ?, ?, value, ? from json_each(?) where true on conflict ("userId", "projectId", "hash") do update set "lastSeen" = excluded."lastSeen"`
      )
        .bind(
          user,
          project.id,
          now,
          JSON.stringify(hashes.slice(at, at + HASHES_AT_ONCE))
        )
        .run()
    const have = await kept(env, user, hashes)
    const missing = hashes.filter((hash) => !have.has(hash))
    if (missing.length)
      return refuse(409, "MISSING", "Some of those files aren't kept yet.", {
        missing,
      })
    const text = JSON.stringify({ project, files: sorted })
    const size = new TextEncoder().encode(text).length
    const room = await reserve(env, user, size)
    if (room !== "ok")
      return room === "full"
        ? refuse(413, "FULL", "Your account has no room for that.", {
            used: await usedBy(env, user),
            limit: STORAGE_LIMIT,
          })
        : refuse(
            507,
            "SERVICE_FULL",
            "Enclose Cloud isn't taking more files right now. Try again later."
          )
    const id = crypto.randomUUID()
    await env.FILES.put(snapshotKey(user, id), text, {
      httpMetadata: { contentType: "application/json" },
    })
    await env.DB.prepare(
      `insert into "snapshot" ("id", "userId", "projectId", "name", "manifest", "files", "bytes", "size", "createdAt") values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        user,
        project.id,
        project.name,
        manifest,
        files.length,
        files.reduce((sum, one) => sum + one.size, 0),
        size,
        now
      )
      .run()
    await prune(env, user, project.id)
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
    const asked = Remove.safeParse(await bodyOf(request, OTHER_BODY))
    if (!asked.success)
      return refuse(400, "BAD_REQUEST", "Those aren't projects.")
    const freed = await removeProjects(env, user, asked.data.projects)
    return json({ freed })
  }

  return refuse(404, "NOT_FOUND", "Not found.")
}

/**
 * The oldest snapshots of a project, past SNAPSHOTS_KEPT, gone, and the files only they
 * had: those none of the snapshots kept has used (`lastSeen` before the oldest of them),
 * and no other project uses (collect).
 */
async function prune(env: Env, user: string, project: string) {
  const { results: old } = await env.DB.prepare(
    `select "id", "size" from "snapshot" where "userId" = ? and "projectId" = ? order by "createdAt" desc limit -1 offset ?`
  )
    .bind(user, project, SNAPSHOTS_KEPT)
    .all<{ id: string; size: number }>()
  if (!old.length) return
  await env.DB.prepare(
    `delete from "snapshot" where "userId" = ? and "id" in (select value from json_each(?))`
  )
    .bind(user, JSON.stringify(old.map((row) => row.id)))
    .run()
  await env.FILES.delete(old.map((row) => snapshotKey(user, row.id)))
  await release(
    env,
    user,
    old.reduce((sum, row) => sum + row.size, 0)
  )
  const oldest = await env.DB.prepare(
    `select min("createdAt") as at from "snapshot" where "userId" = ? and "projectId" = ?`
  )
    .bind(user, project)
    .first<{ at: number | null }>()
  if (oldest?.at === null || oldest?.at === undefined) return
  await env.DB.prepare(
    `delete from "project_file" where "userId" = ? and "projectId" = ? and "lastSeen" < ?`
  )
    .bind(user, project, oldest.at)
    .run()
  // (a file sent this last while, for a snapshot yet to come, is let be)
  await collect(env, user, Date.now() - HOUR)
}

/**
 * Every file of the account's that no project uses any more (and, where `before` is said,
 * that was sent before then), gone: what says it is kept first, and what is kept after,
 * so that cut short in between, a file is left over, never missed. How many bytes that
 * frees.
 */
async function collect(
  env: Env,
  user: string,
  before = Number.POSITIVE_INFINITY
): Promise<number> {
  const { results: unused } = await env.DB.prepare(
    `select "hash", "size" from "file" f where "userId" = ? and "createdAt" < ? and not exists (select 1 from "project_file" p where p."userId" = f."userId" and p."hash" = f."hash")`
  )
    .bind(user, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER)
    .all<{ hash: string; size: number }>()
  for (let at = 0; at < unused.length; at += HASHES_AT_ONCE)
    await env.DB.prepare(
      `delete from "file" where "userId" = ? and "hash" in (select value from json_each(?))`
    )
      .bind(
        user,
        JSON.stringify(
          unused.slice(at, at + HASHES_AT_ONCE).map((row) => row.hash)
        )
      )
      .run()
  const keys = unused.map((row) => fileKey(user, row.hash))
  for (let at = 0; at < keys.length; at += 1000)
    await env.FILES.delete(keys.slice(at, at + 1000))
  const freed = unused.reduce((sum, row) => sum + row.size, 0)
  await release(env, user, freed)
  return freed
}

/**
 * Projects taken off Enclose Cloud: their snapshots, and every file none of the account's
 * other projects has used. How many bytes that frees. (What says what is kept goes first,
 * and what is kept after: cut short in between, a file is left over, never missed.)
 */
export async function removeProjects(
  env: Env,
  user: string,
  projects: string[]
): Promise<number> {
  const ids = JSON.stringify([...new Set(projects)])
  const { results: snapshots } = await env.DB.prepare(
    `select "id", "size" from "snapshot" where "userId" = ? and "projectId" in (select value from json_each(?))`
  )
    .bind(user, ids)
    .all<{ id: string; size: number }>()
  await env.DB.batch([
    env.DB.prepare(
      `delete from "snapshot" where "userId" = ? and "projectId" in (select value from json_each(?))`
    ).bind(user, ids),
    env.DB.prepare(
      `delete from "project_file" where "userId" = ? and "projectId" in (select value from json_each(?))`
    ).bind(user, ids),
  ])
  for (let at = 0; at < snapshots.length; at += 1000)
    await env.FILES.delete(
      snapshots.slice(at, at + 1000).map((row) => snapshotKey(user, row.id))
    )
  await release(
    env,
    user,
    snapshots.reduce((sum, row) => sum + row.size, 0)
  )
  // what no project uses any more
  const freed = await collect(env, user)
  return freed
}

/** Everything an account keeps on Enclose Cloud, deleted (as the account is). */
export async function removeAll(env: Env, user: string): Promise<void> {
  const used = await usedBy(env, user)
  await env.DB.batch([
    env.DB.prepare(`delete from "file" where "userId" = ?`).bind(user),
    env.DB.prepare(`delete from "snapshot" where "userId" = ?`).bind(user),
    env.DB.prepare(`delete from "project_file" where "userId" = ?`).bind(user),
    env.DB.prepare(`delete from "usage" where "userId" = ?`).bind(user),
    env.DB.prepare(
      `update "usage" set "used" = max(0, "used" - ?) where "userId" = ?`
    ).bind(used, ALL),
  ])
  let cursor: string | undefined
  do {
    const listed = await env.FILES.list({ prefix: `u/${user}/`, cursor })
    if (listed.objects.length)
      await env.FILES.delete(listed.objects.map((one) => one.key))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
}
