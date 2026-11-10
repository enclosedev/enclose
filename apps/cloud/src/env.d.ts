// What the server is given apart from wrangler.jsonc, and so not in the types `wrangler
// types` writes from it.
interface Env {
  /** what Better Auth signs with: set as a secret on the server people use */
  BETTER_AUTH_SECRET?: string
  /** what the server sends the sign-in codes through Resend with: likewise a secret */
  RESEND_API_KEY?: string
  /** what the server has Cloudflare check Turnstile's tokens with: likewise a secret */
  TURNSTILE_SECRET?: string
  /** Google's sign-in, where the server has it: the OAuth client's ID and secret */
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Apple's, likewise: the Services ID, the team, and the Sign in with Apple key */
  APPLE_CLIENT_ID?: string
  APPLE_TEAM_ID?: string
  APPLE_KEY_ID?: string
  APPLE_PRIVATE_KEY?: string
}
