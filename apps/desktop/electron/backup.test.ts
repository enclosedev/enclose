import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  APP_AUTHOR,
  BIG,
  branchFor,
  clearStaleLock,
  commitAll,
  ignoreText,
  inRepository,
  loggedAs,
  markedManaged,
  messageOf,
  setUp,
  slugged,
  whyOf,
} from "./backup"
import { git, overNetwork } from "./git"

let dir: string
const write = (file: string, content: string | Buffer = "") => {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
const out = async (...args: string[]) => (await git(args, dir)).stdout.trim()

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclose-git-")))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe("ignoreText", () => {
  it("leaves out what the build writes and what is never kept", () => {
    expect(ignoreText(null, "build")).toBe(
      [
        "# Enclose: made again from the project's own files",
        "build/",
        ".venv/",
        "venv/",
        "__pycache__/",
        ".DS_Store",
        ".env",
        ".env.*",
        "",
      ].join("\n")
    )
  })

  it("keeps what the file says, and adds only what it does not say already", () => {
    const next = ignoreText("*.log\nbuild\n.DS_Store\n", "build")
    expect(next.startsWith("*.log\nbuild\n.DS_Store\n\n")).toBe(true)
    expect(next).toContain(".venv/")
    expect(next.match(/build/g)).toHaveLength(1)
    expect(ignoreText(next, "build")).toBe(next)
  })

  it("keeps what is built where nothing builds it again", () => {
    expect(ignoreText(null, null)).not.toContain("build/")
  })
})

describe("names", () => {
  it("are lower case, with dashes, in letters a URL has", () => {
    expect(slugged("Café table, 2nd try!")).toBe("cafe-table-2nd-try")
    expect(slugged("***")).toBe("project")
    expect(branchFor("Make the lid thicker", "a1b2c3d4e5")).toBe(
      "version/make-the-lid-thicker-a1b2c3"
    )
  })

  it("make a commit's message of what was asked, and the conversation", () => {
    expect(messageOf("Make the lid\nthicker", "Lid")).toBe(
      "Make the lid thicker\n\nConversation: Lid"
    )
    expect(messageOf("x".repeat(100), null)).toHaveLength(72)
  })

  it("make one of a change log: the first line, then the rest under it", () => {
    expect(
      loggedAs(["Added: a circuit board", "Changed: the back cover"], "Clock")
    ).toBe(
      "Added: a circuit board\n\nChanged: the back cover\n\nConversation: Clock"
    )
    expect(loggedAs(["Fixed: the lid's gap"], null)).toBe(
      "Fixed: the lid's gap"
    )
  })
})

describe("setUp", () => {
  it("makes a folder a repository the app keeps", async () => {
    write("model.py", "print('hi')")
    expect(await setUp(git, dir, "build")).toBe(true)
    expect(markedManaged(dir)).toBe(true)
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(
      "build/"
    )
    expect(await setUp(git, dir, "build")).toBe(false)
  })

  it("leaves a repository that was somebody's own as theirs", async () => {
    await git(["init", "--quiet"], dir)
    expect(await setUp(git, dir, "build")).toBe(false)
    expect(markedManaged(dir)).toBe(false)
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(false)
  })

  it("makes no repository in a folder of somebody's own, unless the app made it", async () => {
    await git(["init", "--quiet"], dir)
    write("case/model.py", "a = 1")
    const inner = path.join(dir, "case")
    expect(inRepository(inner)).toBe(true)
    expect(await setUp(git, inner, "build")).toBe(false)
    expect(fs.existsSync(path.join(inner, ".git"))).toBe(false)
    expect(await setUp(git, inner, "build", true)).toBe(true)
  })
})

describe("commands of the repository's own", () => {
  const by = { message: "Begin", author: APP_AUTHOR, branch: "main" }

  it("runs no hook and no file watcher the repository names", async () => {
    write("model.py", "a = 1")
    await setUp(git, dir, "build")
    const marker = path.join(dir, "..", `${path.basename(dir)}-ran`)
    for (const hook of ["post-commit", "reference-transaction", "pre-commit"]) {
      write(`.git/hooks/${hook}`, `#!/bin/sh\ntouch "${marker}"\n`)
      fs.chmodSync(path.join(dir, ".git", "hooks", hook), 0o755)
    }
    write(".git/watch", `#!/bin/sh\ntouch "${marker}"\n`)
    fs.chmodSync(path.join(dir, ".git", "watch"), 0o755)
    await out("config", "core.fsmonitor", path.join(dir, ".git", "watch"))
    expect((await commitAll(git, dir, by)).commit).not.toBeNull()
    expect(fs.existsSync(marker)).toBe(false)
  })

  it("commits nothing where the repository has a filter of its own", async () => {
    write("model.py", "a = 1")
    write(".gitattributes", "* filter=mine\n")
    await setUp(git, dir, "build")
    await out("config", "filter.mine.clean", "cat")
    await expect(commitAll(git, dir, by)).rejects.toThrow(/filter\.mine\.clean/)
    expect((await git(["rev-parse", "HEAD"], dir)).code).not.toBe(0)
  })
})

describe("commitAll", () => {
  const by = { message: "Begin", author: APP_AUTHOR }

  it("commits all that is kept, by the one it is said to be by, and nothing twice", async () => {
    write("model.py", "a = 1")
    write("build/lid.glb", "mesh")
    await setUp(git, dir, "build")
    const first = await commitAll(git, dir, { ...by, branch: "main" })
    expect(first.commit).toMatch(/^[0-9a-f]{40}$/)
    expect((await out("ls-files")).split("\n")).toEqual([
      ".gitignore",
      "model.py",
    ])
    expect(await out("log", "-1", "--format=%an <%ae>|%s")).toBe(
      "Enclose <noreply@enclose.dev>|Begin"
    )
    expect((await commitAll(git, dir, { ...by, branch: "main" })).commit).toBe(
      null
    )
  })

  it("puts each version on its own branch, from where the folder was, leaving the files be", async () => {
    write("model.py", "a = 1")
    await setUp(git, dir, "build")
    await commitAll(git, dir, { ...by, branch: "main" })
    // another conversation's turn changes the folder, as versions.ts leaves it
    write("model.py", "a = 2")
    const branch = branchFor("Thicker", "c0ffee00")
    await commitAll(git, dir, { ...by, message: "Thicker", branch })
    expect(await out("rev-parse", "--abbrev-ref", "HEAD")).toBe(branch)
    expect(await out("show", "main:model.py")).toBe("a = 1")
    expect(await out("show", `${branch}:model.py`)).toBe("a = 2")
    // the folder turned back to the first conversation's, which goes on on main
    write("model.py", "a = 3")
    await commitAll(git, dir, { ...by, message: "Again", branch: "main" })
    expect(await out("log", "--format=%s", "main")).toBe("Again\nBegin")
    expect(fs.readFileSync(path.join(dir, "model.py"), "utf8")).toBe("a = 3")
  })

  it("makes the message, where it is to be made, of the files it holds", async () => {
    write("model.py", "a = 1")
    await setUp(git, dir, "build")
    await commitAll(git, dir, { ...by, branch: "main" })
    write("model.py", "a = 2")
    write("pcb/main.circuit.tsx", "board")
    let seen: string[] = []
    await commitAll(git, dir, {
      ...by,
      branch: "main",
      message: async (files) => {
        seen = files
        return "Added: a circuit board"
      },
    })
    expect(seen).toEqual(["M\tmodel.py", "A\tpcb/main.circuit.tsx"])
    expect(await out("log", "-1", "--format=%s")).toBe("Added: a circuit board")
  })

  it("has Git LFS keep a file too big for a repository", async () => {
    write("model.py", "a = 1")
    write("source/scan [1].stl", Buffer.alloc(BIG))
    await setUp(git, dir, "build")
    await commitAll(git, dir, { ...by, branch: "main" })
    expect(await out("lfs", "ls-files", "--name-only")).toBe(
      "source/scan [1].stl"
    )
    // what the repository holds of it is a pointer to it
    expect(await out("cat-file", "-s", "HEAD:source/scan [1].stl")).toMatch(
      /^1\d\d$/
    )
  }, 30_000)
})

describe("clearStaleLock", () => {
  it("takes away a lock on the index that a git cut short left behind, and only an old one", () => {
    write(".git/index.lock", "")
    const lock = path.join(dir, ".git", "index.lock")
    const now = fs.statSync(lock).mtimeMs
    // one a git may still be at work with
    expect(clearStaleLock(dir, now + 60_000)).toBe(false)
    expect(fs.existsSync(lock)).toBe(true)
    expect(clearStaleLock(dir, now + 11 * 60_000)).toBe(true)
    expect(fs.existsSync(lock)).toBe(false)
    expect(clearStaleLock(dir)).toBe(false)
  })
})

describe("overNetwork", () => {
  it("knows what git sends or fetches, Git LFS's own as well, from the rest", () => {
    expect(overNetwork(["push", "--all", "origin"])).toBe(true)
    expect(overNetwork(["lfs", "push", "--all", "origin"])).toBe(true)
    expect(overNetwork(["fetch"])).toBe(true)
    expect(overNetwork(["commit", "--message", "push"])).toBe(false)
    expect(overNetwork(["lfs", "track", "*.stl"])).toBe(false)
  })
})

describe("whyOf", () => {
  it("says why git failed by the line that says so, not the hints after it", () => {
    expect(
      whyOf(
        "fatal: Unable to create '/x/.git/index.lock': File exists.\n\nAnother git process seems to be running in this repository.\nremove the file manually to continue.\n"
      )
    ).toBe("fatal: Unable to create '/x/.git/index.lock': File exists.")
    expect(
      whyOf(
        "To github.com:ada/enclose-lid.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs\nhint: Updates were rejected"
      )
    ).toBe("! [rejected]        main -> main (fetch first)")
    expect(whyOf("something else\nand its last line")).toBe("and its last line")
    expect(whyOf("")).toBe("")
  })
})
