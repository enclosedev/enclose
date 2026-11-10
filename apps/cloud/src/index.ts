// Enclose's server. For now, accounts: Better Auth's own routes under /api/auth, the page
// the app signs in through, and what the app is told of the account signed in to.
//
// (Nothing but the handler is exported from here: the Workers runtime takes each thing
// this module exports for something it answers requests with, and will not start
// otherwise.)
import { STORAGE_LIMIT, type AccountReply } from "./account"
import { authFor, providersOf } from "./auth"
import { backedUp, backup, usedBy } from "./backup"
import { tidy } from "./tidy"
import { SITE, signInPage, signedInPage } from "./page"
import { isPerson } from "./turnstile"

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })

/**
 * The session the app sends its token for: only so (Authorization: Bearer), not by the
 * cookie the sign-in page leaves in the browser, which another page could send along.
 */
async function appSession(env: Env, request: Request) {
  const authorization = request.headers.get("authorization") ?? ""
  if (!authorization.startsWith("Bearer ")) return null
  const { auth } = await authFor(env)
  return auth.api.getSession({ headers: new Headers({ authorization }) })
}

/** Turnstile's script, and the frame its check runs in, where the page has the widget. */
const TURNSTILE = "https://challenges.cloudflare.com"

/** A page, its own script and style let run by a nonce alone (and Turnstile's, where said). */
function html(made: (nonce: string) => string, turnstile = false): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "")
  const scripts = turnstile ? ` ${TURNSTILE}` : ""
  const frames = turnstile ? `; frame-src ${TURNSTILE}` : ""
  return new Response(made(nonce), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'${scripts}; style-src 'nonce-${nonce}'; font-src 'self'; connect-src 'self'${frames}; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  })
}

function page(env: Env): Response {
  const sitekey = env.TURNSTILE_SITEKEY || null
  return html(
    (nonce) => signInPage(nonce, sitekey, providersOf(env)),
    Boolean(sitekey)
  )
}

/**
 * What Better Auth answers that Enclose does not use, and that is not let through: what
 * would send an email no person asked for on the sign-in page (Turnstile guards that one),
 * passwords, and what would reach the provider's tokens (none are kept, src/auth.ts).
 */
function unused(path: string): boolean {
  const route = path.slice("/api/auth".length)
  if (route.startsWith("/email-otp/"))
    return route !== "/email-otp/send-verification-otp"
  return /password|^\/sign-up\/|^\/sign-in\/email$|verify-email|verification-email|change-email|access-token|refresh-token|link-social|unlink-account/.test(
    route
  )
}

export default {
  // once a day: what has run out, gone (src/tidy.ts)
  async scheduled(_controller, env): Promise<void> {
    await tidy(env)
  },

  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/auth/") && unused(url.pathname))
      return json({ message: "Not found." }, 404)

    // (Better Auth is made only for a request it answers, and that waits on it to the
    // end: what it begins as it is made, a request over before then would leave hanging,
    // and every request after it waiting on that)
    // (a code is emailed only for a person: see src/turnstile.ts)
    if (
      url.pathname === "/api/auth/email-otp/send-verification-otp" &&
      !(await isPerson(env, request))
    )
      return json(
        {
          code: "NOT_A_PERSON",
          message:
            "We couldn't tell you're a person. Reload the page and try again.",
        },
        403
      )

    if (url.pathname.startsWith("/api/auth/")) {
      const { auth, sending } = await authFor(env)
      const response = await auth.handler(request)
      // (Better Auth says a code went that did not: the page is told it didn't)
      if (sending.failed)
        return json(
          {
            code: "CODE_NOT_SENT",
            message:
              "We couldn't send the code. Check the email and try again in a moment.",
          },
          502
        )
      return response
    }

    // (and the same page, back from Google or Apple)
    if (
      (url.pathname === "/sign-in" || url.pathname === "/sign-in/done") &&
      request.method === "GET"
    )
      return page(env)

    if (url.pathname.startsWith("/v1/backup/")) {
      const session = await appSession(env, request)
      if (!session) return json({ message: "Not signed in." }, 401)
      return backup(request, env, url.pathname, session.user.id)
    }

    if (url.pathname === "/v1/account" && request.method === "GET") {
      const session = await appSession(env, request)
      if (!session) return json({ message: "Not signed in." }, 401)
      const { user } = session
      const [used, backed] = await Promise.all([
        usedBy(env, user.id),
        backedUp(env, user.id),
      ])
      const reply: AccountReply = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        },
        storage: { used, limit: STORAGE_LIMIT },
        backup: backed,
      }
      return json(reply)
    }

    // (where the app sends the browser, once it has the sign-in)
    if (url.pathname === "/signed-in" && request.method === "GET")
      return html(signedInPage)

    if (url.pathname === "/") return Response.redirect(SITE, 302)

    return json({ message: "Not found." }, 404)
  },
} satisfies ExportedHandler<Env>
