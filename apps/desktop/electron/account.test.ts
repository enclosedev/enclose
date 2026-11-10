import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import type { AccountState } from "../shared/api"
import { Account, ENCLOSE_SERVER, tokenOf, type AccountDeps } from "./account"
import type { KeptAccount } from "./settings"

const SERVER = "http://localhost:8787"

/**
 * A server that signs in whoever comes with the right verifier, as Enclose's does: it
 * keeps the challenge the page was opened with, and checks the verifier against it.
 */
function server() {
  let challenge = ""
  let state = ""
  const sessions = new Set<string>()
  const calls: { path: string; init: RequestInit }[] = []
  const get = vi.fn(
    async (url: string | URL | Request, init: RequestInit = {}) => {
      const path = String(url).slice(SERVER.length)
      calls.push({ path, init })
      const auth = new Headers(init.headers).get("authorization") ?? ""
      const token = auth.replace("Bearer ", "")
      if (path === "/api/auth/electron/token") {
        const body = JSON.parse(String(init.body))
        const made = createHash("sha256")
          .update(body.code_verifier)
          .digest()
          .toString("base64url")
        if (body.token !== "the-identifier")
          return new Response("{}", { status: 404 })
        if (body.state !== state || made !== challenge)
          return new Response("{}", { status: 400 })
        sessions.add("the-session")
        return Response.json({
          token: "the-session",
          user: { email: "ada@example.com", name: "" },
        })
      }
      if (path === "/v1/account")
        return sessions.has(token)
          ? Response.json({
              user: { id: "1", email: "ada@example.com", name: "Ada" },
              storage: { used: 0, limit: 5 * 1024 ** 3 },
            })
          : new Response("{}", { status: 401 })
      if (path === "/api/auth/sign-out") {
        sessions.delete(token)
        return Response.json({ success: true })
      }
      if (path === "/api/auth/delete-user") {
        if (!sessions.has(token)) return new Response("{}", { status: 401 })
        sessions.delete(token)
        return Response.json({ success: true })
      }
      return new Response("{}", { status: 404 })
    }
  )
  return {
    get: get as unknown as typeof fetch,
    calls,
    sessions,
    /** the page, opened at `url`: what it would hand back */
    page(url: string) {
      const asked = new URL(url).searchParams
      challenge = asked.get("code_challenge") ?? ""
      state = asked.get("state") ?? ""
      const token = Buffer.from(
        JSON.stringify({ identifier: "the-identifier", state })
      ).toString("base64url")
      return { token, link: `enclose://auth/callback#token=${token}` }
    },
  }
}

function account(saved: KeptAccount | null = null, at = SERVER) {
  const site = server()
  let kept = saved
  const states: AccountState[] = []
  const opened: string[] = []
  const recorded: string[] = []
  const deps: AccountDeps = {
    server: at,
    saved: () => kept,
    save: (next) => {
      kept = next
      return true
    },
    open: (url) => opened.push(url),
    get: site.get,
    onChange: (state) => states.push(state),
    record: (event) => recorded.push(event),
  }
  const made = new Account(deps)
  return { made, site, states, opened, recorded, kept: () => kept }
}

describe("signing in", () => {
  it("opens the sign-in page with a challenge, keeping the verifier to itself", () => {
    const { made, opened } = account()
    made.signIn()
    expect(made.state.state).toBe("signing-in")
    const url = new URL(opened[0])
    expect(url.origin + url.pathname).toBe(`${SERVER}/sign-in`)
    expect(url.searchParams.get("client_id")).toBe("electron")
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/)
    expect(url.searchParams.get("state")).toBeTruthy()
    expect(url.search).not.toContain("verifier")
  })

  it("signs in by the link the page hands back, and keeps the session", async () => {
    const { made, site, opened, recorded, kept } = account()
    made.signIn()
    await made.link(site.page(opened[0]).link)
    expect(made.state).toMatchObject({ state: "in", email: "ada@example.com" })
    expect(kept()).toEqual({
      email: "ada@example.com",
      name: "",
      token: "the-session",
    })
    expect(recorded).toEqual(["account signed in"])
    // and what there is of the account is asked for, once signed in
    await vi.waitFor(() =>
      expect(made.state).toMatchObject({
        name: "Ada",
        storage: { used: 0, limit: 5 * 1024 ** 3 },
      })
    )
  })

  it("signs in by the code pasted, or the whole link", async () => {
    for (const as of ["token", "link"] as const) {
      const { made, site, opened } = account()
      made.signIn()
      const handed = site.page(opened[0])
      expect(await made.paste(` ${handed[as]}\n`)).toBeNull()
      expect(made.state.state).toBe("in")
    }
  })

  it("sends the app's origin, and the verifier, with the exchange", async () => {
    const { made, site, opened } = account()
    made.signIn()
    await made.paste(site.page(opened[0]).token)
    const exchange = site.calls.find(
      (call) => call.path === "/api/auth/electron/token"
    )!
    expect(new Headers(exchange.init.headers).get("origin")).toBe("enclose://")
    expect(JSON.parse(String(exchange.init.body)).code_verifier).toMatch(
      /^[\w-]{43}$/
    )
  })

  it("lets be a link when no sign-in is under way", async () => {
    const { made, site } = account()
    await made.link(site.page(`${SERVER}/sign-in?state=x`).link)
    expect(made.state.state).toBe("out")
    expect(site.calls).toHaveLength(0)
  })

  it("will not take a code from another sign-in", async () => {
    const { made, site, opened } = account()
    made.signIn()
    site.page(opened[0])
    const other = Buffer.from(
      JSON.stringify({ identifier: "the-identifier", state: "another" })
    ).toString("base64url")
    expect(await made.paste(other)).toMatch(/another sign-in/)
    expect(made.state.state).toBe("signing-in")
    expect(await made.paste("not a code")).toMatch(/isn't the code/)
  })

  it("stops, cancelled", () => {
    const { made } = account()
    made.signIn()
    made.cancel()
    expect(made.state).toEqual({ state: "out", trouble: null, server: SERVER })
  })
})

describe("signed in", () => {
  const kept = { email: "ada@example.com", name: "", token: "the-session" }

  it("is signed in as the app opens, with what was kept", () => {
    const { made } = account(kept)
    expect(made.state).toMatchObject({ state: "in", email: "ada@example.com" })
  })

  it("is signed out where the server no longer knows the session", async () => {
    const { made, kept: now } = account(kept)
    await made.refresh()
    expect(made.state).toMatchObject({ state: "out", trouble: /signed out/ })
    expect(now()).toBeNull()
  })

  it("signs out, on the server and here", async () => {
    const { made, site, recorded, kept: now } = account(kept)
    site.sessions.add("the-session")
    await made.signOut()
    expect(site.sessions.size).toBe(0)
    expect(made.state.state).toBe("out")
    expect(now()).toBeNull()
    expect(recorded).toEqual(["account signed out"])
  })

  it("deletes the account", async () => {
    const { made, site, recorded, kept: now } = account(kept)
    site.sessions.add("the-session")
    expect(await made.remove()).toBeNull()
    expect(made.state.state).toBe("out")
    expect(now()).toBeNull()
    expect(recorded).toEqual(["account deleted"])
  })

  it("says nothing of the server where it is Enclose's own", () => {
    const { made } = account(null, ENCLOSE_SERVER)
    expect(made.state).toEqual({ state: "out", trouble: null, server: null })
  })
})

describe("tokenOf", () => {
  it("takes what the sign-in page's link hands over, and nothing else", () => {
    expect(tokenOf("enclose://auth/callback#token=abc_-9")).toBe("abc_-9")
    expect(tokenOf("enclose://auth/callback#token=a b")).toBeNull()
    expect(tokenOf("enclose://other#token=abc")).toBeNull()
    expect(tokenOf("https://auth/callback#token=abc")).toBeNull()
  })
})
