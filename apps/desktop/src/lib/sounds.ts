// What is heard as an agent's work comes to something: a round little pop, made as it is
// played (no sound files), a few notes of it saying which. Off where the settings say so.
import type { ConversationSummary } from "@shared/api"
import { usePreferences } from "@/lib/preferences"

/**
 * done: a turn is over. asking: an agent waits on the user, for an answer or a yes.
 * failed: a turn, or a board made in the background, did not get through. board: a
 * board made in the background is done.
 */
export type Cue = "done" | "asking" | "failed" | "board"

/** Which of two cues heard at once is the one played: what most wants the user first. */
const FIRST: readonly Cue[] = ["asking", "failed", "board", "done"]

/**
 * What is to be heard of the conversations having gone from as they were to as they are
 * now: null where nothing came to anything. Only of those there before, so that the
 * list as the app starts, or a project opened, is not heard.
 */
export function cueOf(
  before: ConversationSummary[],
  now: ConversationSummary[]
): Cue | null {
  const was = new Map(before.map((c) => [c.id, c]))
  const heard = new Set<Cue>()
  for (const c of now) {
    const then = was.get(c.id)
    if (!then) continue
    if (c.status === "asking" && then.status !== "asking") heard.add("asking")
    if (c.status === "idle" && then.status !== "idle") {
      if (c.failed) heard.add("failed")
      // (where something said meanwhile goes on at once, the work is not over)
      else if (c.queued.length === 0) heard.add("done")
    }
    const job = c.lastJob
    if (
      job &&
      then.lastJob?.id === job.id &&
      then.lastJob.state === "working" &&
      job.state !== "working"
    ) {
      // (one stopped was stopped by the user, who knows)
      if (job.state === "done") heard.add("board")
      else if (job.state === "failed") heard.add("failed")
    }
  }
  return FIRST.find((cue) => heard.has(cue)) ?? null
}

/** The notes of each, as semitones over the pop's own note and when (s) each comes. */
const NOTES: Record<Cue, [number, number][]> = {
  done: [
    [0, 0],
    [7, 0.11],
  ],
  asking: [
    [12, 0],
    [12, 0.16],
  ],
  failed: [
    [7, 0],
    [1, 0.14],
  ],
  board: [
    [0, 0],
    [4, 0.085],
    [7, 0.17],
    [12, 0.255],
  ],
}
/** the pop's own note, D5 */
const NOTE = 587.33
const LOUDNESS = 0.6

let audio: { context: AudioContext; out: GainNode } | null = null
let last: { cue: Cue; at: number } | null = null

/** One pop: a sine that bends up into its note as it starts, and is gone in 130ms. */
function pop(context: AudioContext, out: AudioNode, note: number, at: number) {
  for (const [ratio, loudness, length] of [
    [1, 0.34, 0.13],
    [2, 0.04, 0.05],
  ] as const) {
    const tone = context.createOscillator()
    tone.frequency.setValueAtTime(note * ratio * 0.62, at)
    tone.frequency.exponentialRampToValueAtTime(note * ratio, at + 0.06)
    const level = context.createGain()
    level.gain.setValueAtTime(0.0001, at)
    level.gain.exponentialRampToValueAtTime(loudness, at + 0.002)
    level.gain.exponentialRampToValueAtTime(0.0001, at + length)
    tone.connect(level).connect(out)
    tone.start(at)
    tone.stop(at + length + 0.05)
  }
}

/** Play a cue, where the settings have sounds on. The same one twice at once, once. */
export function play(cue: Cue) {
  if (!usePreferences.getState().sounds) return
  if (typeof AudioContext === "undefined") return
  const now = performance.now()
  if (last?.cue === cue && now - last.at < 400) return
  last = { cue, at: now }
  if (!audio) {
    const context = new AudioContext()
    const out = context.createGain()
    out.gain.value = LOUDNESS
    const level = context.createDynamicsCompressor()
    level.threshold.value = -14
    out.connect(level).connect(context.destination)
    audio = { context, out }
  }
  const { context, out } = audio
  if (context.state === "suspended") void context.resume()
  // a failure lower, and a little softer
  const failing = cue === "failed"
  const note = NOTE * (failing ? 0.75 : 1)
  const start = context.currentTime + 0.02
  const softer = context.createGain()
  softer.gain.value = failing ? 0.8 : 1
  softer.connect(out)
  for (const [semitones, after] of NOTES[cue])
    pop(context, softer, note * 2 ** (semitones / 12), start + after)
  setTimeout(() => softer.disconnect(), 1500)
}
