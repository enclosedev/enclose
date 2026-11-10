// The Enclose account, from Settings, Account: signed in to on a page of Enclose's server
// opened in the browser, with a code sent by email, and from then on kept by the app
// (sealed, in the settings) until it is signed out of or deleted.
//
// The app proves the sign-in is its own (PKCE): before it opens the page it makes a
// secret it keeps (the verifier), and gives the page only a digest of it. The page, once
// the code from the email is right, hands the app back what it signs in with: to the app
// itself, on this machine (it listens at 127.0.0.1, on a port of its own, while it signs
// in), and where it could not listen, by an enclose:// link, or as a code to paste where
// that does not reach the app either. The app sends the server what was in it with the
// secret, and is given the session's token for them. This is
// what Better Auth's Electron package does in an app, done here as the rest of the app
// is: see apps/cloud for the server, and docs/development.md.
import { createHash, randomBytes } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"

import type { AccountState } from "../shared/api"
import type { KeptAccount } from "./settings"

/** Where the account is kept: Enclose's own server, which the installed app signs in on. */
export const ENCLOSE_SERVER = "https://cloud.enclose.dev"
/** What the page hands the app back by: links that begin so are the app's. */
export const SCHEME = "enclose"
/** What the app signs in as, on the server (its electron plugin's client ID). */
const CLIENT_ID = "electron"
/** Where the page hands the sign-in back to the app, on this machine. */
const CALLBACK = "/auth/callback"
/** How long the app listens for it: the page has run out by then. */
const LISTENS_MS = 15 * 60 * 1000

export type AccountDeps = {
  /** where the account is kept */
  server: string
  /** the account kept for this server, and what signs in to it */
  saved: () => KeptAccount | null
  save: (account: KeptAccount | null) => boolean
  open: (url: string) => void
  get: typeof fetch
  onChange: (state: AccountState) => void
  /** bring the app forward: signed in, by the page handing it back to the app */
  focus?: () => void
  /** something to be counted (the app's usage data) */
  record: (
    event: "account signed in" | "account signed out" | "account deleted"
  ) => void
}

const base64url = (bytes: Buffer) => bytes.toString("base64url")

/** What the app is told of the account by the server (GET /v1/account). */
type Reply = {
  user: { email: string; name: string }
  storage: { used: number; limit: number }
}

export class Account {
  private readonly deps: AccountDeps
  private readonly shownServer: string | null
  private now: AccountState
  /** the account signed in to, where one is */
  private kept: KeptAccount | null
  /** the sign-in under way: what the page was opened with, and the secret behind it */
  private pending: { state: string; verifier: string; url: string } | null =
    null
  /** what listens for the page handing the sign-in back, while one is under way */
  private listening: Server | null = null

  constructor(deps: AccountDeps) {
    this.deps = deps
    this.shownServer = deps.server === ENCLOSE_SERVER ? null : deps.server
    this.kept = deps.saved()
    this.now = this.kept
      ? {
          state: "in",
          email: this.kept.email,
          name: this.kept.name,
          storage: null,
          trouble: null,
          server: this.shownServer,
        }
      : { state: "out", trouble: null, server: this.shownServer }
  }

  get state(): AccountState {
    return this.now
  }

  private set(next: AccountState) {
    this.now = next
    this.deps.onChange(next)
  }

  private out(trouble: string | null) {
    this.kept = null
    this.deps.save(null)
    this.pending = null
    this.stopListening()
    this.set({ state: "out", trouble, server: this.shownServer })
  }

  /**
   * Open the sign-in page, with a secret of this sign-in's own behind it, and where the
   * page is to hand it back on this machine.
   */
  async signIn(): Promise<void> {
    if (this.now.state === "in") return
    this.stopListening()
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash("sha256").update(verifier).digest())
    const state = base64url(randomBytes(12))
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      state,
      code_challenge: challenge,
    })
    const port = await this.listen()
    if (port !== null) query.set("loopback", String(port))
    const url = `${this.deps.server}/sign-in?${query}`
    this.pending = { state, verifier, url }
    this.set({ state: "signing-in", url, server: this.shownServer })
    this.deps.open(url)
  }

  /** Open the page again, as it was opened: what was begun on it still holds. */
  openPage() {
    if (this.pending) this.deps.open(this.pending.url)
  }

  cancel() {
    if (this.now.state !== "signing-in") return
    this.pending = null
    this.stopListening()
    this.set({ state: "out", trouble: null, server: this.shownServer })
  }

  /**
   * A link the app was opened with: the page handing back the sign-in. One that is not
   * for a sign-in under way here is let be.
   */
  async link(url: string): Promise<void> {
    const token = tokenOf(url)
    if (token === null || !this.pending) return
    const trouble = await this.finish(token)
    if (trouble) this.set({ state: "out", trouble, server: this.shownServer })
  }

  /** Listen, on this machine alone, for the page handing the sign-in back: the port. */
  private listen(): Promise<number | null> {
    return new Promise((resolve) => {
      const server = createServer((request, response) => {
        void this.answer(request, response)
      })
      server.on("error", () => resolve(null))
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") {
          server.close()
          return resolve(null)
        }
        // (it keeps nothing open of itself, and stops by itself)
        server.unref()
        setTimeout(() => {
          if (this.listening === server) this.stopListening()
        }, LISTENS_MS).unref()
        this.listening = server
        resolve(address.port)
      })
    })
  }

  private stopListening() {
    this.listening?.close()
    this.listening = null
  }

  /**
   * The page, handing the sign-in back: signed in, and the browser sent on (so that
   * this address is not left in it) to the server's page that closes the tab.
   */
  private async answer(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method !== "GET" || url.pathname !== CALLBACK) {
      response.writeHead(404, { connection: "close" }).end()
      return
    }
    const token = url.searchParams.get("token") ?? ""
    // (handed back again, by the page reloaded, once signed in: that is so still)
    const trouble =
      this.now.state === "in" && !this.pending
        ? null
        : /^[A-Za-z0-9_-]+$/.test(token)
          ? await this.finish(token)
          : "That isn't what the sign-in page hands back. Start again from Enclose."
    if (trouble === null) this.deps.focus?.()
    // (it failed: the app says why, as for a link, and the browser only that it did)
    else if (this.pending) {
      this.pending = null
      this.stopListening()
      this.set({ state: "out", trouble, server: this.shownServer })
    }
    response
      .writeHead(302, {
        location: `${this.deps.server}/signed-in${trouble ? "?failed" : ""}`,
        "cache-control": "no-store",
        connection: "close",
      })
      .end()
  }

  /** The code the page shows, pasted: what went wrong, where something did. */
  async paste(code: string): Promise<string | null> {
    if (!this.pending) return "Start signing in again."
    const token = tokenOf(code.trim()) ?? code.trim()
    return this.finish(token)
  }

  /** Sign in with what the page handed back: what went wrong, where something did. */
  private async finish(token: string): Promise<string | null> {
    const pending = this.pending
    if (!pending) return "Start signing in again."
    let handed: { identifier?: unknown; state?: unknown } | null = null
    try {
      handed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
    } catch {
      // not something the page hands out
    }
    if (typeof handed?.identifier !== "string")
      return "That isn't the code from the sign-in page. Copy it again."
    if (handed.state !== pending.state)
      return "That code is from another sign-in. Use the page this one opened."
    let response: Response
    try {
      response = await this.deps.get(
        `${this.deps.server}/api/auth/electron/token`,
        {
          method: "POST",
          // (no Origin: Electron's fetch fails a request that says one of its own,
          // and the server asks for none where there are no cookies, as here)
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: handed.identifier,
            state: pending.state,
            code_verifier: pending.verifier,
          }),
        }
      )
    } catch {
      return "Couldn't reach Enclose's server. Check your connection and try again."
    }
    if (!response.ok)
      return response.status === 404
        ? "That sign-in has run out. Start again."
        : "Enclose's server wouldn't sign you in. Start again."
    const data = (await response.json().catch(() => null)) as {
      token?: unknown
      user?: { email?: unknown; name?: unknown }
    } | null
    if (typeof data?.token !== "string" || typeof data.user?.email !== "string")
      return "Enclose's server answered with something unexpected. Start again."
    // (signed in, now: a link that comes later, from this page again, is let be)
    this.pending = null
    this.stopListening()
    const kept: KeptAccount = {
      email: data.user.email,
      name: typeof data.user.name === "string" ? data.user.name : "",
      token: data.token,
    }
    if (!this.deps.save(kept)) {
      const trouble = "This machine has nowhere to keep the sign-in safely."
      this.set({ state: "out", trouble, server: this.shownServer })
      return trouble
    }
    this.kept = kept
    this.set({
      state: "in",
      email: kept.email,
      name: kept.name,
      storage: null,
      trouble: null,
      server: this.shownServer,
    })
    this.deps.record("account signed in")
    void this.refresh()
    return null
  }

  private authed(path: string, init: RequestInit = {}) {
    return this.deps.get(`${this.deps.server}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.kept?.token ?? ""}`,
        ...init.headers,
      },
    })
  }

  /** Ask the server what there is of the account: signed out, where it no longer knows the session. */
  async refresh(): Promise<void> {
    const kept = this.kept
    if (!kept || this.now.state !== "in") return
    let response: Response
    try {
      response = await this.authed("/v1/account")
    } catch {
      if (this.kept === kept && this.now.state === "in")
        this.set({ ...this.now, trouble: "Couldn't reach Enclose's server." })
      return
    }
    // (signed out, or in again, meanwhile: what was asked is of no account now)
    if (this.kept !== kept || this.now.state !== "in") return
    if (response.status === 401)
      return this.out("You were signed out. Sign in again.")
    const reply = (await response.json().catch(() => null)) as Reply | null
    if (!response.ok || !reply?.user || !reply.storage) {
      this.set({ ...this.now, trouble: "Enclose's server couldn't say." })
      return
    }
    const fresh = { ...kept, email: reply.user.email, name: reply.user.name }
    if (fresh.email !== kept.email || fresh.name !== kept.name) {
      this.deps.save(fresh)
      this.kept = fresh
    }
    this.set({
      state: "in",
      email: fresh.email,
      name: fresh.name,
      storage: { used: reply.storage.used, limit: reply.storage.limit },
      trouble: null,
      server: this.shownServer,
    })
  }

  /** Sign out: on the server too, where it can be reached, and here whether or not. */
  async signOut(): Promise<void> {
    if (!this.kept) return
    try {
      await this.authed("/api/auth/sign-out", { method: "POST", body: "{}" })
    } catch {
      // (the session runs out by itself on the server, unused)
    }
    this.out(null)
    this.deps.record("account signed out")
  }

  /** Delete the account, on the server: what went wrong, where something did. */
  async remove(): Promise<string | null> {
    if (!this.kept) return null
    let response: Response
    try {
      response = await this.authed("/api/auth/delete-user", {
        method: "POST",
        body: "{}",
      })
    } catch {
      return "Couldn't reach Enclose's server. Check your connection and try again."
    }
    if (response.status === 401) {
      this.out("You were signed out. Sign in again.")
      return "You were signed out. Sign in again to delete your account."
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        code?: unknown
      } | null
      // (a session begun more than a day ago may not delete the account)
      return data?.code === "SESSION_EXPIRED"
        ? "For your safety, sign out and sign in again, then delete your account."
        : "Enclose's server couldn't delete your account. Try again."
    }
    this.out(null)
    this.deps.record("account deleted")
    return null
  }
}

/**
 * What a link from the sign-in page hands over, `enclose://auth/callback#token=…`: null
 * for anything else.
 */
export function tokenOf(url: string): string | null {
  const start = `${SCHEME}://auth/callback#token=`
  if (!url.startsWith(start)) return null
  const token = url.slice(start.length)
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null
}
