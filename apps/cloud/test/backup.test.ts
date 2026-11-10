// Backing a project up on Enclose Cloud, as the app does it: which files are missing,
// each sent once, then the project as it is; how much the account keeps, as it is told;
// and all of it gone with the account.
import { env } from "cloudflare:test"
import { exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { STORAGE_LIMIT } from "../src/account"
import { SNAPSHOTS_KEPT } from "../src/backup"
import { outbox } from "../src/email"

const BASE = "http://localhost:8787"
const PAGE = { origin: BASE, "content-type": "application/json" }

let from = ""
beforeEach(() => {
  from = `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
})

const call = (path: string, init?: RequestInit) => {
  const request = new Request(`${BASE}${path}`, init)
  request.headers.set("cf-connecting-ip", from)
  return exports.default.fetch(request)
}

/** Signed in, by an email's code: the session's token. */
async function signedIn(email: string): Promise<string> {
  await call("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: PAGE,
    body: JSON.stringify({ email, type: "sign-in" }),
  })
  const response = await call("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: PAGE,
    body: JSON.stringify({ email, otp: outbox.get(email) }),
  })
  return ((await response.json()) as { token: string }).token
}

const as = (token: string, more: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  ...more,
})

async function hashOf(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

const missing = (token: string, hashes: string[]) =>
  call("/v1/backup/missing", {
    method: "POST",
    headers: as(token, { "content-type": "application/json" }),
    body: JSON.stringify({ hashes }),
  })

const send = (token: string, hash: string, text: string) =>
  call(`/v1/backup/files/${hash}`, {
    method: "PUT",
    headers: as(token, {
      "content-length": String(new TextEncoder().encode(text).length),
    }),
    body: text,
  })

const snapshot = (
  token: string,
  files: { path: string; hash: string; size: number }[]
) =>
  call("/v1/backup/snapshots", {
    method: "POST",
    headers: as(token, { "content-type": "application/json" }),
    body: JSON.stringify({ project: { id: "p1", name: "Stool" }, files }),
  })

const account = async (token: string) =>
  (await (await call("/v1/account", { headers: as(token) })).json()) as {
    storage: { used: number; limit: number }
    backup: { projects: number; at: number | null }
  }

describe("backing up", () => {
  it("is told of only to the account signed in", async () => {
    expect((await missing("nobody", [])).status).toBe(401)
  })

  it("keeps each file once, then the project as it is", async () => {
    const token = await signedIn("backs-up@example.com")
    expect(await account(token)).toMatchObject({
      storage: { used: 0, limit: STORAGE_LIMIT },
      backup: { projects: 0, at: null },
    })

    const model = "from enclose import *\n"
    const readme = "# Stool\n"
    const files = [
      { path: "model.py", hash: await hashOf(model), size: model.length },
      { path: "README.md", hash: await hashOf(readme), size: readme.length },
    ]
    const asked = await missing(
      token,
      files.map((one) => one.hash)
    )
    expect(
      ((await asked.json()) as { missing: string[] }).missing
    ).toHaveLength(2)

    // a project is not kept before its files are
    const early = await snapshot(token, files)
    expect(early.status).toBe(409)

    expect((await send(token, files[0].hash, model)).status).toBe(200)
    expect((await send(token, files[1].hash, readme)).status).toBe(200)
    // sent again: kept once
    expect((await send(token, files[1].hash, readme)).status).toBe(200)
    const now = await missing(
      token,
      files.map((one) => one.hash)
    )
    expect(((await now.json()) as { missing: string[] }).missing).toEqual([])

    const made = await snapshot(token, files)
    expect(made.status).toBe(200)
    const { id } = (await made.json()) as { id: string }
    const user = await userOf(token)
    expect(await env.FILES.get(`u/${user}/snapshots/${id}.json`)).not.toBeNull()

    // nothing changed: nothing new kept
    const again = (await (await snapshot(token, files)).json()) as {
      id: string
      new: boolean
    }
    expect(again).toEqual({ id, new: false })

    // the files, and the snapshot, each counted once
    expect(await account(token)).toMatchObject({
      storage: {
        used: model.length + readme.length + (await snapshotsTake(user)),
      },
      backup: { projects: 1, at: expect.any(Number) },
    })
  })

  it("keeps nothing that isn't what its hash says", async () => {
    const token = await signedIn("liar@example.com")
    const response = await send(token, await hashOf("this"), "not this")
    expect(response.status).toBe(400)
    expect((await account(token)).storage.used).toBe(0)
  })

  it("takes no more than the account has room for", async () => {
    const token = await signedIn("full@example.com")
    const user = await userOf(token)
    await env.DB.prepare(`insert into "usage" ("userId", "used") values (?, ?)`)
      .bind(user, STORAGE_LIMIT - 3)
      .run()
    const response = await send(token, await hashOf("four"), "four")
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: "FULL" })
  })

  it("lets no two uploads at once have the same last of the room", async () => {
    const token = await signedIn("race@example.com")
    const user = await userOf(token)
    await env.DB.prepare(`insert into "usage" ("userId", "used") values (?, ?)`)
      .bind(user, STORAGE_LIMIT - 10)
      .run()
    // six files of 4 bytes at once, with room for two
    const texts = ["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff"]
    const sent = await Promise.all(
      texts.map(
        async (text) => (await send(token, await hashOf(text), text)).status
      )
    )
    expect(sent.filter((status) => status === 200)).toHaveLength(2)
    expect(sent.filter((status) => status === 413)).toHaveLength(4)
    expect((await account(token)).storage.used).toBe(STORAGE_LIMIT - 2)
  })

  it("takes no JSON that is too big, or isn't said to be JSON", async () => {
    const token = await signedIn("big@example.com")
    const tooBig = await call("/v1/backup/missing", {
      method: "POST",
      headers: as(token, { "content-type": "application/json" }),
      body: JSON.stringify({ hashes: ["x".repeat(300 * 1024)] }),
    })
    expect(tooBig.status).toBe(400)
    const plain = await call("/v1/backup/missing", {
      method: "POST",
      headers: as(token, { "content-type": "text/plain" }),
      body: JSON.stringify({ hashes: [] }),
    })
    expect(plain.status).toBe(400)
  })

  it("is not reached with the sign-in page's cookie, only the app's token", async () => {
    const email = "cookie@example.com"
    await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email, type: "sign-in" }),
    })
    const signed = await call("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email, otp: outbox.get(email) }),
    })
    const cookie = signed.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ")
    expect(cookie).toContain("session_token")
    const byCookie = await call("/v1/backup/projects", { headers: { cookie } })
    expect(byCookie.status).toBe(401)
  })

  it("keeps the last snapshots of a project, and lets the oldest go", async () => {
    const token = await signedIn("history@example.com")
    const user = await userOf(token)
    const hash = await hashOf("v")
    await send(token, hash, "v")
    for (let version = 0; version < SNAPSHOTS_KEPT + 3; version++)
      await snapshot(token, [{ path: `v${version}.txt`, hash, size: 1 }])
    const rows = await env.DB.prepare(
      `select count(*) as n from "snapshot" where "userId" = ?`
    )
      .bind(user)
      .first<{ n: number }>()
    expect(rows?.n).toBe(SNAPSHOTS_KEPT)
    const listed = await env.FILES.list({ prefix: `u/${user}/snapshots/` })
    expect(listed.objects).toHaveLength(SNAPSHOTS_KEPT)
    // what it counts is the file, and the snapshots kept
    expect((await account(token)).storage.used).toBe(
      1 + (await snapshotsTake(user))
    )
  })

  it("keeps no path that leads out of the project", async () => {
    const token = await signedIn("paths@example.com")
    const hash = await hashOf("x")
    await send(token, hash, "x")
    for (const path of ["../x", "/etc/x", "a//b", "a\\b"])
      expect((await snapshot(token, [{ path, hash, size: 1 }])).status).toBe(
        400
      )
  })

  it("is all gone with the account", async () => {
    const token = await signedIn("goes@example.com")
    const user = await userOf(token)
    const hash = await hashOf("kept")
    await send(token, hash, "kept")
    await snapshot(token, [{ path: "kept.txt", hash, size: 4 }])
    expect(
      (await env.FILES.list({ prefix: `u/${user}/` })).objects.length
    ).toBe(2)

    const deleted = await call("/api/auth/delete-user", {
      method: "POST",
      headers: as(token, { "content-type": "application/json" }),
      body: "{}",
    })
    expect(deleted.status).toBe(200)
    expect(
      (await env.FILES.list({ prefix: `u/${user}/` })).objects.length
    ).toBe(0)
    const rows = await env.DB.prepare(
      `select count(*) as n from "file" where "userId" = ?`
    )
      .bind(user)
      .first<{ n: number }>()
    expect(rows?.n).toBe(0)
  })
})

async function userOf(token: string): Promise<string> {
  const response = await call("/v1/account", { headers: as(token) })
  return ((await response.json()) as { user: { id: string } }).user.id
}

describe("taking projects off Enclose Cloud", () => {
  const keep = (
    token: string,
    id: string,
    files: { path: string; hash: string; size: number }[]
  ) =>
    call("/v1/backup/snapshots", {
      method: "POST",
      headers: as(token, { "content-type": "application/json" }),
      body: JSON.stringify({ project: { id, name: id.toUpperCase() }, files }),
    })

  it("lists each project as last backed up, and frees what only it used", async () => {
    const token = await signedIn("removes@example.com")
    const user = await userOf(token)
    const shared = { path: "LICENSE", hash: await hashOf("shared"), size: 6 }
    const own = { path: "a.step", hash: await hashOf("only a's"), size: 8 }
    const other = { path: "b.step", hash: await hashOf("b's"), size: 3 }
    for (const [hash, text] of [
      [shared.hash, "shared"],
      [own.hash, "only a's"],
      [other.hash, "b's"],
    ])
      await send(token, hash, text)
    await keep(token, "a", [shared, own])
    await keep(token, "b", [shared, other])

    const listed = await call("/v1/backup/projects", { headers: as(token) })
    const { projects } = (await listed.json()) as {
      projects: { id: string; name: string; bytes: number }[]
    }
    expect(projects).toMatchObject([
      { id: "a", name: "A", bytes: 14 },
      { id: "b", name: "B", bytes: 9 },
    ])

    const removed = await call("/v1/backup/remove", {
      method: "POST",
      headers: as(token, { "content-type": "application/json" }),
      body: JSON.stringify({ projects: ["a"] }),
    })
    expect(await removed.json()).toEqual({ freed: 8 })

    // b's files, the shared one with them, are all still there
    const left = (await (
      await missing(token, [shared.hash, own.hash, other.hash])
    ).json()) as {
      missing: string[]
    }
    expect(left.missing).toEqual([own.hash])
    expect(await env.FILES.get(`u/${user}/files/${own.hash}`)).toBeNull()
    expect(await env.FILES.get(`u/${user}/files/${shared.hash}`)).not.toBeNull()
    expect(await account(token)).toMatchObject({
      storage: { used: 9 + (await snapshotsTake(user)) },
      backup: { projects: 1 },
    })
  })
})

/** What an account's snapshots take, as kept. */
async function snapshotsTake(user: string): Promise<number> {
  const row = await env.DB.prepare(
    `select coalesce(sum("size"), 0) as size from "snapshot" where "userId" = ?`
  )
    .bind(user)
    .first<{ size: number }>()
  return row?.size ?? 0
}

describe("letting old versions go", () => {
  it("deletes the files only the snapshots let go of had, and frees their room", async () => {
    const token = await signedIn("versions@example.com")
    const user = await userOf(token)
    const versions = SNAPSHOTS_KEPT + 3
    const hashes: string[] = []
    for (let version = 0; version < versions; version++) {
      const text = `version ${version}`
      hashes.push(await hashOf(text))
      await send(token, hashes[version], text)
    }
    for (let version = 0; version < versions - 1; version++)
      await snapshot(token, [
        { path: "part.step", hash: hashes[version], size: 9 },
      ])
    // sent a while ago, and so no longer waiting on a snapshot to come
    await env.DB.prepare(`update "file" set "createdAt" = 0 where "userId" = ?`)
      .bind(user)
      .run()
    await snapshot(token, [
      { path: "part.step", hash: hashes[versions - 1], size: 9 },
    ])

    const asked = (await (await missing(token, hashes)).json()) as {
      missing: string[]
    }
    expect(asked.missing.sort()).toEqual(hashes.slice(0, 3).sort())
    for (const hash of hashes.slice(0, 3))
      expect(await env.FILES.get(`u/${user}/files/${hash}`)).toBeNull()
    expect(await env.FILES.get(`u/${user}/files/${hashes[3]}`)).not.toBeNull()
    // the versions kept, each as long as it is
    let kept = 0
    for (let version = 3; version < versions; version++)
      kept += `version ${version}`.length
    expect((await account(token)).storage.used).toBe(
      kept + (await snapshotsTake(user))
    )
  })
})

describe("restoring", () => {
  it("gives a project back as last backed up, and its files, to its own account alone", async () => {
    const token = await signedIn("restores@example.com")
    const model = "from enclose import *\n"
    const hash = await hashOf(model)
    await send(token, hash, model)
    await snapshot(token, [{ path: "model.py", hash, size: model.length }])

    const project = await call("/v1/backup/projects/p1", { headers: as(token) })
    expect(project.status).toBe(200)
    expect(await project.json()).toEqual({
      project: { id: "p1", name: "Stool" },
      files: [{ path: "model.py", hash, size: model.length }],
    })
    const file = await call(`/v1/backup/files/${hash}`, { headers: as(token) })
    expect(file.status).toBe(200)
    expect(file.headers.get("content-length")).toBe(String(model.length))
    expect(await file.text()).toBe(model)

    // another account, though it knows the hash and the project's id
    const other = await signedIn("someone-else@example.com")
    expect(
      (await call("/v1/backup/projects/p1", { headers: as(other) })).status
    ).toBe(404)
    expect(
      (await call(`/v1/backup/files/${hash}`, { headers: as(other) })).status
    ).toBe(404)
  })
})
