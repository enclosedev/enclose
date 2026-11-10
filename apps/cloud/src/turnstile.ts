// Whoever asks for a code to be emailed is a person, not a bot sending codes to inboxes
// that never asked for them: Cloudflare's Turnstile, on the sign-in page, says so with a
// token, and the server has Cloudflare check that token (once: it cannot be used again)
// before it sends anything.
//
// The server people use has Turnstile's secret (TURNSTILE_SECRET, set as the other
// secrets are) and its sitekey (TURNSTILE_SITEKEY, in wrangler.jsonc); one run on your
// own machine has neither, and does without.

import { onThisMachine } from "./account"

/** What the sign-in page's widget says it is for, and the token must say it was made for. */
export const ACTION = "sign_in"
/** The header the sign-in page sends the token in. */
export const HEADER = "cf-turnstile-response"

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Whether the server checks for a person at all: the one people use always does. */
export function checking(env: Env): boolean {
  return !onThisMachine(env) || Boolean(env.TURNSTILE_SECRET)
}

/**
 * Whether the request comes from a person, by its token. Anything that cannot be made
 * sure of (no token, no secret, Cloudflare out of reach) counts as not.
 */
export async function isPerson(env: Env, request: Request): Promise<boolean> {
  if (!checking(env)) return true
  const token = request.headers.get(HEADER) ?? ""
  if (!env.TURNSTILE_SECRET || !token || token.length > 2048) return false
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  })
  const ip = request.headers.get("cf-connecting-ip")
  if (ip) body.set("remoteip", ip)
  let result: { success?: unknown; action?: unknown; hostname?: unknown }
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return false
    result = await response.json()
  } catch {
    return false
  }
  // (made on this server's own page, for this, and not used before)
  return (
    result.success === true &&
    result.action === ACTION &&
    result.hostname === new URL(env.BASE_URL).hostname
  )
}
