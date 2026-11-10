// What the server is given apart from wrangler.jsonc, and so not in the types `wrangler
// types` writes from it.
interface Env {
  /** what Better Auth signs with: set as a secret on the server people use */
  BETTER_AUTH_SECRET?: string
  /** what the server sends the sign-in codes through Resend with: likewise a secret */
  RESEND_API_KEY?: string
}
