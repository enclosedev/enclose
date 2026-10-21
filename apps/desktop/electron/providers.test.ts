import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Provider } from "../shared/api"
import {
  cleanEnv,
  expandHome,
  loginShell,
  Providers,
  putFirstOnPath,
  splitArgs,
  type Looked,
} from "./providers"
import { SettingsStore } from "./settings"

describe("splitArgs", () => {
  it("is the words a shell would make of what was typed", () => {
    expect(splitArgs("")).toEqual([])
    expect(splitArgs("  --chrome  ")).toEqual(["--chrome"])
    expect(splitArgs("--model opus -c 'a b' --x=\"c d\"")).toEqual([
      "--model",
      "opus",
      "-c",
      "a b",
      "--x=c d",
    ])
    expect(splitArgs('-c key="va\\"lue" a\\ b ""')).toEqual([
      "-c",
      'key=va"lue',
      "a b",
      "",
    ])
  })
})

describe("expandHome", () => {
  it("writes the home folder out, where a path begins with it", () => {
    expect(expandHome("~/.codex")).toBe(path.join(os.homedir(), ".codex"))
    expect(expandHome("~")).toBe(os.homedir())
    expect(expandHome("/opt/~/x")).toBe("/opt/~/x")
    expect(expandHome("~other/x")).toBe("~other/x")
  })
})

describe("cleanEnv", () => {
  it("puts a folder first on the PATH, while one is named", () => {
    let folder: string | null = "/app/python/env/bin"
    putFirstOnPath(() => folder)
    try {
      expect(cleanEnv().PATH?.split(path.delimiter)[0]).toBe(folder)
      folder = null
      expect(cleanEnv().PATH).toBe(process.env.PATH)
    } finally {
      putFirstOnPath(() => null)
    }
  })
})

describe("loginShell", () => {
  let shell: string | undefined
  let dir: string
  beforeEach(() => {
    shell = process.env.SHELL
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-login-shell-"))
  })
  afterEach(() => {
    if (shell === undefined) delete process.env.SHELL
    else process.env.SHELL = shell
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("is the user's own shell, as it is, where it is a shell that is there", () => {
    const mine = path.join(dir, "fish")
    fs.writeFileSync(mine, "#!/bin/sh\n", { mode: 0o755 })
    process.env.SHELL = mine
    expect(loginShell()).toBe(mine)
  })

  it("falls back to what is always there only when there is no shell of the user's own", () => {
    process.env.SHELL = path.join(dir, "not-there")
    expect(loginShell()).toMatch(/^\/bin\/(bash|sh|zsh)$/)
    delete process.env.SHELL
    expect(loginShell()).toMatch(/^\/bin\/(bash|sh|zsh)$/)
  })
})

describe("locate", () => {
  let dir: string
  let wasShell: string | undefined
  let wasPath: string | undefined
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-locate-"))
    wasShell = process.env.SHELL
    wasPath = process.env.PATH
    process.env.PATH = dir
  })
  afterEach(() => {
    if (wasShell === undefined) delete process.env.SHELL
    else process.env.SHELL = wasShell
    process.env.PATH = wasPath
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("asks again later when there is no shell to ask the first time", async () => {
    // its own copy of the module: what it remembers (that a shell was already asked) is
    // kept between calls, and a test before this one has had the shell answer
    vi.resetModules()
    const { locate } = await import("./providers")
    // where a shell will say the agent is, not on the PATH the app starts with
    const bin = path.join(dir, "bin")
    fs.mkdirSync(bin)
    const claude = path.join(bin, "claude")
    fs.writeFileSync(claude, "#!/bin/sh\n", { mode: 0o755 })

    // no `$SHELL`, and none of the shells that are always there: nothing to ask
    delete process.env.SHELL
    const alwaysThere = ["/bin/bash", "/bin/sh", "/bin/zsh"]
    const realAccess = fs.accessSync
    vi.spyOn(fs, "accessSync").mockImplementation((file, mode) => {
      if (typeof file === "string" && alwaysThere.includes(file))
        throw new Error("ENOENT")
      return realAccess(file, mode)
    })
    expect(await locate("claude")).toBeNull()

    vi.restoreAllMocks()
    const answer = path.join(dir, "answer-sh")
    fs.writeFileSync(answer, `#!/bin/sh\nprintf "__PATH__${bin}__PATH__"\n`, {
      mode: 0o755,
    })
    process.env.SHELL = answer
    expect(await locate("claude")).toBe(claude)
  })
})

describe("Providers", () => {
  let dir: string
  let was: string | undefined
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-providers-"))
    was = process.env.PATH
  })
  afterEach(() => {
    process.env.PATH = was
    fs.rmSync(dir, { recursive: true, force: true })
  })

  /** A command that says it is some version, and what it was started with. */
  const command = (name: string, version: string) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, `#!/bin/sh\necho "${name} ${version} (build 1)"\n`, {
      mode: 0o755,
    })
    return file
  }
  /**
   * A login shell that is there, and answers with the PATH it was given: a stand-in for
   * the real one, whose profile would bring this machine's own PATH in with it and let
   * the agents installed here be found.
   */
  const standInShell = () => {
    const file = path.join(dir, "stand-in-sh")
    fs.writeFileSync(
      file,
      `#!/bin/sh\nprintf "__PATH__%s__PATH__" "$PATH"\n`,
      { mode: 0o755 }
    )
    return file
  }
  const settled = (providers: Providers) =>
    new Promise<void>((resolve) => {
      const look = () =>
        providers.list().some((one) => one.checking)
          ? setTimeout(look, 10)
          : resolve()
      look()
    })

  it("finds each where it is, asks the ones in use about themselves, and says how to start them", async () => {
    command("claude", "2.1.0")
    const grok = command("grok-nightly", "1.0.50")
    // (a PATH with nothing else on it: what is installed on this machine is not found)
    process.env.SHELL = standInShell()
    process.env.PATH = dir
    const settings = new SettingsStore(
      path.join(dir, "settings.json"),
      {
        projectsFolder: dir,
        lookOver: true,
        analytics: true,
        versions: true,
      },
      // (a key is kept only where the system can keep it safely)
      { seal: (text) => text, unseal: (sealed) => sealed }
    )
    settings.setProvider("grok", {
      enabled: true,
      binary: grok,
      args: "--debug 'two words'",
      env: [{ name: "XAI_API_KEY", value: "xai-123" }],
    })
    const asked: string[] = []
    const looked = (models: number): Looked => ({
      signedIn: true,
      account: "Someone",
      trouble: null,
      models: Array.from({ length: models }, (_, index) => ({
        id: index === 0 ? null : `m${index}`,
        name: `M${index}`,
        short: `M${index}`,
        detail: "",
        efforts: [],
      })),
    })
    let changes = 0
    const providers = new Providers({
      settings,
      look: {
        claude: async () => (asked.push("claude"), looked(2)),
        codex: async () => (asked.push("codex"), looked(1)),
        grok: async (launch) => {
          asked.push(`grok ${launch.args.join("|")} ${launch.env.XAI_API_KEY}`)
          throw new Error("Grok did not answer.")
        },
        opencode: async () => (asked.push("opencode"), looked(0)),
      },
      onChange: () => changes++,
    })
    await providers.found
    await settled(providers)

    const by = Object.fromEntries(
      providers.list().map((one) => [one.id, one])
    ) as Record<string, Provider>
    expect(by.claude.status).toMatchObject({
      path: fs.realpathSync(path.join(dir, "claude")),
      version: "2.1.0",
      signedIn: true,
      account: "Someone",
      trouble: null,
    })
    expect(by.claude.models).toHaveLength(2)
    // not installed, and off: nothing is asked of it
    expect(by.codex.status).toMatchObject({ path: null, version: null })
    expect(by.codex.models).toEqual([])
    expect(by.grok.status).toMatchObject({
      path: grok,
      version: "1.0.50",
      signedIn: null,
      trouble: "Grok did not answer.",
    })
    expect(asked.sort()).toEqual(["claude", "grok --debug|two words xai-123"])
    expect(changes).toBeGreaterThan(0)

    expect(providers.launch("claude")).toMatchObject({
      path: fs.realpathSync(path.join(dir, "claude")),
      args: [],
    })
    expect(providers.launch("codex")).toBeNull()
    expect(providers.any()).toBe(true)

    // a turn it turned away for want of a sign-in has it signed out, though it still names
    // the account it kept; looked at again, it is taken at its word
    providers.signedOut("claude")
    expect(providers.list()[0].status).toMatchObject({
      signedIn: false,
      account: "Someone",
    })
    await providers.check("claude")
    expect(providers.list()[0].status?.signedIn).toBe(true)
    asked.splice(asked.indexOf("claude"), 1)

    await providers.change("claude", { enabled: false })
    expect(providers.launch("claude")).toBeNull()
    expect(asked.filter((one) => one === "claude")).toHaveLength(1)
    // what only the window goes by changes nothing that is run
    await providers.change("grok", { hidden: ["m1"], favorites: ["m2"] })
    expect(asked).toHaveLength(2)
    expect(settings.provider("grok")).toMatchObject({
      hidden: ["m1"],
      favorites: ["m2"],
      binary: grok,
    })
    await providers.change("claude", { enabled: true, home: "~/elsewhere" })
    expect(providers.launch("claude")?.env.CLAUDE_CONFIG_DIR).toBe(
      path.join(os.homedir(), "elsewhere")
    )
    expect(asked.filter((one) => one === "claude")).toHaveLength(2)
  })

  it("offers a newer version of one in use, puts it in the way it was installed, and looks again", async () => {
    // a Claude Code installed with the npm of a Node of its own
    const prefix = path.join(dir, "node")
    const pkg = path.join(prefix, "lib/node_modules/@anthropic-ai/claude-code")
    fs.mkdirSync(path.join(pkg, "bin"), { recursive: true })
    fs.mkdirSync(path.join(prefix, "bin"))
    fs.writeFileSync(path.join(prefix, "bin", "npm"), "", { mode: 0o755 })
    const claude = path.join(pkg, "bin", "claude")
    const says = (version: string) =>
      fs.writeFileSync(
        claude,
        `#!/bin/sh
echo "${version} (Claude Code)"
`,
        {
          mode: 0o755,
        }
      )
    says("2.1.296")
    process.env.SHELL = standInShell()
    process.env.PATH = dir
    const settings = new SettingsStore(path.join(dir, "settings.json"), {
      projectsFolder: dir,
      lookOver: true,
      analytics: true,
      versions: true,
    })
    settings.setProvider("claude", { binary: claude })
    const ran: string[][] = []
    const providers = new Providers({
      settings,
      look: {
        claude: async () => ({
          signedIn: true,
          account: "Claude Max",
          trouble: null,
          models: [],
        }),
        codex: async () => ({
          signedIn: null,
          account: null,
          trouble: null,
          models: [],
        }),
        grok: async () => ({
          signedIn: null,
          account: null,
          trouble: null,
          models: [],
        }),
        opencode: async () => ({
          signedIn: true,
          account: null,
          trouble: null,
          models: [],
        }),
      },
      onChange: () => {},
      updates: {
        newest: async () => "2.1.299",
        run: async (command) => {
          ran.push([command.file, ...command.args])
          says("2.1.299")
          return { ok: true, output: "" }
        },
      },
    })
    await providers.found
    await settled(providers)
    const claudeOf = () => providers.list().find((one) => one.id === "claude")
    expect(claudeOf()).toMatchObject({
      update: {
        version: "2.1.299",
        command: "npm install -g @anthropic-ai/claude-code@latest",
      },
      updating: false,
    })

    expect(await providers.update("claude")).toEqual({
      outcome: "updated",
      version: "2.1.299",
    })
    // by the npm of its own Node, into that Node's folder
    const real = fs.realpathSync(prefix)
    expect(ran).toEqual([
      [
        path.join(real, "bin", "npm"),
        "install",
        "-g",
        "--prefix",
        real,
        "@anthropic-ai/claude-code@latest",
      ],
    ])
    expect(claudeOf()).toMatchObject({
      status: { version: "2.1.299" },
      update: null,
      updating: false,
    })
    await providers.change("claude", { enabled: false })
    expect(claudeOf()?.update).toBeNull()
  })
})
