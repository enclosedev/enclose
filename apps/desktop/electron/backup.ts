// A project's history, kept in git: every project the app makes, and every folder it
// opens that was no repository yet, is one. After each turn of the agent's, and each
// thing taken back or put back, what the folder holds is committed: on a branch of the
// conversation's own, where each conversation has its own version of the project (see
// versions.ts), and on main where there is only the one.
//
// A folder that was a repository already, or is inside one, is somebody's own, kept
// their own way: the app commits nothing in it. What it set up itself it remembers in its
// own list of projects (projects.ts), and goes by that alone: a repository's own config
// is anybody's to write, whoever sent the folder or the agent working in it.
import fs from "node:fs"
import path from "node:path"

/** Runs git in a folder: what it printed, and how it ended. */
export type Git = (
  args: string[],
  cwd: string,
  env?: Record<string, string>
) => Promise<{ code: number; stdout: string; stderr: string }>

/** Who a commit is by: the app. */
export type Author = { name: string; email: string }
export const APP_AUTHOR: Author = {
  name: "Enclose",
  email: "noreply@enclose.dev",
}

/** A file this big or bigger goes to Git LFS, which keeps it apart from the rest. */
export const BIG = 50 * 1024 * 1024

/**
 * What is never kept: made again from what is, a Python of the project's own, or where
 * keys and passwords are kept, which have no business in a project's history.
 */
const NOT_KEPT = [
  ".venv/",
  "venv/",
  "__pycache__/",
  ".DS_Store",
  ".env",
  ".env.*",
]

/** What the app adds to a project's .gitignore, under this line. */
const IGNORED_SAYS = "# Enclose: made again from the project's own files"

/**
 * A project's .gitignore, with what the app leaves out of it added: what the build
 * writes (`built`, the folder of its manifest, where there is a build to write it again)
 * and what is never kept. What the file says already stays as it is.
 */
export function ignoreText(existing: string | null, built: string | null) {
  const lines = (existing ?? "").split(/\r?\n/).map((line) => line.trim())
  const wanted = [...(built ? [`${built}/`] : []), ...NOT_KEPT].filter(
    (pattern) =>
      !lines.includes(pattern) && !lines.includes(pattern.replace(/\/$/, ""))
  )
  if (wanted.length === 0) return existing ?? ""
  const before = (existing ?? "").replace(/\s*$/, "")
  return `${before ? `${before}\n\n` : ""}${IGNORED_SAYS}\n${wanted.join("\n")}\n`
}

/** Lower case, with dashes: what a name is made into for a branch or a repository. */
export function slugged(text: string, longest = 60): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, longest)
      .replace(/-+$/, "") || "project"
  )
}

/** What a conversation's branch is called: after what it began with, and its own id. */
export function branchFor(what: string, conversationId: string): string {
  return `version/${slugged(what, 40)}-${conversationId.slice(0, 6)}`
}

/**
 * Why git says it failed, in a line: the line that says it is fatal, or an error, and
 * not the hints it puts after that; otherwise the last it wrote.
 */
export function whyOf(said: string): string {
  const lines = said
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    lines.find((line) => /^(fatal|error|! \[)/.test(line)) ?? lines.at(-1) ?? ""
  )
}

const run = async (
  git: Git,
  args: string[],
  cwd: string,
  env?: Record<string, string>
) => {
  const done = await git(args, cwd, env)
  if (done.code !== 0)
    throw new Error(
      `git ${args[0]} failed: ${whyOf(done.stderr || done.stdout)}`
    )
  return done.stdout
}

/** Whether a folder is a repository of its own (and not inside some other). */
export const isRepository = (dir: string) =>
  fs.existsSync(path.join(dir, ".git"))

/** Whether a folder is a repository, or in one: its own, or one a folder above it is. */
export function inRepository(dir: string): boolean {
  let at = path.resolve(dir)
  for (;;) {
    if (isRepository(at)) return true
    const up = path.dirname(at)
    if (up === at) return false
    at = up
  }
}

/**
 * Whether a repository says of itself that the app set it up (enclose.managed, in its own
 * config, as the app wrote it until it kept that itself). Anything in the folder can say
 * so, and so it counts only for the projects the app knew already then (see projects.ts).
 */
export function markedManaged(dir: string): boolean {
  try {
    const config = fs.readFileSync(path.join(dir, ".git", "config"), "utf8")
    return /\[enclose\][^[]*\bmanaged\s*=\s*true\b/.test(config)
  } catch {
    return false
  }
}

/**
 * Throw where a repository's own config names commands of its own for git to run on
 * what is added or pushed: a filter other than Git LFS's, or a way of its own for Git LFS
 * to send files. Whatever the folder holds can write that config, the agent included;
 * the app commits and pushes nothing in such a one.
 */
export async function noCommandsOfItsOwn(git: Git, dir: string): Promise<void> {
  const listed = await run(git, ["config", "--list", "--show-scope", "-z"], dir)
  const named = listed
    .split("\0")
    .reduce<string[]>((keys, field, i, fields) => {
      // scope, then key and value on one line: local or worktree is the repository's own
      if (i % 2 === 0 && (field === "local" || field === "worktree"))
        keys.push((fields[i + 1] ?? "").split("\n")[0].toLowerCase())
      return keys
    }, [])
    .filter(
      (key) =>
        (/^filter\..+\.(clean|smudge|process)$/.test(key) &&
          !key.startsWith("filter.lfs.")) ||
        key.startsWith("lfs.customtransfer.") ||
        key === "lfs.standalonetransferagent"
    )
  if (named.length > 0)
    throw new Error(
      `The repository in ${dir} names commands of its own (${named.join(", ")}): nothing is committed or pushed in it.`
    )
}

/**
 * Make a folder a repository the app keeps: with a .gitignore, and nothing committed
 * yet. Not one that is a repository already, or is inside one, which is somebody's own
 * (unless `nested`, for a folder the app made itself, wherever it put it). Whether it
 * made it one.
 */
export async function setUp(
  git: Git,
  dir: string,
  /** the folder the build writes, within the project; null where nothing is built */
  built: string | null,
  nested = false
): Promise<boolean> {
  if (isRepository(dir) || (!nested && inRepository(dir))) return false
  await run(git, ["init", "--quiet", "--initial-branch=main"], dir)
  // (what an earlier version of the app goes by, should it be opened again)
  await run(git, ["config", "enclose.managed", "true"], dir)
  // the repository's own: and so nothing the user has elsewhere moves a file in it
  await run(git, ["config", "core.autocrlf", "false"], dir)
  const ignore = path.join(dir, ".gitignore")
  const existing = fs.existsSync(ignore)
    ? fs.readFileSync(ignore, "utf8")
    : null
  const next = ignoreText(existing, built)
  if (next !== existing) fs.writeFileSync(ignore, next)
  return true
}

/** The branch HEAD is on, or null where it is on none. */
async function onBranch(git: Git, dir: string): Promise<string | null> {
  const said = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], dir)
  return said.code === 0 ? said.stdout.trim() : null
}

const hasCommits = async (git: Git, dir: string) =>
  (await git(["rev-parse", "--verify", "--quiet", "HEAD"], dir)).code === 0

/**
 * Put HEAD on a branch without touching a file: the folder is that branch's already,
 * as versions.ts put it. A branch there is none of yet begins where HEAD is.
 */
async function moveTo(git: Git, dir: string, branch: string) {
  if ((await onBranch(git, dir)) === branch) return
  const there =
    (
      await git(
        ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
        dir
      )
    ).code === 0
  if (!there && (await hasCommits(git, dir)))
    await run(git, ["branch", branch], dir)
  await run(git, ["symbolic-ref", "HEAD", `refs/heads/${branch}`], dir)
}

const branchThere = async (git: Git, dir: string, branch: string) =>
  (await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], dir))
    .code === 0

/** What a repository's config says, or "" where it says nothing. */
const configOf = async (git: Git, dir: string, key: string) =>
  (await git(["config", "--get", key], dir)).stdout.trim()

/**
 * Make a conversation's version of the project its main one, in the project's history
 * (see backups.ts for which branch each is committed on). Main takes up what the
 * version's branch holds, in a commit that has both before it: nothing is rewritten, and
 * a push of it goes through as any other. What main was goes on a branch of its own, for
 * the conversation that was main (`was`, where the repository does not say which), to
 * go on committing on. A version that has committed nothing yet commits on main from
 * now on. HEAD goes with the branch it was on, where that is now called something else.
 * Whether anything was done: nothing is, where it is main already.
 */
export async function makeMain(
  git: Git,
  dir: string,
  {
    conversationId,
    was,
    titleOf,
    on,
    message,
    author,
  }: {
    conversationId: string
    /** the conversation that was the main version, as the app has it */
    was: string | null
    /** what a conversation goes by, to name its branch after */
    titleOf: (conversationId: string) => string
    /** the conversation the folder is now, where it is one's */
    on: string | null
    message: string
    author: Author
  }
): Promise<boolean> {
  const key = (id: string) => `enclose-version.${id}.branch`
  /** the branch a conversation had before it was made main, where it had one */
  const own = (id: string) => `enclose-version.${id}.own`
  const its = await configOf(git, dir, key(conversationId))
  if (its === "main") return false
  const before =
    (await configOf(git, dir, "enclose.main")) ||
    (was !== conversationId ? was : null)
  const mainThere = await branchThere(git, dir, "main")
  // what main was, on a branch of the conversation's that was main: where it is
  // known whose it was (the one it had before it was made main, where it had one)
  const moved =
    before && before !== conversationId
      ? (await configOf(git, dir, own(before))) ||
        branchFor(titleOf(before), before)
      : null
  if (moved && mainThere)
    await run(
      git,
      ["update-ref", `refs/heads/${moved}`, "refs/heads/main"],
      dir
    )
  if (its && (await branchThere(git, dir, its))) {
    if (mainThere) {
      const tree = (await run(git, ["rev-parse", `${its}^{tree}`], dir)).trim()
      const commit = (
        await run(
          git,
          ["commit-tree", tree, "-p", "main", "-p", its, "-m", message],
          dir,
          {
            GIT_AUTHOR_NAME: author.name,
            GIT_AUTHOR_EMAIL: author.email,
            GIT_COMMITTER_NAME: author.name,
            GIT_COMMITTER_EMAIL: author.email,
          }
        )
      ).trim()
      await run(git, ["update-ref", "refs/heads/main", commit], dir)
    } else await run(git, ["update-ref", "refs/heads/main", its], dir)
  }
  if (moved && before) await run(git, ["config", key(before), moved], dir)
  if (its) await run(git, ["config", own(conversationId), its], dir)
  await run(git, ["config", key(conversationId), "main"], dir)
  await run(git, ["config", "enclose.main", conversationId], dir)
  // HEAD is on the branch of the conversation the folder is: the folder holds what that
  // branch does, and the two branches that changed hands hold what they did before
  const head = await onBranch(git, dir)
  if (head === "main" && moved && on !== conversationId)
    await run(git, ["symbolic-ref", "HEAD", `refs/heads/${moved}`], dir)
  else if (head && head === its)
    await run(git, ["symbolic-ref", "HEAD", "refs/heads/main"], dir)
  return true
}

/**
 * Have Git LFS keep the files too big for a repository to keep well: those at least BIG,
 * not ignored, and not kept by it yet.
 */
async function bigOnes(git: Git, dir: string): Promise<void> {
  const listed = await run(
    git,
    ["ls-files", "--others", "--modified", "--exclude-standard", "-z"],
    dir
  )
  const big = listed
    .split("\0")
    .filter(Boolean)
    .filter((file) => {
      try {
        return fs.statSync(path.join(dir, file)).size >= BIG
      } catch {
        return false
      }
    })
  if (big.length === 0) return
  // (what Git LFS keeps already says so, in the repository's attributes)
  const said = await run(git, ["check-attr", "-z", "filter", "--", ...big], dir)
  const fields = said.split("\0")
  const kept = new Set<string>()
  for (let i = 0; i + 2 < fields.length; i += 3)
    if (fields[i + 2] === "lfs") kept.add(fields[i])
  const fresh = big.filter((file) => !kept.has(file))
  if (fresh.length === 0) return
  // its filters, in the repository's config; no hooks, which the app never runs (git.ts):
  // what they would send on a push it sends itself (backups.ts)
  await run(git, ["lfs", "install", "--local", "--skip-repo"], dir)
  await run(git, ["lfs", "track", "--filename", ...fresh], dir)
}

/** How old git's lock on a repository's index is before it is taken for one left behind, ms. */
export const STALE_LOCK_MS = 10 * 60_000

/**
 * Take away the lock on a repository's index that a git cut short leaves behind (the app
 * quit, or the machine going off, in the middle of a commit), which would have every
 * commit after it fail. Only one older than STALE_LOCK_MS, which no git still at work
 * holds for so long; and only where no git of the app's own is at work in the folder,
 * which is so wherever this is called from what is done in a project one thing at a
 * time (backups.ts). Whether there was one to take away.
 */
export function clearStaleLock(dir: string, now = Date.now()): boolean {
  const lock = path.join(dir, ".git", "index.lock")
  try {
    if (now - fs.statSync(lock).mtimeMs < STALE_LOCK_MS) return false
    fs.rmSync(lock)
    return true
  } catch {
    return false
  }
}

export type Committed = {
  /** the commit made, or null where there was nothing to commit */
  commit: string | null
  branch: string
}

/**
 * Commit what the folder holds, all of it, on `branch`: what changed since that branch
 * was last committed to, by whatever changed it. Nothing is committed where nothing
 * changed. Throws where git does, and where the repository names commands of its own.
 */
export async function commitAll(
  git: Git,
  dir: string,
  {
    branch,
    message,
    author,
  }: {
    branch: string
    /**
     * What the commit says: as it is, or made from the files it holds, each as git has
     * it changed ("M\tmodel.py"), once they are known
     */
    message: string | ((files: string[]) => Promise<string>)
    author: Author
  }
): Promise<Committed> {
  await noCommandsOfItsOwn(git, dir)
  await moveTo(git, dir, branch)
  await bigOnes(git, dir)
  await run(git, ["add", "--all"], dir)
  const staged = await git(["diff", "--cached", "--quiet"], dir)
  if (staged.code === 0 && (await hasCommits(git, dir)))
    return { commit: null, branch }
  const said =
    typeof message === "string"
      ? message
      : await message(
          (await run(git, ["diff", "--cached", "--name-status"], dir))
            .split("\n")
            .filter(Boolean)
        )
  const env = {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  }
  await run(
    git,
    ["commit", "--quiet", "--allow-empty", "--no-verify", "--message", said],
    dir,
    env
  )
  const commit = (await run(git, ["rev-parse", "HEAD"], dir)).trim()
  return { commit, branch }
}

/**
 * What a commit says, where nothing better is had: the first line of what was asked, and
 * the conversation it was in.
 */
export function messageOf(what: string, conversation: string | null): string {
  const line = what.replace(/\s+/g, " ").trim()
  const subject = line.length > 72 ? `${line.slice(0, 71)}…` : line || "Changes"
  return conversation && conversation !== line
    ? `${subject}\n\nConversation: ${conversation}`
    : subject
}

/**
 * What a commit says of a turn whose changes have been logged (see gist.ts): the line
 * that matters most, then the rest under it, then the conversation it was in.
 */
export function loggedAs(lines: string[], conversation: string | null): string {
  const [subject, ...rest] = lines
  return [
    subject,
    ...(rest.length > 0 ? ["", ...rest] : []),
    ...(conversation ? ["", `Conversation: ${conversation}`] : []),
  ].join("\n")
}
