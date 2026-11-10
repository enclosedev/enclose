// Enclose's server. For now, accounts: Better Auth's own routes under /api/auth, the page
// the app signs in through, and what the app is told of the account signed in to.
//
// (Nothing but the handler is exported from here: the Workers runtime takes each thing
// this module exports for something it answers requests with, and will not start
// otherwise.)
import { STORAGE_LIMIT, type AccountReply } from "./account"
import { authFor } from "./auth"
import { signInPage } from "./page"

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })

function page(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "")
  return new Response(signInPage(nonce), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    // (Better Auth is made only for a request it answers, and that waits on it to the
    // end: what it begins as it is made, a request over before then would leave hanging,
    // and every request after it waiting on that)
    if (url.pathname.startsWith("/api/auth/"))
      return authFor(env).handler(request)

    if (url.pathname === "/sign-in" && request.method === "GET") return page()

    if (url.pathname === "/v1/account" && request.method === "GET") {
      const session = await authFor(env).api.getSession({
        headers: request.headers,
      })
      if (!session) return json({ message: "Not signed in." }, 401)
      const { user } = session
      const reply: AccountReply = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        },
        // nothing is kept of anybody's projects yet
        storage: { used: 0, limit: STORAGE_LIMIT },
      }
      return json(reply)
    }

    if (url.pathname === "/")
      return Response.redirect("https://enclose.dev", 302)

    return json({ message: "Not found." }, 404)
  },
} satisfies ExportedHandler<Env>
