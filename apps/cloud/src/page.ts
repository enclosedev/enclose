// The page the app opens in the browser to sign in: an email, then the code sent to it.
// Once the code is right, the page hands the app what it signs in with by an enclose://
// link, and shows the same as a code to paste into the app, for where the link does not
// reach it (an app run from a checkout, some Linux desktops).
//
// The app opens the page with what the electron plugin asks for in its address
// (client_id, state, code_challenge), and the page passes those on as it signs in: it
// never sees what the app proves itself with (the code verifier), which stays in the app.

import { CLIENT_ID, SCHEME } from "./auth"

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
code {
  display: block; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line);
  font: 12px/1.4 ui-monospace, Menlo, monospace; word-break: break-all; user-select: all;
  color: var(--fg); text-align: left;
}
[hidden] { display: none !important; }
`

const SCRIPT = `
const asked = new URLSearchParams(location.search)
const pass = new URLSearchParams()
for (const key of ["client_id", "state", "code_challenge"]) pass.set(key, asked.get(key) || "")
const $ = (id) => document.getElementById(id)
const show = (id) => { for (const step of ["email-step", "code-step", "done-step", "lost-step"]) $(step).hidden = step !== id }
const say = (text) => { $("trouble").textContent = text || "" }
let email = ""

if (pass.get("client_id") !== ${JSON.stringify(CLIENT_ID)} || !pass.get("state") || !pass.get("code_challenge")) show("lost-step")

async function post(path, body) {
  const response = await fetch("/api/auth" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" })
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
  return { token, link: ${JSON.stringify(SCHEME)} + "://auth/callback#token=" + token }
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
    const { token, link } = linkFor(identifier)
    $("token").textContent = token
    show("done-step")
    location.href = link
  } catch (error) {
    say(error.message)
  } finally {
    button.disabled = false
  }
}

$("email-form").addEventListener("submit", sendCode)
$("code-form").addEventListener("submit", signIn)
$("other").addEventListener("click", () => { say(""); show("email-step"); $("email").focus() })
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("token").textContent)
  $("copy").textContent = "Copied"
})
`

/** The page, with the nonce its own script runs under and no other may. */
export function signInPage(nonce: string): string {
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
    <p>We'll email you a code. No password needed.</p>
    <form id="email-form">
      <input id="email" type="email" required autocomplete="email" placeholder="you@example.com" autofocus>
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
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`
}
