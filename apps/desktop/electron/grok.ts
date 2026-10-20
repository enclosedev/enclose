// Grok, xAI's command-line agent, as one of the agents the app runs. It is started as
// `grok agent stdio`, which speaks the Agent Client Protocol (JSON-RPC) on its standard
// input and output: a session is a conversation, a prompt is one message answered, and
// what it does on the way arrives as updates. The account it works for is whichever is
// signed in to the Grok on this machine.
import { EFFORTS, type Access, type ModelChoice } from "../shared/api"
import {
  KINDS,
  field,
  lookAt,
  runTurn,
  type AcpAgent,
  type AcpPromptBlock,
  type AcpStepContext,
  type AcpToolCall,
} from "./acp"
import type { Launch, Looked } from "./providers"
import type { Peer } from "./rpc"
import { guideAgain, changesOnlyInside, type Turn } from "./turn"

/** The models Grok has, as it says so on taking up the line. */
export type GrokModels = {
  currentModelId?: string | null
  availableModels?: {
    modelId: string
    name?: string | null
    description?: string | null
    _meta?: {
      supportsReasoningEffort?: boolean
      reasoningEfforts?: { id?: string; value?: string }[]
    } | null
  }[]
}

type Hello = {
  _meta?: {
    agentVersion?: string
    defaultAuthMethodId?: string
    modelState?: GrokModels
  } | null
}

/** What Grok says of its models, as the app offers them. */
export function grokModels(state: GrokModels | undefined): ModelChoice[] {
  type Row = NonNullable<GrokModels["availableModels"]>[number]
  const rows = state?.availableModels ?? []
  const efforts = (row: Row) =>
    row._meta?.supportsReasoningEffort === false
      ? []
      : EFFORTS.filter((effort) =>
          row._meta?.reasoningEfforts?.some(
            (one) => (one.value ?? one.id) === effort
          )
        )
  const standing = rows.find((row) => row.modelId === state?.currentModelId)
  return [
    // there is always the choice of leaving it to Grok
    {
      id: null,
      name: "Default",
      short: standing?.name ?? "Default",
      detail: "The model Grok is set to run",
      efforts: standing ? efforts(standing) : [],
    },
    ...rows.map((row): ModelChoice => ({
      id: row.modelId,
      name: row.name ?? row.modelId,
      short: row.name ?? row.modelId,
      detail: row.description ?? "",
      efforts: efforts(row),
    })),
  ]
}

/** Which of Grok's ways of signing in is the one in use: a key in its environment, or its own. */
const authMethod = (launch: Launch, hello: Hello) =>
  launch.env.XAI_API_KEY?.trim()
    ? "xai.api_key"
    : (hello._meta?.defaultAuthMethodId ?? "cached_token")

/**
 * How much Grok may do without asking, in its own terms. It has no mode of its own for
 * changing files freely and asking about the rest: there it asks, and the app answers
 * for the changes to files (see where it asks leave, below).
 *
 * Said outright each time, though Grok may not go by it: its own settings come first,
 * and Claude Code's where it finds them, so that a machine set to let its agents act on
 * their own judgement has Grok do so whatever is chosen here.
 */
const MODES: Record<Access, string> = {
  supervised: "default",
  edits: "default",
  auto: "auto",
  full: "bypassPermissions",
}

/**
 * Grok's command line: how much it may do, where that is being chosen, then that it is
 * to speak the protocol, with what the user would add put where Grok looks for it.
 */
const command = (launch: Launch, access?: Access) => [
  ...(access ? ["--permission-mode", MODES[access]] : []),
  "agent",
  ...launch.args,
  "stdio",
]

/**
 * Whether a tool call is to one of the app's own tools, and if so which. Grok calls a
 * tool that was brought to it through one of its own, use_tool, by a name it makes of
 * the set and the tool: viewport__screenshot. Only such a call is gone by, by that
 * name exactly: never the title, which can be words the model wrote, and never a call
 * Grok says runs a command or changes a file, whatever it is called.
 */
const ours = (call: AcpToolCall, turn: Turn) => {
  if (call.kind && call.kind !== "other") return null
  const its = call._meta?.["x.ai/tool"]?.name
  if (its && its !== "use_tool") return null
  const named = field(call.rawInput, "tool_name")
  for (const [set, tools] of Object.entries(turn.tools))
    for (const tool of tools)
      if (named === `${set}__${tool.name}`) return `mcp__${set}__${tool.name}`
  return null
}

/** A tool call in a few words: what kind of thing, and on what. */
const step = (
  call: AcpToolCall,
  ctx: AcpStepContext
): { name: string; detail: string } => {
  if (ctx.own) return ctx.turn.describe(ctx.own, call.rawInput)
  const its = call._meta?.["x.ai/tool"] ?? {}
  // it looks a tool up before it calls on one it was brought
  if (its.name === "search_tool")
    return { name: "Find tool", detail: field(call.rawInput, "query") }
  // what kind of thing it is, it says at first only in its own words
  const kind = call.kind && call.kind !== "other" ? call.kind : (its.kind ?? "")
  const file = field(
    call.rawInput,
    "path",
    "file_path",
    "filePath",
    "target_file"
  )
  const detail =
    kind === "execute"
      ? field(call.rawInput, "command", "cmd")
      : kind === "search"
        ? field(call.rawInput, "pattern", "query", "regex")
        : kind === "fetch"
          ? field(call.rawInput, "url", "query")
          : ctx.relative(file || (call.locations?.[0]?.path ?? ""))
  if (KINDS[kind])
    return { name: KINDS[kind], detail: detail || (call.title ?? "") }
  // a tool someone else brought it, or one of its own that is none of the above
  const called = field(call.rawInput, "tool_name") || call.title || "Tool"
  return { name: called.replaceAll("__", " "), detail }
}

/**
 * What the installed Grok says of itself: its version, the account it is signed in to,
 * and the models it offers.
 */
const look = async (
  peer: Peer,
  launch: Launch,
  hello: Hello
): Promise<Looked> => {
  const methodId = authMethod(launch, hello)
  // it signs in with what it has kept, or says that it has nothing
  const who = await peer
    .request<{
      _meta?: { subscription_tier?: string | null } | null
    }>("authenticate", { methodId })
    .catch(() => null)
  return {
    version: hello._meta?.agentVersion ?? null,
    signedIn: who !== null,
    account: who
      ? (who._meta?.subscription_tier ??
        (methodId === "xai.api_key" ? "API key" : "Grok account"))
      : null,
    trouble: null,
    models: grokModels(hello._meta?.modelState),
  }
}

// Grok takes no pictures in a message: it is told what it is told in words
const prompt = (
  turn: Turn,
  resumed: boolean,
  pieces: AcpPromptBlock[]
): AcpPromptBlock[] => [
  // a session taken up again keeps the rules it began with
  ...(resumed && turn.guideChanged
    ? [{ type: "text" as const, text: guideAgain(turn.guide) }]
    : []),
  ...pieces.flatMap((piece): AcpPromptBlock[] =>
    piece.type === "text" ? [{ type: "text", text: piece.text }] : []
  ),
]

/** Grok, as the shared ACP driver is handed it. */
const grok: AcpAgent<Hello> = {
  id: "grok",
  name: "Grok",
  command,
  auth: (launch, hello) => ({
    methodId: authMethod(launch, hello),
    signedOut:
      "Nobody is signed in to Grok. Run `grok login` in a terminal, then try again.",
  }),
  look,
  session: {
    meta: (turn, access) => ({
      rules: turn.guide,
      // how much it may do without asking, said again where a session can be told
      ...(access === "full"
        ? { yoloMode: true }
        : access === "auto"
          ? { autoMode: true }
          : {}),
    }),
    settings: (turn) => [
      ...(turn.manner.model
        ? [{ configId: "model", value: turn.manner.model }]
        : []),
      ...(turn.manner.effort
        ? [{ configId: "reasoning_effort", value: turn.manner.effort }]
        : []),
    ],
  },
  prompt,
  tool: {
    ours,
    step,
    // The app's own tools are the point of it: they are never asked about. And where
    // the project's files are the agent's to change, changing them is not asked either:
    // only them, and not a file anywhere else, nor one a link in the project leads out to.
    allow: (call, access, { own, turn }) =>
      own ||
      (access === "edits" &&
        call.kind === "edit" &&
        changesOnlyInside(turn.cwd, call))
        ? ["allow_once", "allow_always"]
        : null,
    // it would need its own form here; until then Grok asks in plain text
    other: (method) =>
      method === "_x.ai/ask_user_question" ||
      method === "x.ai/ask_user_question"
        ? { outcome: "cancelled" }
        : undefined,
  },
  // Grok does not always answer the prompt it was sent: it also says so apart
  done: (method, told, sessionId) =>
    method === "_x.ai/session/prompt_complete" && told.sessionId === sessionId
      ? (told.stopReason ?? null)
      : undefined,
}

/**
 * What the installed Grok says of itself: its version, the account it is signed in to,
 * and the models it offers.
 */
export async function lookAtGrok(launch: Launch): Promise<Looked> {
  return lookAt(launch, grok)
}

/** One turn of a conversation, run by Grok. Resolves once it is over. */
export async function runGrok(turn: Turn): Promise<void> {
  return runTurn(turn, grok)
}
