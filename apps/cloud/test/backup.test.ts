// Backing a project up on Enclose Cloud, as the app does it: which files are missing,
// each sent once, then the project as it is; how much the account keeps, as it is told;
// and all of it gone with the account.
import { env } from "cloudflare:test"
import { exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { STORAGE_LIMIT } from "../src/account"
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
    expect(
      await env.FILES.get(`u/${await userOf(token)}/snapshots/${id}.json`)
    ).not.toBeNull()

    // nothing changed: nothing new kept
    const again = (await (await snapshot(token, files)).json()) as {
      id: string
      new: boolean
    }
    expect(again).toEqual({ id, new: false })

    expect(await account(token)).toMatchObject({
      storage: { used: model.length + readme.length },
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
    await env.DB.prepare(
      `insert into "file" ("userId", "hash", "size", "createdAt") values (?, ?, ?, ?)`
    )
      .bind(user, "f".repeat(64), STORAGE_LIMIT - 3, Date.now())
      .run()
    const response = await send(token, await hashOf("four"), "four")
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: "FULL" })
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
