// What has run out, gone from the database once a day (a cron trigger, wrangler.jsonc):
// sessions and sign-in codes past their time, and what the rate limits counted of the day
// before. Better Auth leaves them there, and they would only grow.

const DAY = 24 * 60 * 60 * 1000

export async function tidy(env: Env, now = Date.now()): Promise<void> {
  // (Better Auth keeps these times as ISO text, and the rate limits' as ms)
  const at = new Date(now).toISOString()
  await env.DB.batch([
    env.DB.prepare(`delete from "session" where "expiresAt" < ?`).bind(at),
    env.DB.prepare(`delete from "verification" where "expiresAt" < ?`).bind(at),
    env.DB.prepare(`delete from "rateLimit" where "lastRequest" < ?`).bind(
      now - DAY
    ),
  ])
}
