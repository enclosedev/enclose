// The check that whoever asks for a code is a person, as the server people use makes it:
// Cloudflare's answer (siteverify) stood in for here.
import { afterEach, describe, expect, it, vi } from "vitest"

import { signInPage } from "../src/page"
import { ACTION, HEADER, isPerson } from "../src/turnstile"

const SERVER = {
  BASE_URL: "https://cloud.enclose.dev",
  TURNSTILE_SITEKEY: "the-sitekey",
  TURNSTILE_SECRET: "the-secret",
} as unknown as Env

const asking = (token?: string) =>
  new Request(
    "https://cloud.enclose.dev/api/auth/email-otp/send-verification-otp",
    {
      method: "POST",
      headers: {
        "cf-connecting-ip": "10.1.2.3",
        ...(token ? { [HEADER]: token } : {}),
      },
    }
  )

/** Cloudflare, answering so of every token. */
function cloudflare(answer: object | Error) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (answer instanceof Error) throw answer
    return Response.json(answer)
  })
}

const GOOD = { success: true, action: ACTION, hostname: "cloud.enclose.dev" }

afterEach(() => vi.restoreAllMocks())

describe("isPerson", () => {
  it("takes a token Cloudflare says is good, made on this server's page for this", async () => {
    const siteverify = cloudflare(GOOD)
    expect(await isPerson(SERVER, asking("a-token"))).toBe(true)
    const body = siteverify.mock.calls[0][1]!.body as URLSearchParams
    expect(Object.fromEntries(body)).toEqual({
      secret: "the-secret",
      response: "a-token",
      remoteip: "10.1.2.3",
    })
  })

  it("refuses what Cloudflare does not say is good", async () => {
    for (const answer of [
      { success: false, "error-codes": ["timeout-or-duplicate"] },
      { ...GOOD, action: "something-else" },
      { ...GOOD, hostname: "localhost" },
      new Error("out of reach"),
    ]) {
      cloudflare(answer)
      expect(await isPerson(SERVER, asking("a-token"))).toBe(false)
      vi.restoreAllMocks()
    }
  })

  it("refuses without a token, or without the secret, asking nobody", async () => {
    const siteverify = cloudflare(GOOD)
    expect(await isPerson(SERVER, asking())).toBe(false)
    expect(
      await isPerson(
        { ...SERVER, TURNSTILE_SECRET: undefined },
        asking("a-token")
      )
    ).toBe(false)
    expect(siteverify).not.toHaveBeenCalled()
  })

  it("does without on your own machine", async () => {
    const local = { BASE_URL: "http://localhost:8787" } as Env
    expect(await isPerson(local, asking())).toBe(true)
  })
})

describe("the sign-in page", () => {
  it("takes the app's port as digits alone (as its script is served)", () => {
    expect(signInPage("n", null)).toContain("const port = /^\\d{4,5}$/.test(")
  })

  it("has the widget where there is a sitekey, and not where there isn't", () => {
    expect(signInPage("n", "the-sitekey")).toContain(
      'src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=turnstileReady"'
    )
    expect(signInPage("n", "the-sitekey")).toContain('"the-sitekey"')
    expect(signInPage("n", null)).not.toContain("challenges.cloudflare.com")
  })
})
