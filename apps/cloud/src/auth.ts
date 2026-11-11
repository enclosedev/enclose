// Accounts, as Better Auth keeps them in the server's D1 database: signed in to with a
// code sent by email (no password), or with Google or Apple where the server has their
// keys, and from the app through the sign-in page, which hands the app what it signs in
// with by way of an enclose:// link (the electron plugin). The app then sends that
// session's token with each request (the bearer plugin).
import { electron } from "@better-auth/electron"
import { betterAuth } from "better-auth"
import { bearer } from "better-auth/plugins/bearer"
import { emailOTP } from "better-auth/plugins/email-otp"

import { onThisMachine } from "./account"
import { appleSecret, hasApple } from "./apple"
import { removeAll } from "./backup"
import { sendCode } from "./email"

/** What the app signs in as, through the sign-in page: the electron plugin's own. */
export const CLIENT_ID = "electron"
/** The link the app is handed back by, which it alone answers: `enclose://`. */
export const SCHEME = "enclose"
/** Where Apple sends people back from, by a form it posts (so, from its own origin). */
const APPLE = "https://appleid.apple.com"

const DAY = 24 * 60 * 60

/**
 * The secret Better Auth signs what it hands out with. On your own machine there is one
 * anybody can read, which is all a server with nobody's account in it needs; the server
 * people use has its own, set apart from the code.
 */
const LOCAL_SECRET = "enclose-local-secret-not-for-the-server-people-use"

function secretOf(env: Env): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET
  if (!onThisMachine(env)) throw new Error("BETTER_AUTH_SECRET is not set.")
  return LOCAL_SECRET
}

/** The ways in besides an email's code: those the server has the keys for. */
export type Provider = "google" | "apple"

export function providersOf(env: Env): Provider[] {
  const ways: Provider[] = []
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) ways.push("google")
  if (hasApple(env)) ways.push("apple")
  return ways
}

/** Whether the code Better Auth was to send, for one request, failed to go. */
export type Sending = { failed: boolean }

function make(env: Env, sending: Sending, apple: string | null) {
  return betterAuth({
    appName: "Enclose",
    baseURL: env.BASE_URL,
    basePath: "/api/auth",
    secret: secretOf(env),
    database: env.DB,
    // Better Auth would otherwise tell its makers about the server
    telemetry: { enabled: false },
    // Apple's sign-in comes back from Apple's site. (The app's requests say no origin:
    // they carry no cookies, only the session's token, and Better Auth asks for an
    // origin only where there are cookies.)
    trustedOrigins: apple ? [APPLE] : [],
    session: {
      // the app stays signed in while it is used: every day it is, the session goes on
      expiresIn: 90 * DAY,
      updateAge: DAY,
    },
    // (one account for each email: signing in with Google or Apple, as the email a code
    // was sent to before, is the same account, as both say they have checked the email)
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              // (which Google account, asked each time: not whichever is signed in)
              prompt: "select_account" as const,
            },
          }
        : {}),
      ...(apple && env.APPLE_CLIENT_ID
        ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: apple } }
        : {}),
    },
    // What Google or Apple hand over to sign someone in (their tokens for the account
    // there) is used for that, and not kept: nothing here asks them anything after.
    account: { updateAccountOnSignIn: false },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => ({ data: withoutTokens(account) }),
        },
        update: {
          before: async (account) => ({ data: withoutTokens(account) }),
        },
      },
    },
    // counted in the database, so that it holds across all of Cloudflare's machines
    rateLimit: { enabled: true, storage: "database" },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    // Deleting an account takes a session begun in the last day (Better Auth's
    // `freshAge`), so a token taken from an old sign-in cannot do it.
    // (and what the account keeps on Enclose Cloud goes with it)
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: (user) => removeAll(env, user.id),
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        // (the code is checked against what is kept, and nobody reading the database
        // can sign in with it)
        storeOTP: "hashed",
        // (Better Auth waits on the send, but says it went whether or not: what failed
        // is noted, for the reply to say so instead)
        sendVerificationOTP: async ({ email, otp }) => {
          try {
            await sendCode(env, email, otp)
          } catch (error) {
            sending.failed = true
            throw error
          }
        },
      }),
      bearer(),
      electron({ clientID: CLIENT_ID }),
    ],
  })
}

/** An account as Better Auth would keep it, without the provider's tokens. */
function withoutTokens<T extends object>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  }
}

export type Auth = ReturnType<typeof make>

/**
 * Better Auth, for one request, and whether a code it was to send failed to go. It is
 * made again for each: one kept from an earlier request waits there on what that request
 * began (its setup, read from the database), and the Workers runtime never lets another
 * request see that finish, so it hangs.
 */
export async function authFor(
  env: Env
): Promise<{ auth: Auth; sending: Sending }> {
  const sending: Sending = { failed: false }
  const apple = hasApple(env) ? await appleSecret(env) : null
  return { auth: make(env, sending, apple), sending }
}
