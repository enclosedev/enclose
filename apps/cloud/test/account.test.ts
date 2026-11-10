// Signing in as the app does it: the sign-in page opened with what the app proves itself
// with later, the code sent to the email, the link the page hands back, and the session
// the app gets for it; then the account read, signed out of, and deleted.
import { env } from "cloudflare:test"
import { exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"

import { outbox } from "../src/email"

const BASE = "http://localhost:8787"
/** what the sign-in page's own requests come with */
const PAGE = { origin: BASE, "content-type": "application/json" }
/** and the app's */
const APP = { origin: "enclose://", "content-type": "application/json" }

/**
 * The address requests come from, as Cloudflare says (rate limits are counted for each):
 * a test of its own for each, so the tests do not count against each other.
 */
let from = ""
beforeEach(() => {
  from = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
})

const call = (path: string, init?: RequestInit) => {
  const request = new Request(`${BASE}${path}`, init)
  request.headers.set("cf-connecting-ip", from)
  return exports.default.fetch(request)
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")

/** What the app makes before it opens the page: the verifier stays with it. */
async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    )
  )
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)))
  return { verifier, challenge, state }
}

/** Through the page as a person would go: the email, then the code. */
async function throughPage(
  email: string,
  asked: Awaited<ReturnType<typeof pkce>>
) {
  const query = new URLSearchParams({
    client_id: "electron",
    state: asked.state,
    code_challenge: asked.challenge,
  })
  const sent = await call("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: PAGE,
    body: JSON.stringify({ email, type: "sign-in" }),
  })
  expect(sent.status).toBe(200)
  const otp = outbox.get(email)
  expect(otp).toMatch(/^\d{6}$/)
  const signedIn = await call(`/api/auth/sign-in/email-otp?${query}`, {
    method: "POST",
    headers: PAGE,
    body: JSON.stringify({ email, otp }),
  })
  expect(signedIn.status).toBe(200)
  const data = (await signedIn.json()) as {
    electron_authorization_code?: string
  }
  expect(data.electron_authorization_code).toBeTruthy()
  return data.electron_authorization_code!
}

/** The app, handed the link: its session, for the verifier only it has. */
async function exchange(identifier: string, state: string, verifier: string) {
  return call("/api/auth/electron/token", {
    method: "POST",
    headers: APP,
    body: JSON.stringify({ token: identifier, state, code_verifier: verifier }),
  })
}

async function signedIn(email: string) {
  const asked = await pkce()
  const identifier = await throughPage(email, asked)
  const response = await exchange(identifier, asked.state, asked.verifier)
  expect(response.status).toBe(200)
  const { token, user } = (await response.json()) as {
    token: string
    user: { email: string }
  }
  expect(user.email).toBe(email)
  return token
}

const account = (token: string) =>
  call("/v1/account", { headers: { authorization: `Bearer ${token}` } })

describe("signing in from the app", () => {
  it("serves the sign-in page, its script let run by a nonce alone", async () => {
    const response = await call(
      "/sign-in?client_id=electron&state=s&code_challenge=c"
    )
    expect(response.status).toBe(200)
    const policy = response.headers.get("content-security-policy") ?? ""
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1]
    expect(nonce).toBeTruthy()
    expect(policy).toContain("frame-ancestors 'none'")
    expect(await response.text()).toContain(`<script nonce="${nonce}">`)
  })

  it("makes an account of a new email, and tells the app of it", async () => {
    const token = await signedIn("new@example.com")
    const response = await account(token)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      user: { email: "new@example.com" },
      storage: { used: 0, limit: 5 * 1024 ** 3 },
    })
  })

  it("signs the same account in again, not another", async () => {
    await signedIn("twice@example.com")
    await signedIn("twice@example.com")
    const { results } = await env.DB.prepare(
      `select id from "user" where email = ?`
    )
      .bind("twice@example.com")
      .all()
    expect(results).toHaveLength(1)
  })

  it("gives nothing for a verifier the app did not make", async () => {
    const asked = await pkce()
    const identifier = await throughPage("verifier@example.com", asked)
    const other = await pkce()
    const response = await exchange(identifier, asked.state, other.verifier)
    expect(response.status).toBe(400)
  })

  it("hands the app the account the browser is signed in to already", async () => {
    // signed in on the page before, which the browser keeps a cookie of
    const email = "again@example.com"
    await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email, type: "sign-in" }),
    })
    const before = await call("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email, otp: outbox.get(email) }),
    })
    const cookie = before.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ")
    expect(cookie).toContain("session_token")

    // what the page asks first, to say who
    const session = await call("/api/auth/get-session", {
      headers: { cookie },
    })
    expect(await session.json()).toMatchObject({ user: { email } })

    // and, at "Continue", for the app
    const asked = await pkce()
    const query = new URLSearchParams({
      client_id: "electron",
      state: asked.state,
      code_challenge: asked.challenge,
    })
    const transfer = (headers: Record<string, string>) =>
      call(`/api/auth/electron/transfer-user?${query}`, {
        method: "POST",
        headers: { ...PAGE, ...headers },
        body: "{}",
      })
    expect((await transfer({})).status).toBe(401)
    const handed = await transfer({ cookie })
    expect(handed.status).toBe(200)
    const { electron_authorization_code: identifier } =
      (await handed.json()) as { electron_authorization_code: string }
    const app = await exchange(identifier, asked.state, asked.verifier)
    expect(app.status).toBe(200)
    expect(await app.json()).toMatchObject({ user: { email } })
  })

  it("gives a session once for each sign-in, and no more", async () => {
    const asked = await pkce()
    const identifier = await throughPage("once@example.com", asked)
    expect(
      (await exchange(identifier, asked.state, asked.verifier)).status
    ).toBe(200)
    expect(
      (await exchange(identifier, asked.state, asked.verifier)).status
    ).toBe(404)
  })

  it("does not sign in with a wrong code", async () => {
    const asked = await pkce()
    const query = new URLSearchParams({
      client_id: "electron",
      state: asked.state,
      code_challenge: asked.challenge,
    })
    await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email: "wrong@example.com", type: "sign-in" }),
    })
    const right = outbox.get("wrong@example.com")!
    const wrong = right === "000000" ? "111111" : "000000"
    const response = await call(`/api/auth/sign-in/email-otp?${query}`, {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email: "wrong@example.com", otp: wrong }),
    })
    expect(response.status).toBe(400)
  })

  it("keeps the code hashed, not as it was sent", async () => {
    await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({ email: "kept@example.com", type: "sign-in" }),
    })
    const code = outbox.get("kept@example.com")!
    const { results } = await env.DB.prepare(
      `select value from verification where identifier like ?`
    )
      .bind("%kept@example.com%")
      .all<{ value: string }>()
    expect(results.length).toBeGreaterThan(0)
    for (const row of results) expect(row.value).not.toContain(code)
  })

  it("says so where the code could not be sent", async () => {
    const sent = await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: PAGE,
      body: JSON.stringify({
        email: "nobody@nowhere.invalid",
        type: "sign-in",
      }),
    })
    expect(sent.status).toBe(502)
    expect(await sent.json()).toMatchObject({
      code: "CODE_NOT_SENT",
      message: expect.stringMatching(/couldn't send the code/),
    })
  })

  it("sends no more than a few codes a minute to anybody", async () => {
    const send = (email: string) =>
      call("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: PAGE,
        body: JSON.stringify({ email, type: "sign-in" }),
      })
    const statuses = []
    for (let i = 0; i < 5; i++)
      statuses.push((await send(`many${i}@example.com`)).status)
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses.at(-1)).toBe(429)
  })
})

describe("the account, once signed in", () => {
  it("is not told of without a session", async () => {
    expect((await call("/v1/account")).status).toBe(401)
    expect((await account("not-a-token")).status).toBe(401)
  })

  it("is signed out of", async () => {
    const token = await signedIn("out@example.com")
    const response = await call("/api/auth/sign-out", {
      method: "POST",
      headers: { ...APP, authorization: `Bearer ${token}` },
      body: "{}",
    })
    expect(response.status).toBe(200)
    expect((await account(token)).status).toBe(401)
  })

  it("is deleted, with what signed in to it", async () => {
    const token = await signedIn("gone@example.com")
    const response = await call("/api/auth/delete-user", {
      method: "POST",
      headers: { ...APP, authorization: `Bearer ${token}` },
      body: "{}",
    })
    expect(response.status).toBe(200)
    expect((await account(token)).status).toBe(401)
    const { results } = await env.DB.prepare(
      `select id from "user" where email = ?`
    )
      .bind("gone@example.com")
      .all()
    expect(results).toHaveLength(0)
  })
})
