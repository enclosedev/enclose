// The page the app opens in the browser to sign in: an email, then the code sent to it.
// Once the code is right, the page hands the app what it signs in with: to the app on
// this machine, where the app said it listens there (`loopback`, its port at 127.0.0.1),
// or else by an enclose:// link. It shows the same as a code to paste into the app, for
// where neither reaches it.
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
// Where the browser is signed in already (from signing in before), the page offers that
// account to the app at a click, "Continue", through the electron plugin's transfer: a
// click, and not of itself, so that a link someone else made the page with does not sign
// their app in as you unseen.
//
// On the server people use, the page has Cloudflare's Turnstile check that whoever asks
// for a code is a person (src/turnstile.ts), unseen unless Cloudflare is unsure.

import { CLIENT_ID, SCHEME, type Provider } from "./auth"
import { ACTION, HEADER } from "./turnstile"

const STYLE = `
@font-face {
  font-family: "Inter Variable";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/InterVariable.woff2") format("woff2");
}
:root {
  color-scheme: dark;
  --bg: #171717; --fg: #fafafa; --muted: #a1a1a1; --faint: #737373;
  --raised: #262626; --line: rgba(255,255,255,.1); --bad: #ff7a6e;
}
* { box-sizing: border-box; }
html {
  font-variation-settings: "opsz" 32; font-feature-settings: "ss03";
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
body {
  margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  background: var(--bg); color: var(--fg);
  font: 400 18px/1.3 "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.012em;
}
main {
  flex: 1; width: 100%; max-width: 384px; padding: 16vh 24px 48px;
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.mark { width: 64px; height: 64px; margin-bottom: 28px; color: var(--fg); }
section { width: 100%; display: flex; flex-direction: column; align-items: center; }
h1 { margin: 0; font-size: 1em; font-weight: 500; line-height: 1.2; text-wrap: balance; }
p { margin: 4px 0 0; color: var(--muted); text-wrap: balance; }
p strong { color: var(--fg); font-weight: 500; }
.ways, form { width: 100%; display: flex; flex-direction: column; gap: 10px; margin: 28px 0 0; }
.ways + form { margin-top: 10px; }
input {
  width: 100%; height: 52px; padding: 0 22px; border: 0; border-radius: 999px;
  background: var(--raised); color: var(--fg); font: inherit; text-align: center; outline: none;
}
input::placeholder { color: var(--faint); }
input:focus-visible { box-shadow: 0 0 0 2px var(--fg); }
/* the code: one field, out of sight over six boxes that show what is typed in it */
.digits { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.digits span {
  display: flex; align-items: center; justify-content: center; height: 60px; border-radius: 14px;
  background: var(--raised); font-size: 26px; font-weight: 500; font-variant-numeric: tabular-nums;
}
.digits:focus-within span.at { box-shadow: 0 0 0 2px var(--fg); }
#code {
  position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border-radius: 14px;
  opacity: 0; cursor: text;
}
button {
  height: 52px; border: 0; border-radius: 999px; font: inherit; font-weight: 500;
  background: var(--fg); color: var(--bg); cursor: pointer; transition: opacity .2s;
}
button:hover { opacity: .82; }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
.provider {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: var(--raised); color: var(--fg);
}
.provider svg { width: 18px; height: 18px; }
.quiet { height: auto; padding: 8px; background: none; color: var(--muted); font-weight: 400; }
.quiet:hover { opacity: 1; color: var(--fg); }
#person { display: flex; justify-content: center; }
#person:empty { display: none; }
.bad { margin-top: 16px; color: var(--bad); font-size: 16px; }
.bad:empty { display: none; }
code {
  display: block; width: 100%; margin-top: 24px; padding: 14px 18px; border-radius: 14px;
  background: var(--raised); color: var(--fg); text-align: left; letter-spacing: 0;
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all; user-select: all;
}
#copy { width: 100%; margin-top: 10px; }
.note { margin-top: 16px; color: var(--faint); font-size: 14px; letter-spacing: 0; }
footer {
  display: flex; gap: 20px; justify-content: center; padding: 24px;
  color: var(--faint); font-size: 14px; letter-spacing: 0;
}
footer a { color: inherit; text-decoration: none; transition: color .2s; }
footer a:hover { color: var(--fg); }
[hidden] { display: none !important; }
`

/** Enclose's mark, as the app draws it at rest (src/components/mark.tsx there). */
const MARK = `<svg viewBox="-50 -50 100 100" class="mark" aria-hidden="true" fill="currentColor"><g><line x2="-31.819805153394636" y2="18.36918251601112" stroke="currentColor" stroke-width="3" stroke-linecap="round"></line><circle cx="-31.819805153394636" cy="18.36918251601112" r="5"></circle></g><g><line x2="31.81980515339464" y2="18.369182516011115" stroke="currentColor" stroke-width="3" stroke-linecap="round"></line><circle cx="31.81980515339464" cy="18.369182516011115" r="5"></circle></g><g><line x2="0" y2="-36.74433653485858" stroke="currentColor" stroke-width="3" stroke-linecap="round"></line><circle cx="0" cy="-36.74433653485858" r="5"></circle></g><g><circle cx="0" cy="27.445624295763153" r="1.5"></circle><circle cx="0" cy="21.956499436610525" r="1.5"></circle><circle cx="0" cy="16.467374577457893" r="1.5"></circle><circle cx="0" cy="10.978249718305262" r="1.5"></circle><circle cx="0" cy="5.489124859152634" r="1.5"></circle><circle cx="0" cy="36.74433653485858" r="5"></circle></g><g><circle cx="-23.76701614420597" cy="-13.720406372988942" r="1.5"></circle><circle cx="-19.01361291536478" cy="-10.976325098391156" r="1.5"></circle><circle cx="-14.260209686523584" cy="-8.232243823793366" r="1.5"></circle><circle cx="-9.50680645768239" cy="-5.488162549195578" r="1.5"></circle><circle cx="-4.753403228841197" cy="-2.7440812745977903" r="1.5"></circle><circle cx="-31.81980515339464" cy="-18.369182516011115" r="5"></circle></g><g><circle cx="23.767016144205968" cy="-13.720406372988943" r="1.5"></circle><circle cx="19.013612915364778" cy="-10.976325098391156" r="1.5"></circle><circle cx="14.260209686523583" cy="-8.232243823793366" r="1.5"></circle><circle cx="9.506806457682389" cy="-5.488162549195578" r="1.5"></circle><circle cx="4.753403228841196" cy="-2.7440812745977903" r="1.5"></circle><circle cx="31.819805153394636" cy="-18.36918251601112" r="5"></circle></g></svg>`

/** What the site's own pages end with: where it is, and its terms. */
const FOOTER = `<footer>
  <a href="https://enclose.dev">Enclose</a>
  <a href="https://enclose.dev/terms">Terms</a>
  <a href="https://enclose.dev/privacy">Privacy</a>
</footer>`

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
const show = (id) => { for (const step of ["account-step", "email-step", "code-step", "done-step", "lost-step"]) $(step).hidden = step !== id }
const say = (text) => { $("trouble").textContent = text || "" }
const back = location.pathname === "/sign-in/done"
// where the app listens for the sign-in, on this machine: its port, where it said one
const port = /^\\d{4,5}$/.test(asked.get("loopback") || "") && Number(asked.get("loopback")) <= 65535 ? asked.get("loopback") : null
let email = ""

const lost = !back && (pass.get("client_id") !== ${JSON.stringify(CLIENT_ID)} || !pass.get("state") || !pass.get("code_challenge"))
if (lost) show("lost-step")

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
    theme: "dark",
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
    drawDigits()
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
  // (a page the browser goes to, and not a request from this one: a browser asks first
  // before a site may send requests to this machine, and lets it go to a page there.
  // In place of this one, so that the tab has nothing before what it ends at, and may
  // be closed by it: see signedInPage)
  if (port) location.replace("http://127.0.0.1:" + port + "/auth/callback?token=" + token)
  else location.href = ${JSON.stringify(SCHEME)} + "://auth/callback#token=" + token
}

/** Signed in already, in this browser: that account offered, where nothing is begun yet. */
async function alreadyIn() {
  let data = null
  try {
    const response = await fetch("/api/auth/get-session", { cache: "no-store" })
    if (response.ok) data = await response.json()
  } catch {
    return
  }
  if (!data || !data.user || $("email-step").hidden || $("email").value) return
  $("as").textContent = data.user.email
  show("account-step")
  $("continue").focus()
}

/** The account this browser is signed in to, handed to the app. */
async function continueAs() {
  const button = $("continue")
  button.disabled = true
  say("")
  try {
    const data = await post("/electron/transfer-user?" + pass.toString(), {})
    const identifier = data && data.electron_authorization_code
    if (!identifier) throw new Error("Enclose could not be told. Start again from Enclose.")
    handOver(linkFor(identifier).token)
  } catch (error) {
    say(error.message)
    button.disabled = false
  }
}

/** To Google or Apple, with what the app asked for kept (by the electron plugin) till back. */
async function withProvider(button) {
  button.disabled = true
  say("")
  try {
    const data = await post("/sign-in/social?" + pass.toString(), {
      provider: button.dataset.provider,
      callbackURL: "/sign-in/done" + (port ? "?loopback=" + port : ""),
      errorCallbackURL: "/sign-in/done" + (port ? "?loopback=" + port : ""),
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

/** The six boxes, showing the code as typed, and which comes next. */
function drawDigits() {
  const value = $("code").value
  const boxes = document.querySelectorAll("#digits span")
  boxes.forEach((box, at) => {
    box.textContent = value[at] || ""
    box.classList.toggle("at", at === Math.min(value.length, boxes.length - 1))
  })
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
else if (!lost) alreadyIn()
$("continue").addEventListener("click", continueAs)
$("another").addEventListener("click", () => { say(""); show("email-step"); $("email").focus() })
for (const button of document.querySelectorAll("[data-provider]")) button.addEventListener("click", () => withProvider(button))
$("email-form").addEventListener("submit", sendCode)
$("code-form").addEventListener("submit", signIn)
$("code").addEventListener("input", () => {
  const code = $("code")
  code.value = code.value.replace(/\\D/g, "").slice(0, 6)
  drawDigits()
  // (all six in, as typed or pasted or filled in by the browser: signed in with them)
  if (code.value.length === 6 && !$("verify").disabled) $("code-form").requestSubmit()
})
$("other").addEventListener("click", () => { say(""); show("email-step"); $("email").focus() })
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("token").textContent)
  $("copy").textContent = "Copied"
})
`

/** Where the browser goes once the app has the sign-in, where the tab is not closed. */
export const SITE = "https://enclose.dev"

/**
 * Where the app sends the browser once it has the sign-in (from 127.0.0.1, so that its
 * address is not left in the browser): the tab closes, where the browser lets it (it
 * does where nothing came before in the tab, as after the email's code), or goes on to
 * Enclose's site. Where signing in failed (`?failed`), it says so, and the app says why.
 */
export function signedInPage(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Enclose</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
  ${MARK}
  <section id="in">
    <h1>You're signed in</h1>
    <p>Going back to Enclose.</p>
  </section>
  <section id="failed" hidden>
    <h1>Signing in didn't work</h1>
    <p>Go back to Enclose to see why, and try again.</p>
  </section>
</main>
${FOOTER}
<script nonce="${nonce}">
if (new URLSearchParams(location.search).has("failed")) {
  document.getElementById("in").hidden = true
  document.getElementById("failed").hidden = false
} else {
  window.close()
  setTimeout(() => location.replace(${JSON.stringify(SITE)}), 250)
}
</script>
</body>
</html>`
}

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
    ? `\n    <div class="ways">\n      ${providers.map((one) => BUTTONS[one]).join("\n      ")}\n    </div>`
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
  ${MARK}
  <section id="account-step" hidden>
    <h1>Sign in to Enclose</h1>
    <p>You're signed in on this browser as <strong id="as"></strong>.</p>
    <form>
      <button id="continue" type="button">Continue</button>
      <button id="another" class="quiet" type="button">Use another account</button>
    </form>
  </section>
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
      <div id="digits" class="digits">
        <span></span><span></span><span></span><span></span><span></span><span></span>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Code" required>
      </div>
      <button id="verify" type="submit">Sign in</button>
      <button id="other" class="quiet" type="button">Use another email</button>
    </form>
  </section>
  <section id="done-step" hidden>
    <h1>You're signed in</h1>
    <p>Going back to Enclose. If it didn't open, paste this code into Enclose:</p>
    <code id="token"></code>
    <button id="copy" type="button">Copy code</button>
    <p class="note">Paste it into the Enclose app and nowhere else: nobody from Enclose will ever ask you for it.</p>
  </section>
  <section id="lost-step" hidden>
    <h1>Start from Enclose</h1>
    <p>Open Enclose's settings, then Account, and sign in from there.</p>
  </section>
  <p id="trouble" class="bad" role="alert"></p>
</main>
${FOOTER}
<script nonce="${nonce}">${SCRIPT(sitekey)}</script>${
    sitekey
      ? `\n<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=turnstileReady" async defer></script>`
      : ""
  }
</body>
</html>`
}
