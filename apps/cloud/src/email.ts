// The code someone signs in with, sent to their email. Only the server people use sends
// it (through Resend, from an address on enclose.dev); one run on your own machine writes
// it in the terminal instead, where whoever is trying the app reads it from.

import { onThisMachine } from "./account"

/** Who the codes come from: an address on a domain Resend sends for. */
const FROM = "Enclose <sign-in@enclose.dev>"

/**
 * The codes a server that sends nothing has written out, the latest for each address:
 * the tests read them from here.
 */
export const outbox = new Map<string, string>()

export async function sendCode(
  env: Env,
  email: string,
  code: string
): Promise<void> {
  if (onThisMachine(env)) {
    // (nor does it pretend to send where nothing could be: an address on .invalid, a
    // name kept for that, is refused as Resend would refuse one it cannot send to)
    if (email.endsWith(".invalid"))
      throw new Error(`There is nowhere to send ${email}'s code.`)
    outbox.set(email, code)
    console.log(`[sign-in] the code for ${email} is ${code}`)
    return
  }
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set.")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: `${code} is your Enclose code`,
      text: `Your code to sign in to Enclose is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email: nobody can sign in without the code.`,
      html: `<p>Your code to sign in to Enclose is</p><p style="font-size:24px;font-weight:600;letter-spacing:4px">${code}</p><p>It works for 10 minutes. If you didn't ask for it, you can ignore this email: nobody can sign in without the code.</p>`,
    }),
  })
  // (said in the server's logs, never to the person signing in: what Resend answered)
  if (!response.ok)
    throw new Error(
      `Resend would not send the code: ${response.status} ${await response.text()}`
    )
}
