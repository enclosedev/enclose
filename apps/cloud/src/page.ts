// The page the app opens in the browser to sign in: an email, then the code sent to it.
// Once the code is right, the page hands the app what it signs in with by an enclose://
// link, and shows the same as a code to paste into the app, for where the link does not
// reach it (an app run from a checkout, some Linux desktops).
//
// The app opens the page with what the electron plugin asks for in its address
// (client_id, state, code_challenge), and the page passes those on as it signs in: it
// never sees what the app proves itself with (the code verifier), which stays in the app.
//
// Where the server has Google's or Apple's keys, the page also signs in with them: it
// starts the sign-in with what the app asked for, the electron plugin keeps that in a
// cookie while the person is at Google or Apple, and once they are back, at
// /sign-in/done, the plugin has left what the page hands the app in a cookie of its own.
//
// On the server people use, the page has Cloudflare's Turnstile check that whoever asks
// for a code is a person (src/turnstile.ts), unseen unless Cloudflare is unsure.

import { CLIENT_ID, SCHEME, type Provider } from "./auth"
import { ACTION, HEADER } from "./turnstile"

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f4f4f2; --card: #ffffff; --fg: #1d1d1b; --muted: #6b6b66;
  --line: rgba(0,0,0,.12); --accent: #1d1d1b; --accent-fg: #ffffff; --bad: #c4372c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --card: #20201f; --fg: #ededea; --muted: #9a9a94;
    --line: rgba(255,255,255,.12); --accent: #ededea; --accent-fg: #161615; --bad: #ef6b5f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: var(--bg); color: var(--fg);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main {
  width: 100%; max-width: 340px; background: var(--card); border-radius: 24px;
  padding: 32px 28px 24px; box-shadow: 0 0 0 1px var(--line), 0 20px 50px rgba(0,0,0,.08);
  display: flex; flex-direction: column; gap: 14px; text-align: center;
}
.mark { font-weight: 600; letter-spacing: .02em; }
section { display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0; font-size: 18px; font-weight: 600; }
p { margin: 0; color: var(--muted); }
form { display: flex; flex-direction: column; gap: 10px; margin: 4px 0 0; }
input {
  width: 100%; height: 40px; padding: 0 14px; border-radius: 12px; font: inherit;
  color: var(--fg); background: transparent; border: 1px solid var(--line); outline: none;
}
input:focus { border-color: var(--fg); }
#code { text-align: center; font-size: 20px; letter-spacing: 6px; font-variant-numeric: tabular-nums; }
button {
  height: 40px; border: 0; border-radius: 999px; font: inherit; font-weight: 500;
  background: var(--accent); color: var(--accent-fg); cursor: pointer;
}
button:disabled { opacity: .5; cursor: default; }
.quiet { background: none; color: var(--muted); height: auto; padding: 4px; }
.bad { color: var(--bad); }
.bad:empty { display: none; }
#person:empty { display: none; }
#person { display: flex; justify-content: center; }
code {
  display: block; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line);
  font: 12px/1.4 ui-monospace, Menlo, monospace; word-break: break-all; user-select: all;
  color: var(--fg); text-align: left;
}
.provider {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: transparent; color: var(--fg); box-shadow: inset 0 0 0 1px var(--line);
}
.provider svg { width: 16px; height: 16px; }
.or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
[hidden] { display: none !important; }
`

/** The cookie the electron plugin leaves the sign-in in, after Google or Apple. */
const HANDED = "better-auth.electron"

const GOOGLE_MARK = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`
const APPLE_MARK = `<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`

const BUTTONS: Record<Provider, string> = {
  google: `<button class="provider" type="button" data-provider="google">${GOOGLE_MARK}Continue with Google</button>`,
  apple: `<button class="provider" type="button" data-provider="apple">${APPLE_MARK}Continue with Apple</button>`,
}

const SCRIPT = (sitekey: string | null) => `
const SITEKEY = ${JSON.stringify(sitekey)}
const asked = new URLSearchParams(location.search)
const pass = new URLSearchParams()
for (const key of ["client_id", "state", "code_challenge"]) pass.set(key, asked.get(key) || "")
const $ = (id) => document.getElementById(id)
const show = (id) => { for (const step of ["email-step", "code-step", "done-step", "lost-step"]) $(step).hidden = step !== id }
const say = (text) => { $("trouble").textContent = text || "" }
const back = location.pathname === "/sign-in/done"
let email = ""

if (!back && (pass.get("client_id") !== ${JSON.stringify(CLIENT_ID)} || !pass.get("state") || !pass.get("code_challenge"))) show("lost-step")

// Turnstile's token, that this is a person: one for each code asked for
const NOT_A_PERSON = "We couldn't tell you're a person. Reload the page and try again."
let widget = null
let token = ""
let waiting = []
function person() {
  if (!SITEKEY || token) return Promise.resolve(token)
  return new Promise((resolve, reject) => {
    waiting.push({ resolve, reject })
    // (Turnstile's script never came: blocked, or out of reach)
    if (widget === null) setTimeout(() => {
      if (widget === null) for (const one of waiting.splice(0)) one.reject(new Error(NOT_A_PERSON))
    }, 15000)
  })
}
function nextPerson() {
  token = ""
  if (widget !== null) window.turnstile.reset(widget)
}
window.turnstileReady = () => {
  widget = window.turnstile.render("#person", {
    sitekey: SITEKEY,
    action: ${JSON.stringify(ACTION)},
    appearance: "interaction-only",
    callback: (made) => { token = made; for (const one of waiting.splice(0)) one.resolve(made) },
    "expired-callback": () => { token = "" },
    "error-callback": () => { token = ""; for (const one of waiting.splice(0)) one.reject(new Error(NOT_A_PERSON)) },
  })
}

async function post(path, body, headers = {}) {
  const response = await fetch("/api/auth" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const why = (data && data.message) || ""
    throw new Error(response.status === 429
      ? "Too many tries. Wait a minute and try again."
      : why || "Something went wrong. Try again.")
  }
  return data
}

async function sendCode(event) {
  event.preventDefault()
  const button = $("send")
  button.disabled = true
  say("")
  try {
    email = $("email").value.trim()
    const checked = await person()
    // (a token is used once, whether or not the code went: the next ask takes another)
    try {
      await post("/email-otp/send-verification-otp", { email, type: "sign-in" }, SITEKEY ? { ${JSON.stringify(HEADER)}: checked } : {})
    } finally {
      if (SITEKEY) nextPerson()
    }
    $("sent-to").textContent = email
    show("code-step")
    $("code").value = ""
    $("code").focus()
  } catch (error) {
    say(error.message)
  } finally {
    button.disabled = false
  }
}

function linkFor(identifier) {
  const json = JSON.stringify({ identifier, state: pass.get("state") })
  const bytes = new TextEncoder().encode(json)
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  const token = btoa(text).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "")
  return { token }
}

/** Hand the app the sign-in: by the link, and as the code to paste where that fails. */
function handOver(token) {
  $("token").textContent = token
  show("done-step")
  location.href = ${JSON.stringify(SCHEME)} + "://auth/callback#token=" + token
}

/** To Google or Apple, with what the app asked for kept (by the electron plugin) till back. */
async function withProvider(button) {
  button.disabled = true
  say("")
  try {
    const data = await post("/sign-in/social?" + pass.toString(), {
      provider: button.dataset.provider,
      callbackURL: "/sign-in/done",
      errorCallbackURL: "/sign-in/done",
    })
    if (!data || !data.url) throw new Error("Something went wrong. Try again.")
    location.href = data.url
  } catch (error) {
    say(error.message)
    button.disabled = false
  }
}

/** Back from Google or Apple: what the electron plugin left for the app, handed over. */
function cameBack() {
  const name = ${JSON.stringify(HANDED)}
  const kept = document.cookie.split("; ").find((one) => one.startsWith(name + "="))
  // (set URL-encoded, and padded, which the link to the app has no room for)
  const token = kept ? decodeURIComponent(kept.slice(name.length + 1)).replace(/=+$/, "") : ""
  document.cookie = name + "=; Max-Age=0; path=/; secure; samesite=lax"
  if (/^[A-Za-z0-9_-]+$/.test(token)) return handOver(token)
  show("lost-step")
  say(asked.get("error") ? "Signing in didn't work. Start again from Enclose." : "")
}

async function signIn(event) {
  event.preventDefault()
  const button = $("verify")
  button.disabled = true
  say("")
  try {
    const otp = $("code").value.replace(/\\s+/g, "")
    const data = await post("/sign-in/email-otp?" + pass.toString(), { email, otp })
    const identifier = data && data.electron_authorization_code
    if (!identifier) throw new Error("Signed in, but Enclose could not be told. Start again from Enclose.")
    handOver(linkFor(identifier).token)
  } catch (error) {
    say(error.message)
  } finally {
    button.disabled = false
  }
}

if (back) cameBack()
for (const button of document.querySelectorAll("[data-provider]")) button.addEventListener("click", () => withProvider(button))
$("email-form").addEventListener("submit", sendCode)
$("code-form").addEventListener("submit", signIn)
$("other").addEventListener("click", () => { say(""); show("email-step"); $("email").focus() })
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("token").textContent)
  $("copy").textContent = "Copied"
})
`

/**
 * The page, with the nonce its own script runs under and no other may (but Turnstile's,
 * where the page has the widget of the sitekey given).
 */
export function signInPage(
  nonce: string,
  sitekey: string | null,
  providers: Provider[] = []
): string {
  const ways = providers.length
    ? `\n    ${providers.map((one) => BUTTONS[one]).join("\n    ")}\n    <div class="or">or</div>`
    : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Sign in to Enclose</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
  <div class="mark">Enclose</div>
  <section id="email-step">
    <h1>Sign in to Enclose</h1>
    <p>${providers.length ? "Continue with your account, or get a code by email." : "We'll email you a code. No password needed."}</p>${ways}
    <form id="email-form">
      <input id="email" type="email" required autocomplete="email" placeholder="you@example.com" autofocus>
      <div id="person"></div>
      <button id="send" type="submit">Send code</button>
    </form>
  </section>
  <section id="code-step" hidden>
    <h1>Check your email</h1>
    <p>Enter the code we sent to <strong id="sent-to"></strong>.</p>
    <form id="code-form">
      <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required>
      <button id="verify" type="submit">Sign in</button>
      <button id="other" class="quiet" type="button">Use another email</button>
    </form>
  </section>
  <section id="done-step" hidden>
    <h1>You're signed in</h1>
    <p>Going back to Enclose. If it didn't open, paste this code into Enclose:</p>
    <code id="token"></code>
    <button id="copy" type="button">Copy code</button>
  </section>
  <section id="lost-step" hidden>
    <h1>Start from Enclose</h1>
    <p>Open Enclose's settings, then Account, and sign in from there.</p>
  </section>
  <p id="trouble" class="bad" role="alert"></p>
</main>
<script nonce="${nonce}">${SCRIPT(sitekey)}</script>${
    sitekey
      ? `\n<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=turnstileReady" async defer></script>`
      : ""
  }
</body>
</html>`
}
