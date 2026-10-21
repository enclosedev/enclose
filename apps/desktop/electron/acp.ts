// The Agent Client Protocol, as the agents that speak it are run: what the app says on
// taking up the line, how long each step is waited for, and what an agent says and does
// over one turn, kept as it comes. Grok and opencode each say the protocol's parts in
// their own words; this is the part that is the same for both.
import os from "node:os"

import type { Access, PermissionAnswer, ThreadItem } from "../shared/api"
import type { Launch, Looked } from "./providers"
import { NO_SUCH_METHOD, RpcError, startPeer, type Peer } from "./rpc"
import { inside, piecesOf, stopped, type Turn } from "./turn"

/**
 * What the app says it is and can do, on taking up the line. It reads no files and runs
 * no terminals for the agent: the agent has its own of both.
 */
export const HELLO = {
  protocolVersion: 1,
  clientCapabilities: {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
  },
  clientInfo: { name: "enclose", version: "0.1.0" },
}

/** How long an agent is given to say what it has. */
export const ASKING_TIMEOUT_MS = 20_000
/** How long it is given to take a conversation up again. */
export const LOADING_TIMEOUT_MS = 90_000
/**
 * A conversation taken up again is played back to the app, and an agent does not always
 * say when that is over: this long with nothing more of it is taken for the end.
 */
export const REPLAY_QUIET_MS = 2000
/** How long an agent is given to wind a turn up once it has been told to stop. */
export const STOPPING_TIMEOUT_MS = 3000

/** A tool call as an agent reports one, in as much as the app reads of it. */
export type AcpToolCall = {
  toolCallId?: string
  /** the tool's own name, as some agents give it */
  name?: string | null
  title?: string | null
  kind?: string | null
  status?: string | null
  rawInput?: unknown
  locations?: { path?: string }[] | null
  /** what an agent says of a tool of its own making, beyond what the protocol has room for */
  _meta?: { "x.ai/tool"?: { name?: string; kind?: string } | null } | null
}

export type AcpUpdate = AcpToolCall & {
  sessionUpdate?: string
  content?: { type?: string; text?: string } | null
}

export type AcpOption = { optionId: string; kind: string }

/** What an agent says over the line, as the app reads it. */
export type AcpTold = {
  sessionId?: string
  update?: AcpUpdate
  stopReason?: string | null
  _meta?: { isReplay?: boolean } | null
}

/** A value out of a tool call's input, by the first of these names that has one. */
export function field(input: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = (input as Record<string, unknown> | null)?.[key]
    if (typeof value === "string" && value) return value
    if (Array.isArray(value) && value.every((one) => typeof one === "string"))
      return value.join(" ")
  }
  return ""
}

/**
 * One turn of a conversation, as the agent says it: what it is saying now, what has been
 * said of each tool call, and what is on show of them.
 */
export class AcpTurn {
  /** the agent's name for the conversation, once it has said it */
  sessionId = ""
  /** a conversation is being taken up again: what arrives is what was said before */
  private replaying = false
  private replayedAt = 0
  /** what the agent is saying now; what it does next ends it, and it begins another */
  private speech: {
    now: Extract<ThreadItem, { kind: "assistant" }> | null
    count: number
  } = { now: null, count: 0 }
  private calls = new Map<string, AcpToolCall>()
  private tools = new Map<string, Extract<ThreadItem, { kind: "tool" }>>()
  private over: (stopReason: string | null) => void = () => {}
  private readonly turn: Turn
  private readonly run: string
  private readonly step: (call: AcpToolCall) => {
    name: string
    detail: string
  }
  private readonly done?: (
    method: string,
    told: AcpTold,
    sessionId: string
  ) => string | null | undefined
  /**
   * Resolves when the agent says the turn is over apart from the prompt's answer. Some
   * agents do not; an unresolved promise is no one's wait.
   */
  readonly finished: Promise<string | null>

  constructor(
    turn: Turn,
    run: string,
    step: (call: AcpToolCall) => { name: string; detail: string },
    done?: (
      method: string,
      told: AcpTold,
      sessionId: string
    ) => string | null | undefined
  ) {
    this.turn = turn
    this.run = run
    this.step = step
    this.done = done
    this.finished = new Promise((resolve) => (this.over = resolve))
  }

  /** What is arriving now is the conversation being taken up again, played back. */
  beginReplay() {
    this.replaying = true
    this.replayedAt = 0
  }

  endReplay() {
    this.replaying = false
  }

  /** When the last of what was played back arrived, or 0 if none has. */
  get replayed() {
    return this.replayedAt
  }

  /** The call a question is about, as it has been said of so far. */
  call(id: string | undefined): AcpToolCall {
    return this.calls.get(id ?? "") ?? {}
  }

  hush() {
    if (!this.speech.now) return
    this.turn.put({ ...this.speech.now, streaming: false })
    this.speech.now = null
    this.turn.touched()
  }

  update(given: AcpUpdate) {
    switch (given.sessionUpdate) {
      case "agent_message_chunk": {
        const text = given.content?.type === "text" ? given.content.text : ""
        if (!text || (!this.speech.now && !text.trim())) return
        this.speech.now = {
          kind: "assistant",
          id: `${this.run}:said:${this.speech.now ? this.speech.count : ++this.speech.count}`,
          at: this.speech.now?.at ?? Date.now(),
          text: (this.speech.now?.text ?? "") + text,
          streaming: true,
        }
        this.turn.put({ ...this.speech.now })
        return
      }
      case "tool_call":
      case "tool_call_update": {
        const key = given.toolCallId?.trim()
        if (!key) return
        this.hush()
        // each update says only what is new of the call
        const call = { ...this.calls.get(key) }
        for (const [name, value] of Object.entries(given))
          if (value !== null && value !== undefined)
            (call as Record<string, unknown>)[name] = value
        this.calls.set(key, call)
        if (call.kind === "think") return
        const closed = call.status === "completed" || call.status === "failed"
        const item = {
          kind: "tool" as const,
          id: `${this.run}:${key}`,
          at: this.tools.get(key)?.at ?? Date.now(),
          ...this.step(call),
          state:
            call.status === "failed"
              ? ("failed" as const)
              : closed
                ? ("done" as const)
                : ("running" as const),
        }
        if (closed) this.tools.delete(key)
        else this.tools.set(key, item)
        this.turn.put(item)
        // what it just did may have written the model for the first time, or moved it
        if (closed) this.turn.touched()
        return
      }
    }
  }

  notification = (method: string, params: unknown) => {
    const told = (params ?? {}) as AcpTold
    if (method === "session/update") {
      if (this.replaying) {
        this.replayedAt = Date.now()
        return
      }
      // a subagent's session reports on the same line, and is no part of this
      // conversation; nor is what is played back of the one being taken up again
      if (
        told._meta?.isReplay ||
        told.sessionId !== this.sessionId ||
        !told.update
      )
        return
      this.update(told.update)
      return
    }
    const stop = this.done?.(method, told, this.sessionId)
    if (stop !== undefined) this.over(stop)
  }

  /** What was in flight did not finish: it is left as it stood, and marked so. */
  abandon() {
    if (this.speech.now) this.turn.put({ ...this.speech.now, streaming: false })
    for (const item of this.tools.values())
      this.turn.put({ ...item, state: "failed" })
  }
}

/** Rejects when an agent has been waited on for too long. */
export const tooLong = (ms: number, why: string) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(why)), ms).unref()
  )

/** What kind of thing a tool call is, in a word, by the kind the agent gives it. */
export const KINDS: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  delete: "Delete",
  move: "Move",
  search: "Search",
  execute: "Run",
  fetch: "Fetch",
}

/** What leave is asked for, by the kind of thing it is for. */
export const QUESTIONS: Record<string, string> = {
  read: "Read this file?",
  edit: "Change this file?",
  delete: "Delete this file?",
  move: "Move this file?",
  execute: "Run this command?",
  fetch: "Fetch this page?",
}

/** What an agent says of itself on taking up the line, as much as the app reads of it. */
export type AcpHello = {
  _meta?: {
    agentVersion?: string
    defaultAuthMethodId?: string
  } | null
}

export type AcpPromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }

export type AcpStepContext = {
  turn: Turn
  relative: (file: string) => string
  /** the app's own tool this call is to, if it is to one */
  own: string | null
}

export type AcpAllowContext = {
  turn: Turn
  /** the app's own tool this call is to, if it is to one */
  own: string | null
}

/**
 * What is one agent's own in the protocol: how it is started, how it signs in, what it
 * says of its models, and the few places where its words or its idea of a tool call
 * differ. Everything else is in runTurn and lookAt below.
 */
export type AcpAgent<Hello = AcpHello> = {
  /** the agent's own name for the ids it makes, as turn.id gives them */
  id: string
  /** what it is called where the app says so */
  name: string
  command(launch: Launch, access?: Access): string[]
  env?(launch: Launch, access: Access): Record<string, string | undefined>
  auth(launch: Launch, hello: Hello): { methodId: string; signedOut?: string }
  look(peer: Peer, launch: Launch, hello: Hello): Promise<Looked>
  session?: {
    /** what a session is begun with, beyond its folder and the app's own tools */
    meta?(turn: Turn, access: Access): Record<string, unknown>
    /** what the agent is told of the model, where the user chose one */
    settings?(turn: Turn): { configId: string; value: string }[]
  }
  prompt(
    turn: Turn,
    resumed: boolean,
    pieces: AcpPromptBlock[]
  ): AcpPromptBlock[]
  tool: {
    ours(call: AcpToolCall, turn: Turn): string | null
    step(
      call: AcpToolCall,
      ctx: AcpStepContext
    ): { name: string; detail: string }
    /** the option kinds to choose without asking, or null to put it to the user */
    allow(
      call: AcpToolCall,
      access: Access,
      ctx: AcpAllowContext
    ): string[] | null
    /** something else the agent asks of the app, and the answer, if it has one */
    other?(method: string, params: unknown): unknown | undefined
  }
  /** how an agent says a turn is over apart from the prompt's answer */
  done?(
    method: string,
    told: AcpTold,
    sessionId: string
  ): string | null | undefined
}

/** What an installed agent says of itself, over a line that is closed afterwards. */
export async function lookAt<Hello>(
  launch: Launch,
  agent: AcpAgent<Hello>
): Promise<Looked> {
  const peer = startPeer(launch.path, agent.command(launch), {
    cwd: os.tmpdir(),
    // (a look changes nothing, but it is started as a supervised turn would be)
    env: agent.env ? agent.env(launch, "supervised") : launch.env,
    versioned: true,
    onNotification: () => {},
    onRequest: (method) =>
      Promise.reject(
        new RpcError(NO_SUCH_METHOD, `Method not found: ${method}`)
      ),
  })
  const asking = async (): Promise<Looked> => {
    const hello = await peer.request<Hello>("initialize", HELLO)
    return agent.look(peer, launch, hello)
  }
  try {
    return await Promise.race([
      asking(),
      tooLong(ASKING_TIMEOUT_MS, `${agent.name} did not answer.`),
    ])
  } finally {
    peer.close()
  }
}

/** One turn of a conversation, run by an agent over the protocol. */
export async function runTurn<Hello>(
  turn: Turn,
  agent: AcpAgent<Hello>
): Promise<void> {
  const { launch, manner } = turn
  const halt = stopped(turn.signal)
  const run = turn.id(agent.id)
  const relative = inside(turn.cwd)
  const state = new AcpTurn(
    turn,
    run,
    (call) =>
      agent.tool.step(call, {
        turn,
        relative,
        own: agent.tool.ours(call, turn),
      }),
    agent.done
  )
  // (a model is looked over with the app's tools: anything else is put to the user)
  const access = turn.lookOver ? "supervised" : manner.access

  const request = async (method: string, params: unknown) => {
    if (method === "session/request_permission") {
      const wanted = (params ?? {}) as {
        toolCall?: AcpToolCall
        options?: AcpOption[]
      }
      const options = wanted.options ?? []
      // what it asks leave for it has often said more of already
      const call: AcpToolCall = {
        ...state.call(wanted.toolCall?.toolCallId),
        ...wanted.toolCall,
      }
      const choose = (...kinds: string[]) => {
        for (const kind of kinds) {
          const option = options.find((one) => one.kind === kind)
          if (option)
            return {
              outcome: { outcome: "selected", optionId: option.optionId },
            }
        }
        return { outcome: { outcome: "cancelled" } }
      }
      const own = agent.tool.ours(call, turn)
      const allowed = agent.tool.allow(call, access, { turn, own })
      if (allowed) return choose(...allowed)
      const shown = agent.tool.step(call, { turn, relative, own })
      const answer: PermissionAnswer = await turn.ask({
        title:
          QUESTIONS[call.kind ?? ""] ?? `Let ${agent.name} use ${shown.name}?`,
        detail: shown.detail,
        canAlways: options.some((one) => one.kind === "allow_always"),
      })
      if (turn.signal.aborted) return { outcome: { outcome: "cancelled" } }
      return answer === "deny"
        ? choose("reject_once")
        : answer === "always"
          ? choose("allow_always", "allow_once")
          : choose("allow_once")
    }
    const other = agent.tool.other?.(method, params)
    if (other !== undefined) return other
    throw new RpcError(NO_SUCH_METHOD, `Method not found: ${method}`)
  }

  const peer = startPeer(launch.path, agent.command(launch, access), {
    cwd: turn.cwd,
    env: agent.env ? agent.env(launch, access) : launch.env,
    versioned: true,
    onNotification: state.notification,
    onRequest: request,
  })
  const died = peer.gone.then(() => {
    throw new Error(
      peer.stderr() || `${agent.name} exited before the turn was over.`
    )
  })
  died.catch(() => {})

  try {
    const hello = await Promise.race([
      peer.request<Hello>("initialize", HELLO),
      halt,
      died,
    ])
    const auth = agent.auth(launch, hello)
    await Promise.race([
      peer.request("authenticate", { methodId: auth.methodId }),
      halt,
      died,
    ]).catch((error: unknown) => {
      if (turn.signal.aborted) throw error
      // some agents answer without an account, and say nothing of it either way
      if (auth.signedOut) throw new Error(auth.signedOut)
    })

    const where = {
      cwd: turn.cwd,
      mcpServers: Object.entries(turn.served).map(([name, url]) => ({
        type: "http",
        name,
        url,
        headers: [],
      })),
    }
    const meta = agent.session?.meta?.(turn, access)
    const begin = async () => {
      const made = await peer.request<{ sessionId: string }>("session/new", {
        ...where,
        ...(meta ? { _meta: meta } : {}),
      })
      return made.sessionId
    }
    /** Take up the session the conversation was last in. Whether it could be. */
    const resume = async (id: string) => {
      state.beginReplay()
      const quiet = new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (
            state.replayed > 0 &&
            Date.now() - state.replayed >= REPLAY_QUIET_MS
          ) {
            clearInterval(timer)
            resolve()
          }
        }, 200)
        timer.unref()
        void peer.gone.then(() => clearInterval(timer))
      })
      try {
        await Promise.race([
          peer.request("session/load", { sessionId: id, ...where }),
          quiet,
          tooLong(
            LOADING_TIMEOUT_MS,
            `${agent.name} took too long to take the conversation up again.`
          ),
        ])
        return true
      } catch (error) {
        if (turn.signal.aborted) throw error
        return false
      } finally {
        state.endReplay()
      }
    }

    let resumed = false
    if (turn.sessionId) {
      resumed = await Promise.race([resume(turn.sessionId), halt, died])
      if (resumed) state.sessionId = turn.sessionId
      else
        turn.notice(
          "info",
          `${agent.name} could not find its record of this conversation, so it carries on without what was said before.`
        )
    }
    if (!resumed) state.sessionId = await Promise.race([begin(), halt, died])
    turn.session(state.sessionId)

    for (const setting of agent.session?.settings?.(turn) ?? [])
      await Promise.race([
        peer.request("session/set_config_option", {
          sessionId: state.sessionId,
          configId: setting.configId,
          value: setting.value,
        }),
        halt,
        died,
      ]).catch((error: unknown) => {
        if (turn.signal.aborted) throw error
        turn.notice(
          "info",
          `${agent.name} would not take ${setting.value} for its ${setting.configId.replace("_", " ")}, and answers as it is set.`
        )
      })

    const answered = peer
      .request<{ stopReason?: string | null }>("session/prompt", {
        sessionId: state.sessionId,
        prompt: agent.prompt(turn, resumed, piecesOf(turn.content)),
      })
      .then((result) => result?.stopReason ?? null)
    const stopReason = await Promise.race([
      answered,
      state.finished,
      halt,
      died,
    ])
    state.hush()
    if (stopReason === "refusal")
      turn.notice("error", `${agent.name} declined to answer this.`)
    else if (stopReason === "max_tokens" || stopReason === "max_turn_requests")
      turn.notice(
        "info",
        `${agent.name} stopped before it was done: it had reached the most it does in one turn.`
      )
  } catch (error) {
    // Stopped part of the way: the agent is told, and given a moment to leave the
    // session as it should be left, so that the conversation can be carried on from
    // here.
    if (turn.signal.aborted && state.sessionId) {
      peer.notify("session/cancel", { sessionId: state.sessionId })
      await Promise.race([
        state.finished,
        peer.gone,
        new Promise((resolve) => setTimeout(resolve, STOPPING_TIMEOUT_MS)),
      ])
    }
    throw error
  } finally {
    state.abandon()
    peer.close()
  }
}
