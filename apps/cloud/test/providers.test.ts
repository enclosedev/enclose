// Signing in with Google or Apple from the app: the page starts it with what the app
// proves itself with later, the person comes back from Google or Apple to /sign-in/done,
// and what the electron plugin left there gets the app its session. Google's and Apple's
// answers (their token endpoints) are stood in for.
import { env } from "cloudflare:test"
import { exports } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { outbox } from "../src/email"

const BASE = "http://localhost:8787"
const PAGE = { origin: BASE, "content-type": "application/json" }
const APP = { origin: "enclose://", "content-type": "application/json" }

let from = ""
beforeEach(() => {
  from = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
})
afterEach(() => vi.restoreAllMocks())

const call = (path: string, init?: RequestInit) => {
  const request = new Request(`${BASE}${path}`, {
    redirect: "manual",
    ...init,
  })
  request.headers.set("cf-connecting-ip", from)
  return exports.default.fetch(request)
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
const fromBase64url = (text: string) =>
  Uint8Array.from(
    atob(
      text.replaceAll("-", "+").replaceAll("_", "/") +
        "=".repeat((4 - (text.length % 4)) % 4)
    ),
    (c) => c.charCodeAt(0)
  )
const jwt = (claims: object) =>
  `${base64url(new TextEncoder().encode('{"alg":"none"}'))}.${base64url(
    new TextEncoder().encode(JSON.stringify(claims))
  )}.`

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

/** The cookies a response sets, as a browser would send them back. */
const cookies = (response: Response, had = new Map<string, string>()) => {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";")
    const at = pair.indexOf("=")
    had.set(pair.slice(0, at), pair.slice(at + 1))
  }
  return had
}
const header = (had: Map<string, string>) =>
  [...had].map(([name, value]) => `${name}=${value}`).join("; ")

/** Google or Apple, answering the server's exchange of the code for who signed in. */
function provider(who: { sub: string; email: string; name?: string }) {
  const exchanges: { url: string; body: URLSearchParams }[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    exchanges.push({
      url,
      body: new URLSearchParams(String(init?.body ?? "")),
    })
    return Response.json({
      access_token: "an-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: jwt({ ...who, email_verified: true }),
    })
  })
  return exchanges
}

/** Through Google or Apple as a person would go, to what the app is handed. */
async function throughProvider(
  which: "google" | "apple",
  asked: Awaited<ReturnType<typeof pkce>>
) {
  const query = new URLSearchParams({
    client_id: "electron",
    state: asked.state,
    code_challenge: asked.challenge,
  })
  const started = await call(`/api/auth/sign-in/social?${query}`, {
    method: "POST",
    headers: PAGE,
    body: JSON.stringify({
      provider: which,
      callbackURL: "/sign-in/done",
      errorCallbackURL: "/sign-in/done",
    }),
  })
  expect(started.status).toBe(200)
  const kept = cookies(started)
  const to = new URL(((await started.json()) as { url: string }).url)
  const state = to.searchParams.get("state")!

  let back: Response
  if (which === "apple") {
    // Apple posts the code back, from its own site: without the page's cookies, as a
    // browser sends a form across sites; the server has it come again by GET
    const posted = await call("/api/auth/callback/apple", {
      method: "POST",
      headers: {
        origin: "https://appleid.apple.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code: "the-code", state }),
    })
    expect(posted.status).toBe(302)
    const again = new URL(posted.headers.get("location")!)
    back = await call(again.pathname + again.search, {
      headers: { cookie: header(kept) },
    })
  } else {
    back = await call(
      `/api/auth/callback/google?${new URLSearchParams({ code: "the-code", state })}`,
      { headers: { cookie: header(kept) } }
    )
  }
  // (as the page reads it: the cookie as it is set, decoded, its padding let go)
  const handed = cookies(back).get("better-auth.electron")
  return {
    to,
    back,
    handed: handed && decodeURIComponent(handed).replace(/=+$/, ""),
  }
}

async function exchange(
  handed: string,
  asked: Awaited<ReturnType<typeof pkce>>
) {
  const { identifier, state } = JSON.parse(
    new TextDecoder().decode(fromBase64url(handed))
  )
  expect(state).toBe(asked.state)
  return call("/api/auth/electron/token", {
    method: "POST",
    headers: APP,
    body: JSON.stringify({
      token: identifier,
      state,
      code_verifier: asked.verifier,
    }),
  })
}

describe("signing in with Google", () => {
  it("sends the person to Google, and the app gets its session once they're back", async () => {
    const google = provider({
      sub: "g-1",
      email: "grace@example.com",
      name: "Grace",
    })
    const asked = await pkce()
    const { to, back, handed } = await throughProvider("google", asked)
    expect(to.origin).toBe("https://accounts.google.com")
    expect(to.searchParams.get("redirect_uri")).toBe(
      `${BASE}/api/auth/callback/google`
    )
    expect(to.searchParams.get("prompt")).toBe("select_account")
    expect(back.status).toBe(302)
    expect(new URL(back.headers.get("location")!, BASE).pathname).toBe(
      "/sign-in/done"
    )
    expect(google[0].url).toBe("https://oauth2.googleapis.com/token")

    const session = await exchange(handed!, asked)
    expect(session.status).toBe(200)
    const { token, user } = (await session.json()) as {
      token: string
      user: { email: string; name: string }
    }
    expect(user).toMatchObject({ email: "grace@example.com", name: "Grace" })
    const account = await call("/v1/account", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(account.status).toBe(200)
  })

  it("is the same account as the email's, signed in to by a code before", async () => {
    const email = "linus@example.com"
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
    const before = ((await signed.json()) as { user: { id: string } }).user.id

    provider({ sub: "g-2", email })
    const asked = await pkce()
    const { handed } = await throughProvider("google", asked)
    const session = await exchange(handed!, asked)
    const { user } = (await session.json()) as { user: { id: string } }
    expect(user.id).toBe(before)
  })

  it("gives nothing for a verifier the app did not make", async () => {
    provider({ sub: "g-3", email: "mallory@example.com" })
    const asked = await pkce()
    const { handed } = await throughProvider("google", asked)
    const other = await pkce()
    const session = await exchange(handed!, { ...other, state: asked.state })
    expect(session.status).toBe(400)
  })
})

describe("signing in with Apple", () => {
  it("takes Apple's posted answer, with a client secret signed by the server's key", async () => {
    const apple = provider({
      sub: "a-1",
      email: "tim@privaterelay.appleid.com",
    })
    const asked = await pkce()
    const { to, back, handed } = await throughProvider("apple", asked)
    expect(to.origin).toBe("https://appleid.apple.com")
    expect(to.searchParams.get("response_mode")).toBe("form_post")
    expect(back.status).toBe(302)
    expect(new URL(back.headers.get("location")!, BASE).pathname).toBe(
      "/sign-in/done"
    )

    // what Apple was sent for a secret: a token the server signed, for this
    const sent = apple.find(
      (one) => one.url === "https://appleid.apple.com/auth/token"
    )!
    const secret = sent.body.get("client_secret")!
    const [head, claims, signature] = secret.split(".")
    const key = await crypto.subtle.importKey(
      "jwk",
      env.TEST_APPLE_PUBLIC_KEY,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    )
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        fromBase64url(signature),
        new TextEncoder().encode(`${head}.${claims}`)
      )
    ).toBe(true)
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(head)))).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    })
    expect(
      JSON.parse(new TextDecoder().decode(fromBase64url(claims)))
    ).toMatchObject({
      iss: "TEAM123456",
      sub: "dev.enclose.test",
      aud: "https://appleid.apple.com",
    })

    const session = await exchange(handed!, asked)
    expect(session.status).toBe(200)
  })
})

describe("the sign-in page", () => {
  it("has a button for each way in the server has the keys for", async () => {
    const page = await (await call("/sign-in")).text()
    expect(page).toContain("Continue with Google")
    expect(page).toContain("Continue with Apple")
  })

  it("is served again at /sign-in/done", async () => {
    expect((await call("/sign-in/done")).status).toBe(200)
  })
})
