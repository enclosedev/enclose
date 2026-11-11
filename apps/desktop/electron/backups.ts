// Every project's history kept: committed after each turn (backup.ts), on the branch of
// the conversation it was in.
//
// What is done in one project is done one thing at a time, in the order it was asked;
// projects do not wait on each other.
import path from "node:path"

import {
  APP_AUTHOR,
  branchFor,
  clearStaleLock,
  commitAll,
  inRepository,
  isRepository,
  loggedAs,
  makeMain,
  messageOf,
  setUp,
  type Git,
} from "./backup"

/** A project, as far as its backing up goes. */
export type Backed = {
  id: string
  path: string
  name: string
  /** the manifest, absolute; null where there is no model yet */
  manifest: string | null
  /** the command that builds the model; null where there is none */
  build: string | null
  /** the app made the folder itself, rather than being pointed at one that was there */
  made: boolean
  /** the app set the folder's repository up itself, and keeps its history */
  kept: boolean
}

/** Whether the app keeps a project's history: a repository it set up itself, still there. */
const ours = (project: Backed) => project.kept && isRepository(project.path)

export type BackupsDeps = {
  git: Git
  projects: () => Backed[]
  /** the app has set a project's repository up: it keeps its history from now on */
  keep: (id: string) => void
  /** whether a folder is not too big to keep the history of (as versions.ts has it) */
  fits: (dir: string) => Promise<boolean>
  /** whether each conversation has the project its own way (versions.ts) */
  versioned: () => boolean
  /**
   * The conversation a project's folder is now, where each has the project its own way
   * (versions.ts): what it holds is committed on that one's branch, and on no other.
   */
  on?: (id: string) => string | null
  /**
   * Do something in a project's folder once nothing else is being done there (locks.ts):
   * what it holds is not committed as it is being put as another conversation has it.
   */
  hold?: <T>(id: string, work: () => Promise<T>) => Promise<T>
}

/** What the build writes, within the project: what is not kept, being made again. */
function builtOf(project: Backed): string | null {
  // nothing built yet: where the app's own projects build to, when they do
  if (!project.manifest) return "build"
  // no build to make it again: what is there is all there is of it
  if (!project.build) return null
  const within = path.relative(project.path, path.dirname(project.manifest))
  return within && !within.startsWith("..")
    ? within.split(path.sep).join("/")
    : null
}

export class Backups {
  private queues = new Map<string, Promise<unknown>>()
  /**
   * what has been asked to be committed in each project, until it has been or could not
   * be: its folder is not to be put as another conversation has it before that
   */
  private committing = new Map<string, Promise<unknown>>()

  private readonly deps: BackupsDeps

  constructor(deps: BackupsDeps) {
    this.deps = deps
  }

  private project(id: string): Backed | null {
    return this.deps.projects().find((one) => one.id === id) ?? null
  }

  /** Do this in a project once what was asked of it before is done. */
  private queue<T>(id: string, work: () => Promise<T>): Promise<T | null> {
    const before = this.queues.get(id) ?? Promise.resolve()
    const next = before.then(work).catch((error: unknown) => {
      console.error("[backup]", id, error)
      return null
    })
    this.queues.set(id, next)
    return next
  }

  /**
   * Resolves once what was asked until now to be committed in a project has been, or
   * could not be: what it was asked of is the folder as it is now.
   */
  async committed(id?: string): Promise<void> {
    await (id === undefined
      ? Promise.all([...this.committing.values()])
      : this.committing.get(id))
  }

  /** Something is to be committed in a project: call what this returns once it has been. */
  private toCommit(id: string): () => void {
    let done = () => {}
    const now = new Promise<void>((resolve) => (done = resolve))
    const all = Promise.all([this.committing.get(id), now])
    this.committing.set(id, all)
    void all.then(() => {
      if (this.committing.get(id) === all) this.committing.delete(id)
    })
    return done
  }

  /** In the project's folder, once nothing else is being done there. */
  private hold<T>(id: string, work: () => Promise<T>): Promise<T> {
    return this.deps.hold ? this.deps.hold(id, work) : work()
  }

  /**
   * The branch a conversation's version of the project is committed on: main for the
   * first conversation that commits anything, or where there are no versions; a branch
   * of its own for each one after, from where the folder was when it began.
   */
  private async branchOf(
    dir: string,
    conversationId: string | null,
    what: string
  ): Promise<string> {
    const { git } = this.deps
    if (!conversationId || !this.deps.versioned()) return "main"
    const key = `enclose-version.${conversationId}.branch`
    const known = (await git(["config", "--get", key], dir)).stdout.trim()
    if (known) return known
    const first = (
      await git(["config", "--get", "enclose.main"], dir)
    ).stdout.trim()
    let branch = "main"
    if (!first) await git(["config", "enclose.main", conversationId], dir)
    else if (first !== conversationId) branch = branchFor(what, conversationId)
    await git(["config", key, branch], dir)
    return branch
  }

  /**
   * Keep a project's history from now on, where it is the app's to keep: one the app
   * made, or a folder that was no repository. What it holds now is the first commit.
   */
  prepare(id: string, message: string): Promise<unknown> {
    const done = this.toCommit(id)
    return this.queue(id, async () => {
      try {
        const project = this.project(id)
        if (!project) return
        if (!(await this.keeps(project))) return
        await this.commit(project, null, message, message, done)
      } finally {
        done()
      }
    })
  }

  /**
   * Set a project up to have its history kept, where it is the app's to keep: not a
   * repository of somebody's own, or a folder in one, and not one too big to be a
   * model's. A repository is the app's only where it remembers setting it up.
   */
  private async keeps(project: Backed): Promise<boolean> {
    if (ours(project)) return true
    if (
      isRepository(project.path) ||
      (!project.made && inRepository(project.path))
    )
      return false
    if (!(await this.deps.fits(project.path))) return false
    const { git } = this.deps
    if (
      !(await this.hold(project.id, () =>
        setUp(git, project.path, builtOf(project), project.made)
      ))
    )
      return false
    this.deps.keep(project.id)
    return true
  }

  /** Commit what a turn left, or what taking one back did: in the conversation it was in. */
  record(
    id: string,
    {
      what,
      conversation,
      conversationId,
      log,
    }: {
      what: string
      conversation: string | null
      conversationId: string | null
      /**
       * What the changes were, in the lines of a change log ("Added: a lid"), from the
       * files the commit holds: what it then says, in place of what was asked. Nothing,
       * where it could not be had.
       */
      log?: (files: string[]) => Promise<string[] | null>
    }
  ): Promise<unknown> {
    const done = this.toCommit(id)
    return this.queue(id, async () => {
      try {
        const project = this.project(id)
        if (!project || !ours(project)) return
        const plain = messageOf(what, conversation)
        await this.commit(
          project,
          conversationId,
          what,
          log
            ? async (files) => {
                const lines = await log(files).catch(() => null)
                return lines?.length ? loggedAs(lines, conversation) : plain
              }
            : plain,
          done
        )
      } finally {
        done()
      }
    })
  }

  /**
   * Commit what a project's folder holds, on the branch of the conversation it is of.
   * Where the folder has become another conversation's since this was asked for, it is
   * not committed: what it holds is that one's, and what this one left goes in with its
   * next commit, when the folder is its own again. `done` is called once the commit is
   * made, or is not to be.
   */
  private async commit(
    project: Backed,
    conversationId: string | null,
    what: string,
    message: string | ((files: string[]) => Promise<string>),
    done: () => void = () => {}
  ) {
    await this.hold(project.id, async () => {
      if (
        conversationId !== null &&
        this.deps.versioned() &&
        this.deps.on &&
        this.deps.on(project.id) !== conversationId
      )
        return
      // (what git left of a run that was cut short would keep anything being committed)
      clearStaleLock(project.path)
      const branch = await this.branchOf(project.path, conversationId, what)
      await commitAll(this.deps.git, project.path, {
        branch,
        message,
        author: APP_AUTHOR,
      })
    }).finally(done)
  }

  /**
   * A conversation's version of the project was made its main one: its history is main
   * from now on, and the one that was main (`was`) goes on a branch of its own. Resolves
   * once that is done, or could not be.
   */
  madeMain(
    id: string,
    {
      conversationId,
      was,
      titleOf,
    }: {
      conversationId: string
      was: string | null
      /** what a conversation goes by, to name its branch after */
      titleOf: (conversationId: string) => string
    }
  ): Promise<unknown> {
    return this.queue(id, async () => {
      const project = this.project(id)
      if (!project || !ours(project) || !this.deps.versioned()) return
      await this.hold(project.id, () => {
        clearStaleLock(project.path)
        return makeMain(this.deps.git, project.path, {
          conversationId,
          was,
          titleOf,
          on: this.deps.on?.(project.id) ?? null,
          message: `Made “${titleOf(conversationId)}” the main version`,
          author: APP_AUTHOR,
        })
      })
    })
  }
}
