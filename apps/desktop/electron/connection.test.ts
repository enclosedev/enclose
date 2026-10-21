import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GitHubConnection } from "../shared/api"
import { Connection, type ConnectionDeps } from "./connection"
import { installUrl, type Account, type Tokens } from "./github"

const ACCOUNT: Account = { id: 7, login: "octo", name: "Octo Cat" }
const TOKENS: Tokens = { access: "ghu_a", refresh: "ghr_a", expires: null }

/**
 * GitHub, as connecting asks it: for a code, for the code to have been typed (it has,
 * at once), for the account, and for where Enclose's app is installed, which it is from
 * the `installedFrom`th time it is asked (never, with Infinity).
 */
function github(installedFrom = 1) {
  let asked = 0
  const get = (async (url: string) => {
    const answer = (body: unknown) => new Response(JSON.stringify(body))
    if (url.endsWith("/login/device/code"))
      return answer({
        device_code: "dev",
        user_code: "WDJB-MJHT",
        verification_uri: "https://github.com/login/device",
        interval: 5,
        expires_in: 3600,
      })
    if (url.endsWith("/login/oauth/access_token"))
      return answer({ access_token: "ghu_a", refresh_token: "ghr_a" })
    if (url.endsWith("/user")) return answer(ACCOUNT)
    if (url.endsWith("/user/installations"))
      return answer({
        installations:
          ++asked >= installedFrom ? [{ account: { id: ACCOUNT.id } }] : [],
      })
    return new Response("{}", { status: 404 })
  }) as typeof fetch
  return { get, installsAsked: () => asked }
}

/** What a connection is given, standing in for the keychain, the browser and the window. */
function deps(
  get: typeof fetch,
  fields: Partial<ConnectionDeps> = {}
): ConnectionDeps & { said: GitHubConnection[] } {
  const said: GitHubConnection[] = []
  return {
    saved: () => null,
    save: vi.fn(() => true),
    open: vi.fn(),
    copy: vi.fn(),
    get,
    onChange: (connection) => void said.push(connection),
    onConnected: vi.fn(),
    said,
    ...fields,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  // (what GitHub says of where it is installed is said in the log: not here)
  vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Connect, with time let pass as far as it must, and a little further each step. */
async function connecting(connection: Connection, ms = 10_000) {
  const done = connection.connect()
  await vi.advanceTimersByTimeAsync(ms)
  await done
}

describe("Connection", () => {
  it("is on from the first with an account kept", () => {
    const { get } = github()
    const connection = new Connection(
      deps(get, { saved: () => ({ account: ACCOUNT, tokens: TOKENS }) })
    )
    expect(connection.state).toEqual({
      state: "on",
      login: "octo",
      name: "Octo Cat",
    })
    expect(connection.connected()?.account).toEqual(ACCOUNT)
  })

  it("is off from the first with none", () => {
    const connection = new Connection(deps(github().get))
    expect(connection.state).toEqual({ state: "off", trouble: null })
    expect(connection.connected()).toBeNull()
  })

  it("shows the code, then keeps the account and says it is connected, once", async () => {
    const { get } = github()
    const given = deps(get)
    const connection = new Connection(given)
    await connecting(connection)
    expect(given.said.map((one) => one.state)).toEqual(["code", "on"])
    expect(given.said[0]).toMatchObject({ code: "WDJB-MJHT" })
    expect(given.save).toHaveBeenCalledOnce()
    expect(given.save).toHaveBeenCalledWith({
      account: ACCOUNT,
      tokens: expect.objectContaining({ access: "ghu_a" }) as Tokens,
    })
    expect(given.onConnected).toHaveBeenCalledOnce()
    expect(connection.connected()?.account).toEqual(ACCOUNT)
    // its app was installed already: no page is opened for it
    expect(given.open).not.toHaveBeenCalled()
  })

  it("is not connected where the account cannot be kept safely", async () => {
    const given = deps(github().get, { save: vi.fn(() => false) })
    const connection = new Connection(given)
    await connecting(connection)
    expect(connection.state).toEqual({
      state: "off",
      trouble: "This machine would not keep the account safely.",
    })
    expect(connection.connected()).toBeNull()
    expect(given.onConnected).not.toHaveBeenCalled()
  })

  it("opens the page to install its app, and asks every 3 s until it is", async () => {
    const { get, installsAsked } = github(4)
    const given = deps(get)
    const connection = new Connection(given)
    const done = connection.connect()
    // the code is typed (5 s), and the app is found not to be installed
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connection.state).toEqual({
      state: "install",
      login: "octo",
      url: installUrl(),
    })
    expect(given.open).toHaveBeenCalledWith(installUrl())
    expect(installsAsked()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(installsAsked()).toBe(2)
    await vi.advanceTimersByTimeAsync(6_000)
    await done
    expect(installsAsked()).toBe(4)
    expect(connection.state.state).toBe("on")
    expect(given.save).toHaveBeenCalledOnce()
    expect(given.onConnected).toHaveBeenCalledOnce()
  })

  it("gives up on its app being installed after 20 minutes", async () => {
    const { get, installsAsked } = github(Infinity)
    const given = deps(get)
    const connection = new Connection(given)
    const done = connection.connect()
    await vi.advanceTimersByTimeAsync(5_000 + 19 * 60_000)
    expect(connection.state.state).toBe("install")
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    await done
    expect(connection.state).toEqual({
      state: "off",
      trouble: "Enclose's app was not installed on GitHub. Connect again.",
    })
    // about once every 3 s for those 20 minutes
    expect(installsAsked()).toBeGreaterThan(395)
    expect(installsAsked()).toBeLessThan(405)
    expect(given.save).not.toHaveBeenCalled()
  })

  it("leaves no trouble said when it is stopped, waiting for the code or the install", async () => {
    for (const installedFrom of [1, Infinity]) {
      const given = deps(github(installedFrom).get)
      const connection = new Connection(given)
      const done = connection.connect()
      // waiting for the code to be typed; or, past that, for the app to be installed
      await vi.advanceTimersByTimeAsync(installedFrom === 1 ? 1_000 : 6_000)
      connection.cancel()
      await vi.advanceTimersByTimeAsync(10_000)
      await done
      expect(connection.state).toEqual({ state: "off", trouble: null })
      expect(given.save).not.toHaveBeenCalled()
      expect(given.onConnected).not.toHaveBeenCalled()
    }
  })

  it("copies the code and opens where it is typed, while there is one", async () => {
    const given = deps(github().get)
    const connection = new Connection(given)
    connection.openCode()
    expect(given.copy).not.toHaveBeenCalled()
    const done = connection.connect()
    await vi.advanceTimersByTimeAsync(0)
    connection.openCode()
    expect(given.copy).toHaveBeenCalledWith("WDJB-MJHT")
    expect(given.open).toHaveBeenCalledWith("https://github.com/login/device")
    await vi.advanceTimersByTimeAsync(10_000)
    await done
  })

  it("forgets the account kept when it is disconnected", () => {
    const given = deps(github().get, {
      saved: () => ({ account: ACCOUNT, tokens: TOKENS }),
    })
    const connection = new Connection(given)
    connection.disconnect()
    expect(given.save).toHaveBeenCalledWith(null)
    expect(connection.state).toEqual({ state: "off", trouble: null })
    expect(connection.connected()).toBeNull()
  })

  it("is signed out by GitHub only where it was connected", () => {
    const off = deps(github().get)
    new Connection(off).signedOut()
    expect(off.save).not.toHaveBeenCalled()
    expect(off.said).toEqual([])

    const on = deps(github().get, {
      saved: () => ({ account: ACCOUNT, tokens: TOKENS }),
    })
    const connection = new Connection(on)
    connection.signedOut()
    expect(on.save).toHaveBeenCalledWith(null)
    expect(connection.state).toEqual({
      state: "off",
      trouble: "GitHub signed Enclose out. Connect again to go on backing up.",
    })
    expect(connection.connected()).toBeNull()
  })
})
