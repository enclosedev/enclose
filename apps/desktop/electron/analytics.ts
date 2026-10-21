// The app's count of how it is used. Each thing counted is an event: a name, and a few
// words and numbers that say which, all of them written out where it is recorded (in
// electron/main.ts). Nothing of a project, a message or a file is ever in one. Events go
// to PostHog under a name made up for this installation, with the app's version and the
// system it runs on. They wait here a few seconds and go together; what will not go is
// tried again, and after a few tries given up on. docs/usage-data.md says all of this to
// the user, and Settings has the switch for it.
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { ProviderId } from "../shared/api"

/**
 * The PostHog project the events go to, and where PostHog takes them in. The key is in
 * the app for anyone to read, and all it lets them do is send events. With none, nothing
 * is counted.
 */
export const POSTHOG = {
  key: "phc_BL8KrjiVwtgF38mwRJAuzaYFfyDoXEU5wwKxvJWurHWj",
  host: "https://us.i.posthog.com",
}

/**
 * The models each agent's makers name, as the agent knows them: what a model is counted
 * as by its name. opencode goes by a provider and a model, and only its own and the
 * makers' own providers are known; a provider of the user's own making is not.
 */
const KNOWN_MODELS: Record<ProviderId, RegExp> = {
  claude: /^(?:opus|sonnet|haiku|best|opusplan|claude-[a-z0-9.-]+)(?:\[1m\])?$/,
  codex: /^(?:gpt-[a-z0-9.-]+|o[0-9]+(?:-[a-z0-9-]+)?|codex-[a-z0-9.-]+)$/,
  grok: /^grok-[a-z0-9.-]+$/,
  opencode:
    /^(?:opencode|anthropic|openai|google|xai|deepseek|mistral|groq|openrouter|github-copilot|moonshotai|zai|cerebras)\/[a-z0-9][a-z0-9./:-]*$/,
}

/**
 * What a model is counted as: "default" where it was left to the agent, and its name
 * only where it is one of its makers' (KNOWN_MODELS). Any other is "custom": written in
 * by the user (`custom`), or of their own config, whose names can say what they would
 * rather not have sent.
 */
export function modelSaid(
  provider: ProviderId,
  model: string | null,
  custom: string[]
): string {
  if (model === null) return "default"
  if (custom.includes(model)) return "custom"
  return KNOWN_MODELS[provider].test(model) ? model : "custom"
}

/** What an event says besides its name. */
export type Properties = Record<string, string | number | boolean | null>

export type AnalyticsDeps = {
  /** the PostHog project the events go to */
  key: string
  /** where PostHog takes them in */
  host: string
  /** the file the name made up for this installation is kept in */
  file: string
  /** whether the user has left it switched on: asked each time */
  allowed: () => boolean
  /** what goes with every event: the app's version, and the system it runs on */
  about: Properties
  /** send this to there, and say whether it was taken */
  post: (
    url: string,
    body: string,
    signal: AbortSignal
  ) => Promise<{ ok: boolean }>
}

type Waiting = {
  uuid: string
  event: string
  properties: Properties
  timestamp: string
}

/** How long an event waits for others to go with, in ms. */
const SOON = 5_000
/** How many go at once. */
const MOST = 50
/** How many are kept waiting: past that, the oldest are let go of. */
const KEPT = 500
/** How long sending is given before it is taken to have failed, in ms. */
const SEND_MS = 10_000
/** How many times in a row sending may fail before what would not go is given up on. */
const TRIES = 5
/** How long it is until the next try after the first that failed, and at most, in ms. */
const AGAIN = 10_000
const AGAIN_MOST = 5 * 60_000

/** How long to leave it after `failures` tries in a row have failed: twice as long each time. */
export const againAfter = (failures: number): number =>
  Math.min(AGAIN_MOST, AGAIN * 2 ** (failures - 1))

const NAME = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

export class Analytics {
  private readonly deps: AnalyticsDeps
  private waiting: Waiting[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private sending = false
  /** how many tries in a row have failed */
  private failures = 0
  /** the features counted since the app was started */
  private readonly counted = new Set<string>()

  constructor(deps: AnalyticsDeps) {
    this.deps = deps
  }

  /** Count something that happened. */
  record(event: string, properties: Properties = {}) {
    if (!this.deps.key || !this.deps.allowed()) return
    this.waiting.push({
      // (so that one sent twice, the first not known to have arrived, is counted once)
      uuid: randomUUID(),
      event,
      properties,
      timestamp: new Date().toISOString(),
    })
    if (this.waiting.length > KEPT)
      this.waiting.splice(0, this.waiting.length - KEPT)
    this.soon(SOON)
  }

  /** Count a part of the app being put to use: once for each run of the app. */
  used(feature: string) {
    if (!this.deps.allowed() || this.counted.has(feature)) return
    this.counted.add(feature)
    this.record("feature used", { feature })
  }

  /** It has been switched off: what was waiting is not sent. */
  forget() {
    this.waiting = []
    this.counted.clear()
    clearTimeout(this.timer)
    this.timer = undefined
  }

  /** The app is being quit: what is waiting is sent off, and not waited on. */
  close() {
    clearTimeout(this.timer)
    this.timer = undefined
    void this.send(false)
  }

  /**
   * The name this installation goes by: made up the first time it is wanted, and kept.
   * Null where it cannot be kept, and then nothing is sent, since every run of the app
   * would be counted as somebody new.
   */
  private name(): string | null {
    const { file } = this.deps
    try {
      const kept = fs.readFileSync(file, "utf8").trim()
      if (NAME.test(kept)) return kept
    } catch {
      // first run: there is none yet
    }
    try {
      const made = randomUUID()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${made}\n`)
      return made
    } catch {
      return null
    }
  }

  private soon(ms: number) {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.send()
    }, ms)
  }

  /** Send the oldest of what is waiting, and the rest after it unless told to stop there. */
  private async send(on = true) {
    if (this.sending || this.waiting.length === 0) return
    const name = this.deps.allowed() ? this.name() : null
    if (!name) {
      this.waiting = []
      return
    }
    const batch = this.waiting.slice(0, MOST)
    this.sending = true
    let taken = false
    try {
      const { key, host, about } = this.deps
      const answer = await this.deps.post(
        `${host}/batch/`,
        JSON.stringify({
          api_key: key,
          batch: batch.map(({ uuid, event, properties, timestamp }) => ({
            uuid,
            event,
            distinct_id: name,
            properties: {
              ...properties,
              ...about,
              // an installation, not a person: PostHog keeps no profile of it
              $process_person_profile: false,
            },
            timestamp,
          })),
        }),
        AbortSignal.timeout(SEND_MS)
      )
      taken = answer.ok
    } catch {
      // no connection, or no answer in time
    }
    this.sending = false
    if (taken) this.failures = 0
    else this.failures++
    if (taken || this.failures % TRIES === 0)
      this.waiting = this.waiting.filter((one) => !batch.includes(one))
    if (!on) return
    if (!taken) this.soon(againAfter(this.failures))
    else if (this.waiting.length > 0) this.soon(0)
  }
}
