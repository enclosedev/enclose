// Codex, OpenAI's command-line agent, as one of the agents the app runs. It is started as
// `codex app-server`, which speaks JSON-RPC on its standard input and output: a thread is
// a conversation, a turn is one message answered, and what it does on the way arrives as
// items. The account it works for is whichever is signed in to the Codex on this machine.
import os from "node:os"

import {
  EFFORTS,
  type Access,
  type ModelChoice,
  type PermissionAnswer,
  type ThreadItem,
} from "../shared/api"
import type { Launch, Looked } from "./providers"
import { NO_SUCH_METHOD, RpcError, startPeer, type Peer } from "./rpc"
import {
  bare,
  guideAgain,
  inside,
  piecesOf,
  stopped,
  type Piece,
  type Turn,
} from "./turn"

/** What the app says it is, on taking up the line. */
const HELLO = {
  clientInfo: { name: "enclose", title: "Enclose", version: "0.1.0" },
  capabilities: { experimentalApi: false, requestAttestation: false },
}

/** How long Codex is given to say what it has. */
const ASKING_TIMEOUT_MS = 20_000
/** How long it is given to wind a turn up once it has been told to stop. */
const STOPPING_MS = 3000

type Account =
  | { type: "apiKey" }
  | { type: "chatgpt"; email?: string | null; planType?: string }
  | { type: string }

/** A model as Codex lists it. */
export type CodexModel = {
  model: string
  displayName: string
  description?: string | null
  hidden?: boolean
  isDefault?: boolean
  supportedReasoningEfforts?: { reasoningEffort: string }[]
}

/** What a ChatGPT plan is called, by what Codex calls it. */
const PLANS: Record<string, string> = {
  free: "ChatGPT Free",
  go: "ChatGPT Go",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro",
  prolite: "ChatGPT Pro",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  self_serve_business_usage_based: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  enterprise_cbp_usage_based: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
}

/** Who Codex says is signed in to it: by what they pay for, or how they reach it. */
export function accountOf(
  account: Account | null | undefined,
  needsOne: boolean
): { signedIn: boolean | null; account: string | null } {
  // one set to reach its models some other way needs nobody signed in
  if (!account) return { signedIn: needsOne ? false : null, account: null }
  if (account.type === "chatgpt")
    return {
      signedIn: true,
      account:
        PLANS[(account as { planType?: string }).planType ?? ""] ?? "ChatGPT",
    }
  return {
    signedIn: true,
    account: account.type === "apiKey" ? "API key" : "Amazon Bedrock",
  }
}

/** What Codex says of its models, as the app offers them. */
export function codexModels(rows: CodexModel[]): ModelChoice[] {
  const efforts = (row: CodexModel) =>
    EFFORTS.filter((effort) =>
      row.supportedReasoningEfforts?.some(
        (one) => one.reasoningEffort === effort
      )
    )
  const shown = rows.filter((row) => !row.hidden)
  const choices = shown.map((row): ModelChoice => ({
    id: row.model,
    name: row.displayName,
    short: row.displayName,
    detail: row.description ?? "",
    efforts: efforts(row),
  }))
  // there is always the choice of leaving it to Codex
  const standing = shown.find((row) => row.isDefault)
  if (choices.length > 0)
    choices.unshift({
      id: null,
      name: "Default",
      short: standing?.displayName ?? "Default",
      detail: "The model Codex is set to run",
      efforts: standing ? efforts(standing) : [],
    })
  return choices
}

/** Rejects when Codex has been waited on for too long. */
const tooLong = (ms: number) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Codex did not answer.")), ms).unref()
  )

/**
 * What the installed Codex says of itself: its version, the account it is signed in to,
 * and the models it offers.
 */
export async function lookAtCodex(launch: Launch): Promise<Looked> {
  const peer = startPeer(launch.path, ["app-server", ...launch.args], {
    cwd: os.tmpdir(),
    env: launch.env,
    versioned: false,
    onNotification: () => {},
    onRequest: (method) =>
      Promise.reject(
        new RpcError(NO_SUCH_METHOD, `Method not found: ${method}`)
      ),
  })
  const asking = async (): Promise<Looked> => {
    const hello = await peer.request<{ userAgent?: string }>(
      "initialize",
      HELLO
    )
    peer.notify("initialized")
    const read = await peer.request<{
      account?: Account | null
      requiresOpenaiAuth?: boolean
    }>("account/read", {})
    const rows: CodexModel[] = []
    let cursor: string | null = null
    do {
      const page: { data?: CodexModel[]; nextCursor?: string | null } =
        await peer.request("model/list", cursor ? { cursor } : {})
      rows.push(...(page.data ?? []))
      cursor = page.nextCursor ?? null
    } while (cursor)
    return {
      // it says which it is in how it names itself: "enclose/0.162.0 (…)"
      version: /\/(\d[^\s]*)/.exec(hello.userAgent ?? "")?.[1] ?? null,
      ...accountOf(read.account, read.requiresOpenaiAuth === true),
      trouble: null,
      models: codexModels(rows),
    }
  }
  try {
    return await Promise.race([asking(), tooLong(ASKING_TIMEOUT_MS)])
  } finally {
    peer.close()
  }
}

/**
 * How much Codex may do without asking, in its own terms: when it asks, what it is shut
 * in to meanwhile, and who its askings go to.
 */
const POLICY: Record<
  Access,
  { approvalPolicy: string; sandbox: string; approvalsReviewer: string }
> = {
  supervised: {
    approvalPolicy: "untrusted",
    sandbox: "read-only",
    approvalsReviewer: "user",
  },
  edits: {
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    approvalsReviewer: "user",
  },
  // what it would ask about is weighed by a reviewer of its own first
  auto: {
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    approvalsReviewer: "auto_review",
  },
  full: {
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    approvalsReviewer: "user",
  },
}

/** The user's answer, as Codex takes one. */
const DECISION: Record<PermissionAnswer, string> = {
  allow: "accept",
  always: "acceptForSession",
  deny: "decline",
}

/** Something Codex did or is doing in a turn, as far as the app reads it. */
type Item = {
  id: string
  type: string
  text?: string
  command?: string
  status?: string
  changes?: { path: string; kind?: { type?: string } }[]
  server?: string
  tool?: string
  arguments?: unknown
  query?: string
  path?: string
  prompt?: string | null
}

type Told = {
  threadId?: string
  itemId?: string
  delta?: string
  item?: Item
  turn?: { id: string; status?: string; error?: { message?: string } | null }
  error?: { message?: string } | null
  willRetry?: boolean
}

type Wanted = {
  itemId?: string
  command?: string | null
  reason?: string | null
  serverName?: string
  message?: string
  mode?: string
  requestedSchema?: { properties?: Record<string, unknown> }
  permissions?: unknown
}

/** One turn of a conversation, run by Codex. Resolves once it is over. */
export async function runCodex(turn: Turn): Promise<void> {
  const { launch, manner } = turn
  // (while the project's files are locked it is shut in to reading them, whatever it may
  // do otherwise)
  const policy = turn.readOnly
    ? { ...POLICY[manner.access], sandbox: "read-only" }
    : POLICY[turn.lookOver ? "supervised" : manner.access]
  const halt = stopped(turn.signal)
  // Codex numbers what it does afresh in each thread: an item is known by the turn too
  const run = turn.id("codex")
  const id = (item: string) => `${run}:${item}`
  const relative = inside(turn.cwd)

  const live = new Map<string, Extract<ThreadItem, { kind: "assistant" }>>()
  const tools = new Map<string, Extract<ThreadItem, { kind: "tool" }>>()
  /** the files each change is to, by its item: what leave for it is asked about */
  const changed = new Map<string, string>()
  let threadId = ""
  let turnId: string | null = null
  let troubled = false
  let over = () => {}
  const finished = new Promise<void>((resolve) => (over = resolve))

  /** What an item comes to as a step of the turn: nothing, if it is none worth showing. */
  const step = (item: Item): { name: string; detail: string } | null => {
    switch (item.type) {
      case "commandExecution":
        return { name: "Run", detail: bare(item.command ?? "") }
      case "fileChange": {
        const files = (item.changes ?? []).map((change) =>
          relative(change.path)
        )
        const made = (item.changes ?? []).every(
          (change) => change.kind?.type === "add"
        )
        return {
          name: made && files.length > 0 ? "Write" : "Edit",
          detail: files.join(", "),
        }
      }
      case "mcpToolCall":
        return turn.describe(
          `mcp__${item.server}__${item.tool}`,
          item.arguments
        )
      case "webSearch":
        return { name: "Web search", detail: item.query ?? "" }
      case "imageView":
        return { name: "Read", detail: relative(item.path ?? "") }
      case "collabAgentToolCall":
        return { name: "Subagent", detail: item.prompt ?? "" }
    }
    return null
  }

  const said = (
    item: string,
    more: { text?: string; delta?: string },
    streaming: boolean
  ) => {
    const was = live.get(item)
    const text = more.text ?? (was?.text ?? "") + (more.delta ?? "")
    if (!text.trim() && !was) return
    const now = {
      kind: "assistant" as const,
      id: id(item),
      at: was?.at ?? Date.now(),
      text,
      streaming,
    }
    if (streaming) live.set(item, now)
    else live.delete(item)
    turn.put(now)
  }

  const onNotification = (method: string, params: unknown) => {
    const told = (params ?? {}) as Told
    // a subagent's thread reports on the same line, and is no part of this conversation
    if (told.threadId && threadId && told.threadId !== threadId) return
    switch (method) {
      case "turn/started":
        turnId = told.turn?.id ?? turnId
        return
      case "item/agentMessage/delta":
        if (told.itemId) said(told.itemId, { delta: told.delta ?? "" }, true)
        return
      case "item/started": {
        const item = told.item
        const shown = item && step(item)
        if (!item || !shown) return
        if (item.type === "fileChange") changed.set(item.id, shown.detail)
        const made = {
          kind: "tool" as const,
          id: id(item.id),
          at: Date.now(),
          ...shown,
          state: "running" as const,
        }
        tools.set(item.id, made)
        turn.put(made)
        return
      }
      case "item/completed": {
        const item = told.item
        if (!item) return
        if (item.type === "agentMessage") {
          said(item.id, { text: item.text ?? "" }, false)
          turn.touched()
          return
        }
        const shown = step(item)
        if (!shown) return
        const was = tools.get(item.id)
        tools.delete(item.id)
        turn.put({
          kind: "tool",
          id: id(item.id),
          at: was?.at ?? Date.now(),
          ...shown,
          state:
            item.status === "failed" || item.status === "declined"
              ? "failed"
              : "done",
        })
        // what it just did may have written the model for the first time, or moved it
        turn.touched()
        return
      }
      case "thread/compacted":
        turn.notice(
          "info",
          "What was said before this has been summed up, to make room."
        )
        return
      case "error":
        // one it will try again after is not yet anything gone wrong
        if (told.willRetry) return
        troubled = true
        turn.notice("error", told.error?.message || "Codex reported an error.")
        return
      case "turn/completed":
        if (told.turn?.status === "failed" && !troubled)
          turn.notice(
            "error",
            told.turn.error?.message || "Codex could not finish the turn."
          )
        over()
        return
    }
  }

  const onRequest = async (method: string, params: unknown) => {
    const wanted = (params ?? {}) as Wanted
    switch (method) {
      case "item/commandExecution/requestApproval":
        return {
          decision:
            DECISION[
              await turn.ask({
                title: "Run this command?",
                detail: wanted.command
                  ? bare(wanted.command)
                  : (wanted.reason ?? ""),
                canAlways: true,
              })
            ],
        }
      case "item/fileChange/requestApproval":
        return {
          decision:
            DECISION[
              await turn.ask({
                title: "Change this file?",
                detail: changed.get(wanted.itemId ?? "") ?? wanted.reason ?? "",
                canAlways: true,
              })
            ],
        }
      case "item/permissions/requestApproval": {
        const answer = await turn.ask({
          title: "Let Codex reach beyond the project?",
          detail: wanted.reason ?? "",
          canAlways: true,
        })
        return {
          permissions: answer === "deny" ? {} : (wanted.permissions ?? {}),
          scope: answer === "always" ? "session" : "turn",
        }
      }
      case "mcpServer/elicitation/request": {
        // the app's own tools are the point of it: they are never asked about
        const ours =
          wanted.serverName !== undefined && wanted.serverName in turn.served
        // a form to be filled in is nothing the app can show: only a yes or no is
        const form =
          wanted.mode === "url" ||
          Object.keys(wanted.requestedSchema?.properties ?? {}).length > 0
        const yes =
          ours ||
          (!form &&
            (await turn.ask({
              title: wanted.message || `Let Codex use ${wanted.serverName}?`,
              detail: "",
              canAlways: false,
            })) !== "deny")
        return yes
          ? { action: "accept", content: {}, _meta: null }
          : { action: "decline", content: null, _meta: null }
      }
      // it would need its own form here; until then Codex asks in plain text
      case "item/tool/requestUserInput":
        return { answers: {} }
    }
    throw new RpcError(NO_SUCH_METHOD, `Method not found: ${method}`)
  }

  const peer: Peer = startPeer(
    launch.path,
    [
      "app-server",
      ...launch.args,
      // where the app's own tools answer, for as long as this turn lasts
      ...Object.entries(turn.served).flatMap(([name, url]) => [
        "-c",
        `mcp_servers.${name}.url=${JSON.stringify(url)}`,
      ]),
    ],
    {
      cwd: turn.cwd,
      env: launch.env,
      versioned: false,
      onNotification,
      onRequest,
    }
  )
  // gone before the turn was over: what it last said to stderr is why, if anything is
  const died = peer.gone.then(() => {
    throw new Error(peer.stderr() || "Codex exited before the turn was over.")
  })
  died.catch(() => {})

  try {
    await Promise.race([peer.request("initialize", HELLO), halt, died])
    peer.notify("initialized")

    const opening = {
      cwd: turn.cwd,
      ...policy,
      developerInstructions: turn.guide,
      ...(manner.model ? { model: manner.model } : {}),
    }
    type Opened = { thread: { id: string } }
    const begin = () => peer.request<Opened>("thread/start", opening)
    const opened = await Promise.race([
      turn.sessionId
        ? peer
            .request<Opened>("thread/resume", {
              threadId: turn.sessionId,
              ...opening,
              excludeTurns: true,
            })
            .catch((error: unknown) => {
              if (turn.signal.aborted) throw error
              // its own record of the conversation is gone, or is another Codex's
              turn.notice(
                "info",
                "Codex could not find its record of this conversation, so it carries on without what was said before."
              )
              return begin()
            })
        : begin(),
      halt,
      died,
    ])
    threadId = opened.thread.id
    turn.session(threadId)

    const pieces = piecesOf(turn.content)
    const started = await Promise.race([
      peer.request<{ turn: { id: string } }>("turn/start", {
        threadId,
        input: [
          // a thread taken up again keeps what it was first told, as far as is known
          ...(turn.guideChanged
            ? [
                {
                  type: "text",
                  text: guideAgain(turn.guide),
                  text_elements: [],
                },
              ]
            : []),
          ...pieces.map((piece) =>
            piece.type === "text"
              ? { type: "text", text: piece.text, text_elements: [] }
              : {
                  type: "image",
                  url: `data:${piece.mimeType};base64,${piece.data}`,
                }
          ),
        ],
        ...(manner.model ? { model: manner.model } : {}),
        ...(manner.effort ? { effort: manner.effort } : {}),
      }),
      halt,
      died,
    ])
    turnId ??= started.turn.id

    await Promise.race([finished, halt, died])
  } catch (error) {
    // Stopped part of the way: Codex is told, and given a moment to leave the thread as
    // it should be left, so that the conversation can be carried on from here.
    if (turn.signal.aborted && threadId && turnId) {
      void peer.request("turn/interrupt", { threadId, turnId }).catch(() => {})
      await Promise.race([
        finished,
        peer.gone,
        new Promise((resolve) => setTimeout(resolve, STOPPING_MS)),
      ])
    }
    throw error
  } finally {
    // what was in flight did not finish
    for (const item of live.values()) turn.put({ ...item, streaming: false })
    for (const item of tools.values()) turn.put({ ...item, state: "failed" })
    peer.close()
  }
}

/**
 * What Codex says to one thing put to it, with nothing to go by but what it is given:
 * `told` is what it is to do, and `given` the words and pictures it is to do it with. Its
 * last words, as it says them; nothing, where it would not say, the turn failed, it took
 * longer than `ms`, or it was stopped. It is shut in to reading, in a folder that is
 * nobody's, with nothing it may ask anyone, and none of it is kept among its own
 * conversations.
 */
export async function askCodexOnce(
  launch: Launch,
  told: string,
  given: Piece[],
  signal: AbortSignal,
  ms: number,
  /** what it is to run: null for what it is set to */
  model: string | null = null
): Promise<string | null> {
  if (signal.aborted) return null
  let threadId = ""
  let said: string | null = null
  let over: (done: boolean) => void = () => {}
  const finished = new Promise<boolean>((resolve) => (over = resolve))
  const peer = startPeer(launch.path, ["app-server", ...launch.args], {
    cwd: os.tmpdir(),
    env: launch.env,
    versioned: false,
    onNotification: (method, params) => {
      const heard = (params ?? {}) as Told
      if (heard.threadId && threadId && heard.threadId !== threadId) return
      if (method === "item/completed" && heard.item?.type === "agentMessage")
        said = heard.item.text ?? said
      else if (method === "turn/completed")
        over(heard.turn?.status === "completed")
    },
    // there is nobody to ask, and it may do nothing it would have to ask about
    onRequest: (method) =>
      Promise.reject(
        new RpcError(NO_SUCH_METHOD, `Method not found: ${method}`)
      ),
  })
  const died = peer.gone.then(() => {
    throw new Error(peer.stderr() || "Codex exited before it answered.")
  })
  died.catch(() => {})
  const asking = async () => {
    await peer.request("initialize", HELLO)
    peer.notify("initialized")
    const opened = await peer.request<{ thread: { id: string } }>(
      "thread/start",
      {
        cwd: os.tmpdir(),
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: told,
        ephemeral: true,
        ...(model ? { model } : {}),
      }
    )
    threadId = opened.thread.id
    await peer.request("turn/start", {
      threadId,
      input: given.map((piece) =>
        piece.type === "text"
          ? { type: "text", text: piece.text, text_elements: [] }
          : {
              type: "image",
              url: `data:${piece.mimeType};base64,${piece.data}`,
            }
      ),
      ...(model ? { model } : {}),
    })
    return (await finished) ? said : null
  }
  try {
    return await Promise.race([asking(), stopped(signal), died, tooLong(ms)])
  } catch {
    return null
  } finally {
    peer.close()
  }
}
