// opencode, SST's command-line agent, as one of the agents the app runs. It is started
// as `opencode acp`, which speaks the Agent Client Protocol (JSON-RPC) on its standard
// input and output: a session is a conversation, a prompt is one message answered, and
// what it does on the way arrives as updates. It answers with an account signed in or
// without one, on its free models, so reaching it is the whole of asking after it.
import os from "node:os"

import { type Access, type ModelChoice } from "../shared/api"
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
import { changesOnlyInside, guideAgain, type Turn } from "./turn"

/** A model opencode offers, as a session says of it. */
export type OpencodeModelOption = { value: string; name: string }

/** What opencode says of its models, as the app offers them. */
export function opencodeModels(
  current: string | null | undefined,
  options: OpencodeModelOption[] | undefined
): ModelChoice[] {
  const rows = options ?? []
  const standing = rows.find((row) => row.value === current)
  return [
    {
      id: null,
      name: "Default",
      short: standing?.name ?? "Default",
      detail: "The model opencode is set to run",
      efforts: [],
    },
    ...rows.map((row): ModelChoice => ({
      id: row.value,
      name: row.name,
      short: row.name,
      detail: "",
      efforts: [],
    })),
  ]
}

/**
 * How much opencode may do without asking, in its own terms. opencode's own defaults
 * let the agent change files and run commands outright, so what the app chooses has to
 * be said here as well: with nothing said, a supervised turn would edit files and run
 * commands without the app ever being asked, and the questions below would never come
 * up. The app's own tools are never asked about in any case (see where it asks leave).
 *
 * opencode has no way to judge for itself what is routine, so its `auto` and the app's
 * are not quite the same: where the agent is meant to judge, opencode is simply let to
 * change the project's files and run commands, and only what reaches outside the
 * project is still asked about. `full` lets it do that too, outside as well.
 */
const PERMISSION: Record<Access, string | Record<string, string>> = {
  supervised: { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
  edits: { edit: "allow", bash: "ask", webfetch: "ask", websearch: "ask" },
  auto: { edit: "allow", bash: "allow", webfetch: "allow", websearch: "allow" },
  full: "allow",
}

/**
 * What opencode is started with, as its environment: the app's choice of how much it
 * may do without asking, said as opencode's own permission config (it has no protocol
 * one). What the user has put in that variable already is kept, with the app's choice
 * laid over it; what is not readable as JSON is left out rather than fail a turn.
 */
export function withAccess(
  env: Record<string, string | undefined>,
  access: Access
): Record<string, string | undefined> {
  let base: Record<string, unknown> = {}
  const given = env.OPENCODE_CONFIG_CONTENT
  if (given) {
    try {
      const parsed = JSON.parse(given)
      if (parsed && typeof parsed === "object") base = parsed
    } catch {
      // not a config: nothing to keep
    }
  }
  return {
    ...env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      ...base,
      permission: PERMISSION[access],
    }),
  }
}

type ConfigOption = {
  id?: string
  currentValue?: string | null
  options?: { value?: string; name?: string }[] | null
}

/**
 * Whether a tool call is to one of the app's own tools, and if so which. opencode
 * calls a tool it was brought over MCP by the server's name and the tool's, joined
 * with one line: viewport_screenshot. It says which tool that is under `name`, the
 * tool's own name, and that alone is gone by here, exactly. Never the title, nor
 * anything in what the tool was given: those are often words the model wrote (a bash
 * call's description for one), and a call it titled "viewport screenshot" would
 * otherwise be taken for the app's own tool and let go without a question. Nor is a
 * call opencode says runs a command or changes a file, whatever it is called.
 */
const ours = (call: AcpToolCall, turn: Turn) => {
  if (call.kind && call.kind !== "other") return null
  for (const [set, tools] of Object.entries(turn.tools))
    for (const tool of tools)
      if (
        call.name === `${set}_${tool.name}` ||
        call.name === `${set}__${tool.name}`
      )
        return `mcp__${set}__${tool.name}`
  return null
}

/** A tool call in a few words: what kind of thing, and on what. */
const step = (
  call: AcpToolCall,
  ctx: AcpStepContext
): { name: string; detail: string } => {
  if (ctx.own) return ctx.turn.describe(ctx.own, call.rawInput)
  const kind = call.kind && call.kind !== "other" ? call.kind : ""
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
  const called = field(call.rawInput, "tool_name") || call.title || "Tool"
  return { name: called.replaceAll("__", " "), detail }
}

/**
 * What the installed opencode says of itself: that it is there, and the models it
 * offers. Its models come only with a session, which has no delete: one empty session
 * is left behind each time it is looked at.
 */
const look = async (peer: Peer): Promise<Looked> => {
  // asked so that the sign-in is awake, whatever comes of it: it answers on its
  // free models with nothing signed in, so nothing here can fail the look
  await peer
    .request("authenticate", { methodId: "opencode-login" })
    .catch(() => null)
  const made = await peer.request<{
    sessionId: string
    configOptions?: ConfigOption[] | null
  }>("session/new", { cwd: os.tmpdir(), mcpServers: [] })
  const model = (made.configOptions ?? []).find(
    (option) => option.id === "model"
  )
  return {
    // null: the version `opencode --version` printed stands, which is looked up first
    version: null,
    // it answers with an account signed in or without one, so no account is claimed:
    // the UI says it is ready rather than that somebody is signed in
    signedIn: null,
    account: null,
    trouble: null,
    models: opencodeModels(
      model?.currentValue,
      (model?.options ?? []).flatMap((option) =>
        option.value
          ? [{ value: option.value, name: option.name ?? option.value }]
          : []
      )
    ),
  }
}

// opencode takes no instructions apart from the message: a session begun afresh is
// told of the project with it, and one taken up again keeps what it began with
const prompt = (
  turn: Turn,
  resumed: boolean,
  pieces: AcpPromptBlock[]
): AcpPromptBlock[] => {
  const words = (text: string): AcpPromptBlock => ({ type: "text", text })
  const picture = (data: string, mimeType: string): AcpPromptBlock => ({
    type: "image",
    data,
    mimeType,
  })
  return [
    ...(!resumed ? [words(turn.guide)] : []),
    ...(resumed && turn.guideChanged ? [words(guideAgain(turn.guide))] : []),
    ...pieces.flatMap((piece): AcpPromptBlock[] =>
      piece.type === "text"
        ? [words(piece.text)]
        : [picture(piece.data, piece.mimeType)]
    ),
  ]
}

/** opencode, as the shared ACP driver is handed it. */
const opencode: AcpAgent = {
  id: "opencode",
  name: "opencode",
  // opencode takes no flags for how much it may do: that is said in its environment
  command: (launch) => ["acp", ...launch.args],
  env: (launch, access) => withAccess(launch.env, access),
  auth: () => ({ methodId: "opencode-login" }),
  look,
  session: {
    // which model answers is said only where the user chose: opencode takes no
    // session for how hard it thinks
    settings: (turn) =>
      turn.manner.model
        ? [{ configId: "model", value: turn.manner.model }]
        : [],
  },
  prompt,
  tool: {
    ours,
    step,
    // The app's own tools are the point of it: they are never asked about. Where
    // everything is let, nothing is either, for the whole session; and where
    // the project's files are the agent's to change, changing them is not
    // asked about: only them, and not a file anywhere else, nor one a link in the
    // project leads out to.
    allow: (call, access, { own, turn }) => {
      if (own) return ["allow_once", "allow_always"]
      if (access === "full") return ["allow_always", "allow_once"]
      if (
        access === "edits" &&
        call.kind === "edit" &&
        changesOnlyInside(turn.cwd, call)
      )
        return ["allow_once", "allow_always"]
      return null
    },
  },
}

/**
 * What the installed opencode says of itself: that it is there, and the models it
 * offers.
 */
export async function lookAtOpencode(launch: Launch): Promise<Looked> {
  return lookAt(launch, opencode)
}

/** One turn of a conversation, run by opencode. Resolves once it is over. */
export async function runOpencode(turn: Turn): Promise<void> {
  return runTurn(turn, opencode)
}
