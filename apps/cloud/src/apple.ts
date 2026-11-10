// Signing in with Apple takes, for a client secret, a token the server signs itself with
// its Sign in with Apple key (a .p8 file from Apple's developer site), which Apple takes
// for no longer than six months. The server makes one as it needs it, so it never runs
// out: from APPLE_PRIVATE_KEY (the .p8's text), APPLE_KEY_ID (the key's ID),
// APPLE_TEAM_ID and APPLE_CLIENT_ID (the Services ID people sign in to), all set as
// secrets.

/** How long a secret made is good for, and kept here for. */
const LASTS = 24 * 60 * 60
const KEPT = 60 * 60

let made: { by: string; secret: string; until: number } | null = null

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")

const text = (value: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)))

/** Whether the server has what signing in with Apple takes. */
export function hasApple(env: Env): boolean {
  return Boolean(
    env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_PRIVATE_KEY
  )
}

/** The client secret Apple is sent, made (or kept from a little while ago). */
export async function appleSecret(env: Env, now = Date.now()): Promise<string> {
  if (!hasApple(env)) throw new Error("Signing in with Apple is not set up.")
  const by = `${env.APPLE_TEAM_ID}/${env.APPLE_KEY_ID}/${env.APPLE_CLIENT_ID}`
  const seconds = Math.floor(now / 1000)
  if (made && made.by === by && made.until > seconds) return made.secret

  const pem = env.APPLE_PRIVATE_KEY!.replace(/-----[^-]+-----|\s+/g, "")
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  )
  const signed = `${text({ alg: "ES256", kid: env.APPLE_KEY_ID })}.${text({
    iss: env.APPLE_TEAM_ID,
    iat: seconds,
    exp: seconds + LASTS,
    aud: "https://appleid.apple.com",
    sub: env.APPLE_CLIENT_ID,
  })}`
  // (WebCrypto signs as JWTs want it: r and s, side by side)
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signed)
  )
  const secret = `${signed}.${base64url(new Uint8Array(signature))}`
  made = { by, secret, until: seconds + KEPT }
  return secret
}
