// The app's own process: the window, the list of projects, and the line to the agents.
import fs from "node:fs"
import path from "node:path"

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  shell,
} from "electron"
import electronUpdater from "electron-updater"

import {
  ACCESSES,
  BOARD_HOST,
  DRAFT_HOST,
  CHANNEL,
  EFFORTS,
  FEATURES,
  INSPIRATION_HOST,
  MODEL_SCHEME,
  PICTURE_HOST,
  OWN_SCENE,
  PROVIDERS,
  SCENE_HOST,
  type BoardSummary,
  type GitHubState,
  type GroupAsked,
  type GuideSummary,
  type Looks,
  type Manner,
  type Commands,
  type ModelSource,
  type ObjectRef,
  type PartNote,
  type PermissionAnswer,
  type Project,
  type Quote,
  type ReferenceSource,
  type Seen,
  type Settings,
  type ToolSource,
  type Undone,
  type Update,
  type Vec3,
  type ViewportAsked,
  type ViewportRequest,
  type ViewportResponse,
} from "../shared/api"
import { BOARD_FOLDER, builtOf } from "../shared/board-format"
import { archiveOf, EXAMPLES, EXAMPLES_URL } from "../shared/examples"
import {
  INSPIRATION_FOLDER,
  isPictureFile,
  pastedLink,
} from "../shared/inspiration-format"
import { PICTURE_TYPES } from "../shared/pictures"
import {
  COLOURS_FILE,
  coloursFile,
  readColours,
} from "../shared/colours-format"
import {
  readTheme,
  THEME_FOLDER,
  type Defaults,
  type Theme,
} from "../shared/theme-format"
import { Analytics, modelSaid, POSTHOG } from "./analytics"
import { LEFT_BEHIND, unpack, type Filed } from "./archive"
import { fileGuide, guideOf, guidesIn, removeGuide } from "./assembly"
import { boardsIn } from "./boards"
import { jlcpcbParts } from "./jlcpcb"
import { Drafts } from "./drafts"
import { Previews } from "./previews"
import { changeLog } from "./gist"
import { Changes, tookOf } from "./changes"
import { Versions } from "./versions"
import { Locks } from "./locks"
import { zipOf } from "./zip"
import { isRepository } from "./backup"
import { Backups, type BackingUp } from "./backups"
import { Connection } from "./connection"
import { git } from "./git"
import { MESH_FORMATS, meshFile, trianglesOf, type MeshFormat } from "./meshes"
import { followRename, listCommands, lookAtClaude } from "./claude"
import { lookAtCodex } from "./codex"
import { readTools } from "./custom-tools"
import { lookAtGrok } from "./grok"
import { lookAtOpencode } from "./opencode"
import {
  arrange,
  bringIn,
  broughtIn,
  CAD_ENDINGS,
  modelScript,
  runBuild,
  SCRIPT,
  sortOpened,
} from "./imports"
import { fetched, startFrom } from "./examples"
import { archived, archiveName, GuideServer } from "./guide-page"
import { standInName } from "./names"
import { groupNameOf } from "./naming"
import { Pace } from "./pace"
import { Pictures } from "./pictures"
import { Inspiration, lookingWith } from "./inspiration"
import { linkedPicture } from "./linked-picture"
import { redrawn } from "./redrawn"
import { SaveFolder } from "./saving"
import { serveFile } from "./serve"
import {
  folderName,
  folderSize,
  makeFolder,
  Projects,
  resolveInside,
} from "./projects"
import { appScenes, readScene } from "./reference"
import {
  cleanEnv,
  expandHome,
  locate,
  Providers,
  putFirstOnPath,
} from "./providers"
import { Python } from "./python"
import { stopPeers } from "./rpc"
import { SettingsStore, type Vault } from "./settings"
import {
  Threads,
  type Arranging,
  type Boarded,
  type Referenced,
} from "./threads"
import {
  listThemes,
  readDefaults,
  removeTheme,
  saveDefaults,
  saveTheme,
} from "./themes"
import { ToolServer } from "./tools"
import { onThisMachine, Updates } from "./update"
import { tryOtherApp } from "./github"

const HERE = import.meta.dirname
const DEV_URL = process.env.VITE_DEV_SERVER_URL
// the app's icon, in the sizes each system asks for (scripts/icons.mjs makes them)
const ICONS = path.join(HERE, "../icons")

// For checking the app without clicking through it, run from a checkout (the packaged
// app is told none of this, but where to look for its newer versions, on this machine):
//   ENCLOSE_USER_DATA=<dir>  keep state, and new projects, somewhere other than the real ones
//   --capture=<file.png>     load (window hidden), save a picture of it, quit
//   --script=<file.js>       run this in the window first; it may return a promise
//   --wait=<ms>              how long to let the window settle before each step
//   <folder or CAD file>     open it as a project, as if it were dropped on the window
//                            (this one the packaged app takes too)
//   ENCLOSE_EXAMPLES_URL=<url>  fetch the examples from there (it ends in a slash), even
//                            when the app has them beside it
//   ENCLOSE_UPDATES_URL=<url>  look there for the app's newer versions, where what `npm
//                            run dist` wrote to release/ is served, and not among its
//                            releases (the packaged app only: no other looks for any; and
//                            only at an address on this machine, 127.0.0.1 or localhost)
//   ENCLOSE_ANALYTICS_KEY=<key>  send the count of how the app is used to that PostHog
//                            project: run from a checkout it is sent nowhere otherwise
//   ENCLOSE_GITHUB_CLIENT_ID, ENCLOSE_GITHUB_APP  back up through another GitHub App
const CHECKOUT = !app.isPackaged
const flag = (name: string) =>
  CHECKOUT
    ? (process.argv
        .find((a) => a.startsWith(`--${name}=`))
        ?.slice(name.length + 3) ?? null)
    : null
const CAPTURE = flag("capture")
const EXAMPLES_FROM = (CHECKOUT && process.env.ENCLOSE_EXAMPLES_URL) || null
const UPDATES_FROM = onThisMachine(process.env.ENCLOSE_UPDATES_URL)
const ANALYTICS_KEY = (CHECKOUT && process.env.ENCLOSE_ANALYTICS_KEY) || null
if (CHECKOUT) tryOtherApp(process.env)
/** what the systems the app runs on are called, where the count of its use says which */
const SYSTEMS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
}

// The package's name for the app says how far along it is ("Enclose (Alpha)"), and that
// is what a Mac shows the app as. What the app keeps is filed under its name alone, as it
// was before the app said so: its state, in Application Support, and the key a Mac's
// keychain holds for what the settings seal. So the app goes by that name here, from
// before either is looked for, and neither is lost when what it is shown as changes.
// Run from a checkout it is shown as the one being worked on, "Enclose (Dev)", which is
// what the copy of Electron it is run as is called too (scripts/electron-name.mjs).
const SHOWN = app.isPackaged
  ? app.name
  : `${app.name.replace(/\s*\(.*\)$/, "")} (Dev)`
app.setName("Enclose")

/** How often the agents in use are looked at for a newer version, while the app is open. */
const NEWER_EVERY_MS = 6 * 60 * 60 * 1000

const ELSEWHERE = (CHECKOUT && process.env.ENCLOSE_USER_DATA) || null
if (ELSEWHERE) app.setPath("userData", ELSEWHERE)

protocol.registerSchemesAsPrivileged([
  {
    scheme: MODEL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".step": "model/step",
  ".stp": "model/step",
  ".stl": "model/stl",
  ".obj": "model/obj",
  // (the pictures put with messages: see shared/pictures.ts)
  ...Object.fromEntries(
    Object.entries(PICTURE_TYPES).map(([type, ending]) => [ending, type])
  ),
}

let win: BrowserWindow | null = null
let projects: Projects
let pictures: Pictures
let inspiration: Inspiration
let threads: Threads
let drafts: Drafts
let changes: Changes
let versions: Versions
/** the conversation the window shows of each project, by project */
const showing = new Map<string, string>()
let settings: SettingsStore
/** where a dialog to save with opens: where the last thing was saved (see saving.ts) */
let saving: SaveFolder
/** the agents on this machine: Claude Code, Codex, Grok, opencode */
let providers: Providers
let python: Python
/** where the app's own tools answer, for an agent that cannot be handed them */
const toolServer = new ToolServer()
/**
 * Where a project's assembly guides are served as pages, for a browser to open: each
 * from the project's folder and its model as they then are.
 */
const guideServer = new GuideServer(path.join(HERE, "guide"), (id) => {
  const project = projects.get(id)
  return project?.manifest
    ? { root: project.path, manifest: project.manifest }
    : null
})
/** the app's newer versions: none are looked for when it is run from a checkout */
let updates: Updates | null = null
/** GitHub, as projects are backed up to it, and backing them up */
let connection: Connection
let backups: Backups
let backingUp: BackingUp = null
/** the count of how the app is used: none is kept when it is run from a checkout */
let analytics: Analytics | null = null
/**
 * Where the app's kit is, and its examples if it has them. Run from a checkout, that is
 * the top of the repository, two folders up from the app (apps/desktop). Made into a
 * package, the app carries the kit among its resources, as files of their own for Python
 * and an agent to read (scripts/dist.mjs puts it there), and has no examples beside it.
 */
const TOP = app.isPackaged
  ? process.resourcesPath
  : path.join(app.getAppPath(), "../..")
/** where the app keeps the exporter a project copies to write its model */
const KIT = path.join(TOP, "kit", "enclose.py")
/** where the examples are when the app is run from its source: at the top, in examples/ */
const EXAMPLES_HERE = path.join(TOP, "examples")
/** where the themes are, which a checkout writes and takes away (see themes.ts) */
const THEMES = path.join(TOP, THEME_FOLDER)
/** the reference scenes the app has of its own, for a model to be seen in */
const SCENES = appScenes(path.join(TOP, "kit", "scenes"))
/** quick looks at the boards an agent writes, as it writes them */
const previews = new Previews({
  script: path.join(TOP, "kit", "board.mjs"),
  working: (projectId) => threads?.working(projectId) ?? false,
})

/**
 * The folder a file asked for is in, by the host it is asked of: a project's model, the
 * reference scene the project has of its own, one of the app's, the pictures put with
 * the project's messages, its circuit boards, its model as an agent writes it, or the
 * pictures on its inspiration board.
 */
function servedFrom(host: string): string | null {
  const [name, kind] = host.split(".")
  if (kind === SCENE_HOST.app)
    return SCENES.find((scene) => scene.id === name)?.dir ?? null
  if (kind === DRAFT_HOST) {
    const draft = drafts.shown(name)
    return draft && path.dirname(draft)
  }
  const project = projects.get(name)
  if (kind === PICTURE_HOST) return project ? pictures.folder(project.id) : null
  if (kind === INSPIRATION_HOST)
    return project ? path.join(project.path, INSPIRATION_FOLDER) : null
  if (kind === BOARD_HOST)
    return project ? path.join(project.path, BOARD_FOLDER) : null
  const manifest =
    kind === SCENE_HOST.own ? project?.reference : project?.manifest
  return manifest ? path.dirname(manifest) : null
}

/** The circuit board a message is about, from what the window knows it by. */
function boardBy(projectId: string, board: unknown): Boarded | null {
  const project = projects.get(projectId)
  if (typeof board !== "string" || !project) return null
  const found = boardsIn(project.path).find((one) => one.id === board)
  return found ? { id: found.id, name: found.name } : null
}

/** The reference scene a message is about, from what the window knows it by. */
function referencedBy(projectId: string, scene: unknown): Referenced | null {
  if (typeof scene !== "string") return null
  if (scene === OWN_SCENE) {
    const own = projects.get(projectId)?.reference
    const name = own && readScene(own)?.name
    return own
      ? { name: typeof name === "string" ? name : "Reference scene", app: null }
      : null
  }
  const found = SCENES.find((one) => one.id === scene)
  return found ? { name: found.name, app: found.id } : null
}

const list = (): Project[] =>
  projects
    .list((id) => threads.summaries(id))
    .map((project): Project =>
      project.missing
        ? project
        : threads.lookingOver(project.id)
          ? { ...project, lookOver: "underway" }
          : // with no agent to ask, a model waits to be looked over unseen
            project.lookOver && !providers.any()
            ? { ...project, lookOver: null }
            : project
    )
    .map((project): Project => {
      if (project.missing) return project
      const { undo, redo } = changes.last(project.id, whose(project.id))
      return {
        ...project,
        // (the model as an agent writes it is loaded as one built again is)
        revision: project.revision + drafts.stamp(project.id),
        assembling: threads.assembling(project.id),
        undo: undo && { what: undo.what, at: undo.at, took: tookOf(undo) },
        redo: redo && {
          what: redo.what,
          at: redo.undoneAt ?? redo.at,
          took: tookOf(redo),
        },
      }
    })

/** The key that puts back what was taken back, as this system writes it. */
const REDO_KEY = process.platform === "darwin" ? "⇧⌘Z" : "Shift Ctrl Z"

/**
 * Take back what the latest turn did to a project's files, or put back what was last
 * taken back. Not while Claude is at work there, or files are being made a model of.
 * The conversation the turn was in says that it was done, and the view shows the model
 * as it then is.
 */
async function turnBack(id: string, way: "undo" | "redo"): Promise<Undone> {
  const project = projects.get(id)
  if (!project) return { ok: false, why: "nothing", files: [] }
  if (threads.jobOf(id)) return { ok: false, why: "board", files: [] }
  if (threads.working(id) || builds.has(id) || versions.busy(id))
    return { ok: false, why: "busy", files: [] }
  // the manifest goes last: its being written is what the view loads the rest again for
  const manifest =
    project.manifest && path.relative(project.path, project.manifest)
  let outcome: Awaited<ReturnType<Changes["undo"]>>
  try {
    outcome = await changes[way](id, project.path, manifest, whose(id))
  } catch (error) {
    // Part of it may have been written: the model is loaded again as it now is. (The
    // change is still the latest, but the files it would be taken back from are not
    // all as it left them now, which is said if it is tried again.)
    projects.refresh(id)
    projects.changed(id)
    return {
      ok: false,
      why: "failed",
      files: [],
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  if (!outcome.ok) return outcome
  const { change } = outcome
  // (what was asked, without the stop it may end in: the line has its own)
  const what = change.what.replace(/[\s.,;:!?…]+$/, "")
  threads.noted(
    id,
    change.conversationId,
    way === "undo"
      ? `Undid “${what}”. ${REDO_KEY} puts it back.`
      : `Redid “${what}”.`
  )
  // the model may be somewhere else now, or nowhere; and if its manifest was not one of
  // the files, nothing has said that the rest of them changed
  projects.refresh(id)
  if (!change.files.some((file) => file.path === manifest)) projects.changed(id)
  broadcast()
  // the project's history has it too, as one more step: what was pushed stays as it was
  void backups.record(id, {
    what: `${way === "undo" ? "Undid" : "Redid"} “${change.what}”`,
    conversation: null,
    conversationId: whose(id) ?? null,
  })
  analytics?.record("change turned back", { way })
  return { ok: true, what: change.what }
}
const send = (channel: string, ...args: unknown[]) => {
  // what is held back of a conversation's items is told before anything else is
  if (channel !== CHANNEL.threadItem) pace.flush()
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}
/** The items of the conversations, as they come: a message being written at a steady pace. */
const pace = new Pace((projectId, conversationId, item) =>
  send(CHANNEL.threadItem, projectId, conversationId, item)
)
/**
 * How long what the conversations are doing waits before the window is told of it, ms:
 * a turn says something new many times a second, and the list it is told of is all the
 * projects, with every conversation of each.
 */
const SUMMARIES_MS = 150
let summing: NodeJS.Timeout | null = null
/** where the conversations stood as the window was last told of the projects */
let stood = ""
const broadcast = () => {
  if (summing) clearTimeout(summing)
  summing = null
  stood = threads.standing()
  send(CHANNEL.projectsChanged, list())
}
/**
 * Tell the window of the projects soon: at once where a conversation has begun or ended,
 * waits on the user, or has something new waiting to be said (see `standing`), and
 * otherwise once what the conversations are doing has settled for a moment.
 */
function broadcastSoon() {
  if (threads.standing() !== stood) return broadcast()
  summing ??= setTimeout(broadcast, SUMMARIES_MS)
}
const githubState = (): GitHubState => ({
  connection: connection.state,
  backingUp,
  failures: (backups?.failures() ?? []).flatMap(({ id, why, at }) => {
    const project = projects.listed(id)
    return project ? [{ projectId: id, name: project.name, why, at }] : []
  }),
})
const sendGitHub = () => send(CHANNEL.githubChanged, githubState())

/** The projects as backing them up has them. */
function backed() {
  return projects
    .list(() => [])
    .flatMap(({ id, name }) => {
      const project = projects.get(id)
      return project
        ? [
            {
              id,
              path: project.path,
              name,
              manifest: project.manifest,
              build: project.build,
              // (projects made before `made` was kept are known by a name of their own)
              made: project.made ?? project.name !== undefined,
              kept: project.kept === true,
            },
          ]
        : []
    })
}

// --- a project as each of its conversations has it ------------------------------------

/**
 * The conversation a project's folder is as only it has it, where each has the project
 * its own way: what can be taken back there is what that conversation's turns did.
 */
const whose = (id: string): string | undefined =>
  settings.get().versions ? (versions.on(id) ?? undefined) : undefined

/** How long after the last colour given by hand they go into the project's history, ms. */
const COLOURS_KEPT_AFTER = 4000
const colouring = new Map<string, NodeJS.Timeout>()

/**
 * Have the colours given a project's parts by hand go into its history, a moment after
 * the last of them: unless Claude is at work in it, or its folder is becoming another
 * conversation's, where the commit that comes of that takes them in with the rest.
 */
function keepColours(id: string) {
  clearTimeout(colouring.get(id))
  colouring.set(
    id,
    setTimeout(() => {
      colouring.delete(id)
      if (threads.working(id) || versions.busy(id)) return
      void backups.record(id, {
        what: "Recolored parts by hand",
        conversation: null,
        conversationId: whose(id) ?? null,
      })
    }, COLOURS_KEPT_AFTER)
  )
}

/**
 * Have a project's folder be one of its conversations': put as that one left it, where
 * each has the project its own way, and the view told to show the model as it then is.
 * Resolves to whether the folder is that conversation's alone. Rejects, in words to
 * show, where the folder could not be copied aside or put as that one left it: the
 * window is not told it was.
 */
async function turnTo(id: string, conversationId: string): Promise<boolean> {
  if (!projects.get(id)) return false
  const kept = settings.get().versions
  // What was asked to be committed of the folder as it is goes in first, on the branch
  // of the conversation it is now: it is that one's, and not the one's it is to be.
  if (kept && versions.on(id) !== conversationId) await backups.committed(id)
  const project = projects.get(id)
  if (!project) return false
  const turned = await versions.turnTo(id, conversationId, project.path, {
    kept,
    last: project.manifest && path.relative(project.path, project.manifest),
  })
  if (!turned || !kept || !projects.get(id)) return kept
  // what was done to the model by hand goes the way its files went
  send(CHANNEL.versionsTurned, id, turned)
  if (turned.restored) {
    // the model may be somewhere else now, or nowhere; and nothing has said that its
    // files changed, if its manifest is the same in both
    projects.refresh(id)
    projects.changed(id)
  } else broadcast()
  return kept
}

/**
 * The conversation each project's folder could not be made, the last time the window
 * showed it: it is not tried again by itself, to be said again at every turn of
 * anything, but once another is shown, or a message is sent in it.
 */
const unturned = new Map<string, string>()

/**
 * Have each project's folder be the conversation's that the window shows of it, where
 * it is not already: but not while Claude is at work there, or files are being made a
 * model of. It is seen to when that is over. Where it cannot be done, the conversation
 * says why.
 */
function follow() {
  // (turns stopped for the app to be quit end with nothing to be turned to)
  if (leaving !== null) return
  for (const [id, conversationId] of showing) {
    if (versions.on(id) === conversationId) continue
    if (unturned.get(id) === conversationId) continue
    if (threads.working(id) || builds.has(id)) continue
    if (!threads.has(id, conversationId)) {
      showing.delete(id)
      continue
    }
    void turnTo(id, conversationId).then(
      () => {
        if (unturned.get(id) === conversationId) unturned.delete(id)
      },
      (error: unknown) => {
        unturned.set(id, conversationId)
        threads.noted(
          id,
          conversationId,
          error instanceof Error ? error.message : String(error),
          "error"
        )
      }
    )
  }
}

// --- questions to the window about its viewport ---------------------------------------

let requests = 0
const waiting = new Map<
  number,
  {
    resolve: (data: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }
>()

function askViewport(
  projectId: string,
  asked: ViewportAsked
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!win || win.isDestroyed())
      return reject(new Error("The app window is closed."))
    // A tool just written may not have been noticed yet: the window is told of the
    // project's tools as they now are before it is asked about them.
    if (asked.kind === "tools" || asked.kind === "tool") {
      projects.refresh(projectId)
      broadcast()
    }
    const id = ++requests
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error("The viewport did not answer."))
    }, 15_000)
    waiting.set(id, { resolve, reject, timer })
    const request: ViewportRequest = { id, projectId, ...asked }
    send(CHANNEL.viewportRequest, request)
  })
}

// --- the window -----------------------------------------------------------------------

/** How often the projects are looked at again as the window is gone back to, at most, ms. */
const LOOK_AGAIN_MS = 2000
let lookedAgain = 0
/** the projects still to be looked at again, after the window was last gone back to */
let behind: string[] = []
/** of those looked at so far, whether any was not as it was */
let behindChanged = false

/**
 * Look at the projects again, as the window is gone back to: for each one's folder,
 * which may have gone or come back meanwhile, and at once into those the window has
 * shown, for their models. The rest are looked into after, one at a time, in the app's
 * own time, and the window is told of them again if any of that changed.
 */
function lookAgain() {
  const now = Date.now()
  if (now - lookedAgain < LOOK_AGAIN_MS) return
  lookedAgain = now
  projects.lookForFolders()
  for (const id of showing.keys()) projects.refresh(id)
  broadcast()
  const already = behind.length > 0
  behind = projects.ids().filter((id) => !showing.has(id))
  if (!already) setTimeout(lookBehind)
}

function lookBehind() {
  const id = behind.shift()
  if (id === undefined) return
  if (projects.refresh(id)) behindChanged = true
  if (behind.length > 0) return void setTimeout(lookBehind)
  if (behindChanged) broadcast()
  behindChanged = false
}

function createWindow(openProject: string | null) {
  win = new BrowserWindow({
    width: 1512,
    height: 982,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#171717",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    // Elsewhere the menu a Mac keeps at the top of the screen is a bar across the top of
    // the window, in the system's colours: kept out of sight, with its shortcuts still
    // working, and shown while Alt is held.
    autoHideMenuBar: process.platform !== "darwin",
    // what a taskbar shows for the window; a Mac shows the app's own icon, in its Dock
    icon: path.join(
      ICONS,
      process.platform === "win32" ? "icon.ico" : "icon-512.png"
    ),
    webPreferences: {
      preload: path.join(HERE, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // a hidden window still has to draw for --capture
      backgroundThrottling: !CAPTURE,
    },
  })
  const window = win
  if (!CAPTURE) window.once("ready-to-show", () => window.show())
  window.on("closed", () => {
    if (win === window) win = null
  })
  // Elsewhere than on a Mac, closing the window quits the app: what that would stop is
  // asked about first, with the window still there to go back to.
  window.on("close", (event) => {
    if (process.platform === "darwin" || leaving === "now") return
    if (busyCount() === 0) return
    event.preventDefault()
    app.quit()
  })
  // branches get switched and models rebuilt while the app is in the background
  window.on("focus", lookAgain)

  // links in Claude's answers open in the browser; the window itself never navigates away
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL()) return
    event.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  const hash = openProject ? `#project=${openProject}` : ""
  if (DEV_URL) void window.loadURL(DEV_URL + hash)
  else
    void window.loadFile(path.join(HERE, "../dist/index.html"), {
      hash: hash.slice(1),
    })

  if (CAPTURE) void capture(window, CAPTURE)
}

/**
 * Say, once the window is up, what of what the app keeps could not be read as it was
 * opened, and was moved aside rather than written over: one line for each such file.
 */
function unreadable(...said: (string | null | false)[]) {
  const lines = said.filter((line): line is string => Boolean(line))
  const window = win
  if (lines.length === 0 || !window || CAPTURE) return
  window.once("ready-to-show", () => {
    if (window.isDestroyed()) return
    void dialog.showMessageBox(window, {
      type: "warning",
      message: "Some of what Enclose keeps could not be read",
      detail: lines.join("\n\n"),
      buttons: ["OK"],
    })
  })
}

async function capture(window: BrowserWindow, file: string) {
  const wait = Number(flag("wait") ?? 2000)
  const settle = () => new Promise((resolve) => setTimeout(resolve, wait))
  try {
    await new Promise<void>((resolve) =>
      window.webContents.once("did-finish-load", () => resolve())
    )
    await settle()
    const script = flag("script")
    if (script) {
      const result: unknown = await window.webContents.executeJavaScript(
        fs.readFileSync(script, "utf8"),
        true
      )
      console.log(`[script] ${JSON.stringify(result)}`)
      await settle()
    }
    fs.writeFileSync(file, (await window.webContents.capturePage()).toPNG())
  } catch (error) {
    console.error("[capture]", error)
    process.exitCode = 1
  }
  app.quit()
}

/**
 * Make the folder for a new project, where new projects go, and say what the project is
 * called for now: a stand-in, until what is made in it gives it a name. The folder is
 * named to match (see `folderName`), numbered if the same name comes up twice in a
 * minute.
 */
function newFolder(): { dir: string; name: string } {
  const name = standInName()
  const base = folderName(name, new Date())
  return { dir: makeFolder(settings.get().projectsFolder, base), name }
}

/**
 * What of a project's folder a project begun from it does not have: its history, which
 * the new one keeps for itself, and the Pythons made in it, which work only where they
 * were made.
 */
const NOT_COPIED = new Set([...LEFT_BEHIND, ".git", ".venv", "venv"])

/**
 * Make a new project, as one is made from the welcome screen: a folder where new projects
 * go, under a stand-in name until what is made in it gives it one, with its history kept
 * from the start. It is empty, or begun with a copy of another project's files (`from`),
 * its model with them: made, where that has none built. Returns its id.
 */
function startProject(
  from: { path: string; name: string } | null,
  how: "new" | "conversation"
): string {
  let made: { dir: string; name: string }
  if (from) {
    const name = standInName()
    const { projectsFolder } = settings.get()
    made = {
      dir: startFrom(
        from.path,
        name,
        projectsFolder,
        KIT,
        new Date(),
        NOT_COPIED
      ),
      name,
    }
  } else made = newFolder()
  const id = projects.add(made.dir, { name: made.name, standIn: true })
  void backups.prepare(
    id,
    from ? `Started from ${from.name}` : "Started in Enclose"
  )
  analytics?.record("project added", {
    from: how,
    ...(how === "conversation" && { copy: from !== null }),
  })
  if (from && !projects.get(id)?.manifest) makeModel(id)
  return id
}

/**
 * A project's folder was renamed: what Claude Code keeps of it, in its home wherever the
 * user has that, follows it there.
 */
function followFolder(from: string, to: string) {
  followRename(
    from,
    to,
    expandHome(settings.provider("claude").home) || undefined
  )
}

// --- opening what was made elsewhere --------------------------------------------------

/** what stops the build of each project whose files are being made a model of */
const builds = new Map<string, () => void>()
/** the projects whose files wait for the app to make a Python to read them with */
const forPython = new Set<string>()

/** Say in the list how the Python the files wait for is coming on. */
function settingUp() {
  const status = python.get()
  if (status.state !== "making") return
  for (const id of forPython)
    projects.report(id, {
      state: "working",
      done: 0,
      total: null,
      settingUp: status.step,
    })
}

/** Make a model of the files brought into a project, and say in the list how it goes. */
function makeModel(id: string) {
  const project = projects.get(id)
  const command = project?.build
  if (!project || !command) return
  projects.report(id, { state: "working", done: 0, total: null })
  // Python is found on the PATH a terminal would have, which a Mac gives an app no part
  // of: looking for the agents is what takes that PATH up
  void providers.found.then(async () => {
    forPython.add(id)
    settingUp()
    const ready = await python.ready()
    forPython.delete(id)
    // taken off the list while that was waited for
    if (!projects.get(id)) return
    if (!ready) {
      const status = python.get()
      projects.report(id, {
        state: "failed",
        why: "python",
        detail:
          status.state === "failed"
            ? status.detail
            : "No Python with build123d was found.",
      })
      return
    }
    const build = runBuild(project.path, command, cleanEnv(), (done, total) =>
      projects.report(id, { state: "working", done, total })
    )
    builds.set(id, build.stop)
    void build.finished.then((failed) => {
      // stopped, with the project taken off the list: there is nobody to tell
      if (builds.get(id) !== build.stop) return
      builds.delete(id)
      projects.report(id, failed)
      follow()
      // there is a model of it now, and so a repository to be made for it, where GitHub is
      // connected (what the build wrote is no part of the history)
      if (!failed)
        void backups.record(id, {
          what: "Built the model",
          conversation: null,
          conversationId: whose(id) ?? null,
        })
    })
  })
}

/**
 * Open folders and CAD files, however they were given: picked, dropped on the window, or
 * named on the command line. Returns the project to turn to (the last that came of it),
 * and what was given that could not be opened.
 */
function open(paths: string[]): { id: string | null; refused: string[] } {
  const opened = sortOpened(
    paths.map((given) => path.resolve(given)),
    (dir) => projects.knows(dir)
  )
  let id: string | null = null
  for (const dir of opened.folders) {
    const known = projects.knows(dir)
    if (!known) analytics?.record("project added", { from: "folder" })
    id = projects.add(dir)
    // its history kept from now on, unless it is a repository of somebody's own already
    if (!known) void backups.prepare(id, "Opened in Enclose")
  }
  for (const bundle of opened.bundles) {
    const { projectsFolder, lookOver } = settings.get()
    const { dir, written } = bringIn(bundle, projectsFolder, KIT)
    analytics?.record("project added", {
      from: "files",
      files: bundle.files.length,
    })
    id = projects.add(dir, {
      name: bundle.name,
      reading: true,
      ...(lookOver ? { lookOver: written } : {}),
    })
    void backups.prepare(
      id,
      `Brought in ${bundle.files.map((file) => path.basename(file.as)).join(", ")}`
    )
    makeModel(id)
  }
  return { id, refused: opened.refused }
}

/** A model's parts as its manifest has them, each with what its group is called. */
function partsOf(manifest: string) {
  const { parts, groups } = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
    parts: { id: string; label?: string; group?: string }[]
    groups?: { id: string; label?: string }[]
  }
  return parts.map((part) => ({
    id: part.id,
    label: part.label ?? part.id,
    group:
      groups?.find((group) => group.id === part.group)?.label ??
      part.group ??
      "Parts",
  }))
}

/** A group to be named, as the window gave it: null if it is nothing that can be. */
function groupFrom(given: unknown): GroupAsked | null {
  const { title, parts, others } = (given ?? {}) as Partial<
    Record<keyof GroupAsked, unknown>
  >
  if (!Array.isArray(parts)) return null
  const named = parts.flatMap(
    (part: Partial<GroupAsked["parts"][number]> | null) =>
      typeof part?.label === "string"
        ? [
            {
              label: part.label,
              from: typeof part.from === "string" ? part.from : null,
            },
          ]
        : []
  )
  if (named.length === 0) return null
  return {
    title: typeof title === "string" ? title : null,
    parts: named,
    others: (Array.isArray(others) ? others : []).filter(
      (other): other is string => typeof other === "string"
    ),
  }
}

/** What the window gave of a model to be looked over, as far as it is what it should be. */
function seenFrom(given: unknown): Seen {
  const { pictures, parts } = (given ?? {}) as Partial<
    Record<keyof Seen, unknown>
  >
  const three = (v: unknown): Vec3 =>
    Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n))
      ? (v as Vec3)
      : [0, 0, 0]
  return {
    pictures: (Array.isArray(pictures) ? pictures : []).flatMap(
      (picture: Partial<Seen["pictures"][number]> | null) =>
        typeof picture?.data === "string" &&
        typeof picture.mimeType === "string"
          ? [
              {
                caption: String(picture.caption ?? ""),
                data: picture.data,
                mimeType: picture.mimeType,
              },
            ]
          : []
    ),
    parts: (Array.isArray(parts) ? parts : []).flatMap(
      (part: Partial<Seen["parts"][number]> | null) =>
        typeof part?.id === "string"
          ? [
              {
                id: part.id,
                label: String(part.label ?? part.id),
                group: String(part.group ?? ""),
                size: three(part.size),
                middle: three(part.middle),
                color: typeof part.color === "string" ? part.color : null,
              },
            ]
          : []
    ),
  }
}

/**
 * Have Claude look over the model of files just opened, from what the window shows of
 * it. What it makes of the parts is written into the project's model.py, which until
 * then is as the app wrote it, and the model is built again. Returns the conversation
 * that is had in, or null if the project is not waiting for this.
 */
function lookOver(id: string, seen: Seen, manner: Manner): string | null {
  const project = projects.get(id)
  const written = project?.lookOver
  // (with nothing to ask of the agent it is to be asked of, it waits until there is)
  if (!project || !written || !providers.launch(manner.provider)) return null
  try {
    const { build, manifest } = project
    if (!manifest || !build) return null
    const script = path.join(project.path, SCRIPT)
    // the parts as the files gave them: what Claude names them by, however often
    const read = partsOf(manifest)
    // the script as the app last wrote it: nothing but that is written over
    let ours = modelScript(written.title, written.files)
    // and what the project was last called from here: after the files, to begin with
    let named = written.title
    const arranging: Arranging = async (given, signal) => {
      const arranged = arrange(
        read,
        given,
        SCENES.map((scene) => scene.id)
      )
      if (fs.readFileSync(script, "utf8") !== ours)
        throw new Error(
          `The project's ${SCRIPT} has been changed since the files were opened, so it is not written over. Tell the user the names and groups you would give the parts, and that they can ask you to put them in.`
        )
      // What the project is to be called is the model's title too. It takes the place of
      // the name the project has from here, and of no other: one the user has given it
      // meanwhile stands.
      const called = projects.get(id)?.name
      const title =
        called !== undefined && called !== named
          ? called
          : (arranged.name ?? named)
      const next = modelScript(title, written.files, arranged)
      fs.writeFileSync(script, next)
      const building = runBuild(project.path, build, cleanEnv(), () => {})
      signal.addEventListener("abort", building.stop, { once: true })
      const failed = await building.finished
      signal.removeEventListener("abort", building.stop)
      if (failed || signal.aborted) {
        // back as it was: the model on screen is still the one that script builds
        fs.writeFileSync(script, ours)
        throw new Error(
          failed?.state === "failed" && !signal.aborted
            ? `The model would not build with these names: ${failed.detail}`
            : "Stopped."
        )
      }
      ours = next
      // (the project alone is renamed: its folder is left as it is called)
      named = title
      projects.rename(id, title)
      void backups.renamed(id)
      projects.refresh(id)
      broadcast()
      return `Done: ${arranged.parts.length} parts in ${arranged.groups.length} groups (${arranged.groups.map((group) => group.label).join(", ")}).${title === called ? "" : ` The project is called "${title}" now.`} The view shows the model so.`
    }
    const into = threads.lookOver(id, seen, written.files, manner, arranging)
    if (into) analytics?.record("model looked over", mannerSaid(manner))
    return into
  } catch (error) {
    console.error("[look over]", error)
    return null
  } finally {
    // asked once, whatever came of it: from here on the model is put in order by
    // asking. (Said last, so that the project goes from waiting to being looked over
    // with nothing in between.)
    projects.lookedOver(id)
  }
}

/**
 * How the view draws a project's parts, as the window gave it: what of that reads as a
 * colour by name.
 */
function looksFrom(given: unknown): Looks {
  const colours = (given as Partial<Looks> | null)?.colours
  return {
    colours: Object.fromEntries(
      Object.entries(
        colours && typeof colours === "object"
          ? (colours as Record<string, unknown>)
          : {}
      ).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && /^[a-z]{1,20}$/.test(entry[1])
      )
    ),
  }
}

/** A project's guide, by what it is known by, with its model's manifest: null if there is neither. */
function guideFor(id: unknown, guideId: unknown) {
  const project = projects.get(String(id))
  if (!project?.manifest) return null
  const guide = guideOf(project.path, String(guideId))
  if (!guide) return null
  return { project, guide, manifest: project.manifest }
}

/** The whole objects a message calls on, as the window gave them: those that read as one. */
const objectsFrom = (given: unknown): ObjectRef[] =>
  (Array.isArray(given) ? given : []).flatMap(
    (one: Partial<ObjectRef> | null) =>
      typeof one?.label === "string" && Array.isArray(one.parts)
        ? [
            {
              label: one.label,
              parts: one.parts.filter((id) => typeof id === "string"),
            },
          ]
        : []
  )

/** The most words picked out of a conversation that go with one message, and of any one. */
const MOST_QUOTES = 24
const MOST_QUOTED = 4000

/**
 * The words picked out of the conversation that go with a message, as the window gave
 * them, with what is said of each: those that read as that.
 */
const quotesFrom = (given: unknown): Quote[] =>
  (Array.isArray(given) ? given : [])
    .flatMap((one: Partial<Quote> | null) => {
      const quote = typeof one?.quote === "string" ? one.quote.trim() : ""
      return quote
        ? [
            {
              quote: quote.slice(0, MOST_QUOTED),
              text:
                typeof one?.text === "string"
                  ? one.text.trim().slice(0, MOST_QUOTED)
                  : "",
            },
          ]
        : []
    })
    .slice(0, MOST_QUOTES)

const mannerFrom = (manner: Partial<Manner> | null): Manner => ({
  provider: PROVIDERS.find((one) => one === manner?.provider) ?? "claude",
  model: typeof manner?.model === "string" ? manner.model : null,
  effort: EFFORTS.find((effort) => effort === manner?.effort) ?? null,
  // what cannot be made out is not taken for leave to do anything
  access: ACCESSES.find((access) => access === manner?.access) ?? "edits",
})

/**
 * A model the window says an agent is to run, as it is taken: a name of a few words, or
 * nothing, which leaves it to the agent.
 */
const modelFrom = (model: unknown): string | null =>
  typeof model === "string" && /^[\w.:/@+-]{1,120}$/.test(model) ? model : null

/**
 * How a message is to be answered, as the app's count of its use has it. A model the
 * user wrote in themselves, or has from their own config, is called whatever they called
 * it, which is theirs: it is counted as one of those, and not by name (see modelSaid).
 */
const mannerSaid = ({ provider, model, effort, access }: Manner) => ({
  provider,
  model: modelSaid(provider, model, settings.provider(provider).custom),
  effort: effort ?? "default",
  access,
})

/** How long something took, in minutes to the tenth, as events say it. */
const minutesOf = (ms: number | null) =>
  ms === null ? null : Math.round(ms / 6_000) / 10

/** `open`, for the window: it is told when nothing came of what it gave. */
async function openFor(paths: string[]): Promise<Project | null> {
  let id: string | null = null
  let trouble: string | null = null
  try {
    const { id: last, refused } = open(paths)
    id = last
    if (!id && refused.length > 0)
      trouble = `Enclose opens folders, and CAD files: STEP, STL and OBJ (${CAD_ENDINGS.join(", ")}). ${
        refused.length === 1
          ? `“${path.basename(refused[0])}” is neither.`
          : "What was given is neither."
      }`
  } catch (error) {
    trouble = `The files could not be copied into a new project: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  if (trouble && win && !CAPTURE)
    await dialog.showMessageBox(win, {
      type: "info",
      message: "Nothing was opened",
      detail: trouble,
    })
  return list().find((p) => p.id === id) ?? null
}

// --- wiring ---------------------------------------------------------------------------

function wire() {
  protocol.handle(MODEL_SCHEME, async (request) => {
    const url = new URL(request.url)
    const from = servedFrom(url.hostname)
    const file = from && resolveInside(from, decodeURIComponent(url.pathname))
    if (!file) return new Response(null, { status: 404 })
    return serveFile(
      file,
      request,
      MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"
    )
  })

  ipcMain.handle(CHANNEL.projectsList, () => list())
  ipcMain.handle(CHANNEL.projectsAdd, async (_, kind: unknown) => {
    if (!win) return null
    // A Mac's picker takes files and folders alike. No other system's does: there it
    // is asked for the one kind or the other.
    const picked = await dialog.showOpenDialog(win, {
      title:
        kind === "file"
          ? "Open a file"
          : kind === "folder"
            ? "Open a folder"
            : "Open a file or folder",
      buttonLabel: "Open",
      filters:
        kind === "folder"
          ? []
          : [
              {
                name: "CAD files",
                extensions: CAD_ENDINGS.map((ending) => ending.slice(1)),
              },
            ],
      properties:
        kind === "file"
          ? ["openFile", "multiSelections"]
          : kind === "folder"
            ? ["openDirectory", "createDirectory"]
            : [
                "openFile",
                "openDirectory",
                "multiSelections",
                "createDirectory",
              ],
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    return openFor(picked.filePaths)
  })
  ipcMain.handle(CHANNEL.projectsOpen, (_, paths: unknown) =>
    openFor(Array.isArray(paths) ? paths.map(String) : [])
  )
  ipcMain.handle(CHANNEL.projectsCreate, () => {
    const id = startProject(null, "new")
    return list().find((p) => p.id === id) ?? null
  })
  ipcMain.handle(CHANNEL.projectsExample, async (_, wanted: unknown) => {
    const example = EXAMPLES.find((one) => one.id === wanted)
    if (!example) return null
    let id: string | null = null
    let fetching = false
    try {
      let from: string | Filed[] = path.join(EXAMPLES_HERE, example.id)
      if (EXAMPLES_FROM || !fs.existsSync(from)) {
        fetching = true
        from = await unpack(
          await fetched(
            (EXAMPLES_FROM ?? EXAMPLES_URL) + archiveOf(example),
            example,
            (received) =>
              send(CHANNEL.projectsExampleProgress, example.id, received),
            (url, init) => net.fetch(String(url), init)
          )
        )
        fetching = false
      }
      const { projectsFolder } = settings.get()
      const dir = startFrom(from, example.name, projectsFolder, KIT)
      id = projects.add(dir, { name: example.name })
      void backups.prepare(id, `Started from the ${example.name} example`)
      analytics?.record("project added", {
        from: "example",
        example: example.id,
      })
      if (!projects.get(id)?.manifest) makeModel(id)
    } catch (error) {
      console.error("[example]", error)
      if (win && !CAPTURE)
        await dialog.showMessageBox(win, {
          type: "info",
          message: fetching
            ? "The example could not be downloaded"
            : "The example could not be opened",
          detail: fetching
            ? "Check your connection and try again."
            : error instanceof Error
              ? error.message
              : String(error),
        })
    }
    return list().find((p) => p.id === id) ?? null
  })
  ipcMain.handle(CHANNEL.projectsRemove, async (_, id: string) => {
    // (one whose folder is not there can be taken off the list as well)
    const project = projects.listed(String(id))
    if (!project) return
    // What has been said about it goes with it, and cannot be had back: that is asked
    // about first. (A run with nobody at it has nobody to ask.)
    const said = threads.count(project.id)
    if (said > 0 && win && !CAPTURE) {
      const { name } = project
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message: `Remove “${name}” from Enclose?`,
        detail: `${
          said === 1 ? "Its conversation" : `Its ${said} conversations`
        } will be forgotten. The folder stays where it is, with everything in it.`,
        buttons: ["Remove", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      })
      if (response !== 0) return
    }
    threads.forget(project.id)
    changes.forget(project.id)
    showing.delete(project.id)
    unturned.delete(project.id)
    versions.forget(project.id)
    pictures.forget(project.id)
    inspiration.forget(project.id)
    builds.get(project.id)?.()
    builds.delete(project.id)
    projects.remove(project.id)
    analytics?.record("project removed")
  })
  ipcMain.handle(CHANNEL.projectsPin, (_, id: string, pinned: boolean) =>
    projects.pin(String(id), pinned === true)
  )
  ipcMain.handle(CHANNEL.projectsRename, (_, id: string, name: string) => {
    // a folder still named after its stand-in takes the name too, unless something is
    // at work in it
    const idle = !(
      threads.working(String(id)) ||
      builds.has(String(id)) ||
      versions.busy(String(id))
    )
    projects.rename(String(id), String(name), idle ? followFolder : undefined)
    void backups.renamed(String(id))
  })
  ipcMain.handle(
    CHANNEL.projectsTrustSettings,
    (_, id: string, trusted: unknown) =>
      projects.trust(String(id), trusted === true)
  )
  ipcMain.handle(CHANNEL.githubGet, () => githubState())
  ipcMain.handle(CHANNEL.githubConnect, () => {
    // (heard of as it goes: the window is not kept waiting on the user's typing)
    void connection.connect()
  })
  ipcMain.handle(CHANNEL.githubOpenCode, () => connection.openCode())
  ipcMain.handle(CHANNEL.githubOpenInstall, () => connection.openInstall())
  ipcMain.handle(CHANNEL.githubCancel, () => connection.cancel())
  ipcMain.handle(CHANNEL.githubDisconnect, () => {
    connection.disconnect()
    analytics?.record("github disconnected")
  })
  ipcMain.handle(CHANNEL.projectsReveal, (_, id: string) => {
    const project = projects.get(id)
    if (project) void shell.openPath(project.path)
  })

  ipcMain.handle(CHANNEL.modelRead, (_, id: string): ModelSource | null => {
    // while an agent is at work, the model as it has it written so far, where that is
    // newer than what it last built
    const draft = drafts.shown(id)
    const manifest = draft ?? projects.get(id)?.manifest
    if (!manifest) return null
    return {
      manifest: JSON.parse(fs.readFileSync(manifest, "utf8")),
      baseUrl: draft
        ? `${MODEL_SCHEME}://${id}.${DRAFT_HOST}/`
        : `${MODEL_SCHEME}://${id}/`,
    }
  })
  ipcMain.handle(
    CHANNEL.modelSaveCopy,
    async (_, id: string, file: string, name: string) => {
      const manifest = projects.get(id)?.manifest
      const source =
        manifest && resolveInside(path.dirname(manifest), String(file))
      if (!win || !source || !fs.existsSync(source)) return false
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(path.basename(String(name))),
      })
      if (picked.canceled || !picked.filePath) return false
      await fs.promises.copyFile(source, picked.filePath)
      saving.savedIn(path.dirname(picked.filePath))
      analytics?.record("model saved", { as: "files", files: 1 })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelNameGroup,
    async (_, id: string, asked: unknown): Promise<string | null> => {
      if (!projects.get(String(id))) return null
      const group = groupFrom(asked)
      if (!group) return null
      // it is the quickest of Claude Code's models that is asked
      await providers.found
      return groupNameOf(providers.launch("claude"), group)
    }
  )
  ipcMain.handle(
    CHANNEL.referenceScenes,
    (_, id: string): ReferenceSource[] => {
      const project = projects.get(String(id))
      const own = project?.reference ? readScene(project.reference) : null
      return [
        ...(project && own
          ? [
              {
                id: OWN_SCENE,
                own: true,
                manifest: own,
                baseUrl: `${MODEL_SCHEME}://${project.id}.${SCENE_HOST.own}/`,
              },
            ]
          : []),
        ...SCENES.map((scene) => ({
          id: scene.id,
          own: false,
          manifest: scene.manifest,
          baseUrl: `${MODEL_SCHEME}://${scene.id}.${SCENE_HOST.app}/`,
        })),
      ]
    }
  )
  ipcMain.handle(CHANNEL.toolsRead, (_, id: string): ToolSource[] => {
    const project = projects.get(String(id))
    return project ? readTools(project.path) : []
  })
  ipcMain.handle(CHANNEL.boardsRead, (_, id: string): BoardSummary[] => {
    const project = projects.get(String(id))
    return project ? boardsIn(project.path) : []
  })
  ipcMain.handle(
    CHANNEL.boardsSave,
    async (_, id: string, boardId: string, what: string, name: string) => {
      const project = projects.get(String(id))
      const board =
        project && boardsIn(project.path).find((one) => one.id === boardId)
      if (!win || !project || !board || (what !== "gerbers" && what !== "step"))
        return false
      const source = path.join(
        project.path,
        BOARD_FOLDER,
        builtOf(board.id)[what]
      )
      if (!fs.existsSync(source)) return false
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(path.basename(String(name))),
      })
      if (picked.canceled || !picked.filePath) return false
      await fs.promises.copyFile(source, picked.filePath)
      saving.savedIn(path.dirname(picked.filePath))
      analytics?.record("board saved", { as: what })
      return true
    }
  )
  const jlcpcbPart = jlcpcbParts()
  ipcMain.handle(CHANNEL.boardsPart, (_, number: string) =>
    jlcpcbPart(String(number))
  )
  ipcMain.handle(CHANNEL.assemblyRead, (_, id: string): GuideSummary[] => {
    const project = projects.get(String(id))
    return project ? guidesIn(project.path) : []
  })
  ipcMain.handle(
    CHANNEL.assemblyMake,
    (
      _,
      id: string,
      conversationId: string | null,
      of: unknown,
      given: Partial<Manner> | null
    ) => {
      const project = projects.get(String(id))
      if (!project?.manifest) return null
      const manner = mannerFrom(given)
      const [thing] = objectsFrom(of ? [of] : [])
      const into = threads.assemble(
        project.id,
        conversationId === null ? null : String(conversationId),
        thing && thing.parts.length > 0 ? thing : null,
        manner
      )
      if (into) projects.lookedOver(project.id)
      if (into)
        analytics?.record("assembly guide asked for", {
          ...mannerSaid(manner),
          whole: thing === undefined,
        })
      return into
    }
  )
  ipcMain.handle(
    CHANNEL.assemblyOpen,
    async (_, id: string, guideId: string, looks: unknown) => {
      if (!guideFor(id, guideId)) return false
      const address = await guideServer.address(
        String(id),
        String(guideId),
        looksFrom(looks)
      )
      // (a run with nobody at it has no browser to open one in: it says where it is)
      if (CAPTURE) console.log(`[guide] ${address}`)
      else await shell.openExternal(address)
      analytics?.record("assembly guide opened")
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.assemblySave,
    async (_, id: string, guideId: string, looks: unknown) => {
      const found = guideFor(id, guideId)
      if (!win || !found) return false
      const { guide, manifest } = found
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(`${archiveName(guide)}.zip`),
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      })
      if (picked.canceled || !picked.filePath) return false
      // The parts are read from where the model's build left them, and go nowhere but
      // into the archive: nothing of a guide is copied until it is taken away.
      const files = await archived(
        guide,
        JSON.parse(await fs.promises.readFile(manifest, "utf8")),
        path.dirname(manifest),
        looksFrom(looks),
        path.join(HERE, "guide")
      )
      await fs.promises.writeFile(picked.filePath, zipOf(files))
      saving.savedIn(path.dirname(picked.filePath))
      // shown where it is: it is something to send on, or to open
      shell.showItemInFolder(picked.filePath)
      analytics?.record("assembly guide saved", { steps: guide.steps.length })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.assemblyRemove,
    async (_, id: string, guideId: string) => {
      const project = projects.get(String(id))
      // one thing at a time is done in a project's folder: not under an agent at work
      if (!project || threads.working(project.id)) return false
      // (to the system's bin, and not for good: it is the user's, and can be had back)
      const went = await removeGuide(project.path, String(guideId), (file) =>
        shell.trashItem(file)
      ).catch(() => false)
      if (!went) return false
      projects.refresh(project.id)
      broadcast()
      analytics?.record("assembly guide removed")
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelSaveCopies,
    async (_, id: string, files: unknown, folder: string) => {
      const manifest = projects.get(id)?.manifest
      if (!win || !manifest || !Array.isArray(files)) return false
      const from = path.dirname(manifest)
      const wanted = (files as { file?: unknown; name?: unknown }[]).flatMap(
        (entry) => {
          const source = resolveInside(from, String(entry?.file))
          return source && fs.existsSync(source)
            ? [{ source, name: path.basename(String(entry?.name)) }]
            : []
        }
      )
      if (wanted.length === 0) return false
      const called =
        String(folder)
          .replace(/[\\/:]+/g, "-")
          .replace(/^\.+/, "")
          .trim() || "parts"
      const picked = await dialog.showOpenDialog(win, {
        message: `Choose where the folder "${called}" goes, with its ${wanted.length} STEP files`,
        buttonLabel: "Save here",
        defaultPath: saving.folder(),
        properties: ["openDirectory", "createDirectory"],
      })
      if (picked.canceled || !picked.filePaths[0]) return false
      // a folder of its own, numbered where the name is taken: nothing is written over
      const into = makeFolder(picked.filePaths[0], called)
      for (const { source, name } of wanted)
        await fs.promises.copyFile(source, path.join(into, name))
      saving.savedIn(picked.filePaths[0])
      analytics?.record("model saved", { as: "files", files: wanted.length })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelSaveArchive,
    async (_, id: string, files: unknown, name: unknown) => {
      const manifest = projects.get(id)?.manifest
      if (!win || !manifest || !Array.isArray(files)) return false
      const from = path.dirname(manifest)
      const wanted = (files as { file?: unknown; name?: unknown }[]).flatMap(
        (entry) => {
          const source = resolveInside(from, String(entry?.file))
          return source && fs.existsSync(source)
            ? [{ source, name: path.basename(String(entry?.name)) }]
            : []
        }
      )
      if (wanted.length === 0) return false
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(path.basename(String(name))),
      })
      if (picked.canceled || !picked.filePath) return false
      const archive = zipOf(
        await Promise.all(
          wanted.map(async ({ source, name }) => ({
            name,
            data: await fs.promises.readFile(source),
          }))
        )
      )
      await fs.promises.writeFile(picked.filePath, archive)
      saving.savedIn(path.dirname(picked.filePath))
      analytics?.record("model saved", { as: "files", files: wanted.length })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelSaveMeshes,
    async (
      _,
      id: string,
      format: unknown,
      sets: unknown,
      how: unknown,
      called: unknown
    ) => {
      const manifest = projects.get(id)?.manifest
      if (
        !win ||
        !manifest ||
        !MESH_FORMATS.includes(format as MeshFormat) ||
        !Array.isArray(sets) ||
        (how !== "file" && how !== "folder" && how !== "zip")
      )
        return false
      const from = path.dirname(manifest)
      const { parts } = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
        parts: { id: string; label?: string; file: string; matrix?: unknown }[]
      }
      const wanted = (sets as { name?: unknown; parts?: unknown }[]).flatMap(
        (set) => {
          const ids = Array.isArray(set?.parts) ? set.parts : []
          const of = parts.filter((part) => ids.includes(part.id))
          return of.length > 0
            ? [{ name: path.basename(String(set?.name)), parts: of }]
            : []
        }
      )
      if (wanted.length === 0 || (how === "file" && wanted.length > 1))
        return false
      const name = path.basename(String(called))
      let into: string
      if (how === "folder") {
        const picked = await dialog.showOpenDialog(win, {
          message: `Choose where the folder "${name}" goes, with its ${wanted.length} ${String(format).toUpperCase()} files`,
          buttonLabel: "Save here",
          defaultPath: saving.folder(),
          properties: ["openDirectory", "createDirectory"],
        })
        if (picked.canceled || !picked.filePaths[0]) return false
        into = picked.filePaths[0]
      } else {
        const picked = await dialog.showSaveDialog(win, {
          defaultPath: saving.offer(name),
        })
        if (picked.canceled || !picked.filePath) return false
        into = picked.filePath
      }
      const read = new Map<string, Float32Array>()
      const triangles = async (part: (typeof parts)[number]) => {
        let found = read.get(part.id)
        if (!found) {
          const source = resolveInside(from, part.file)
          if (!source)
            throw new Error(`"${part.file}" is not in the model's folder`)
          const matrix = Array.isArray(part.matrix)
            ? (part.matrix as number[])
            : null
          found = trianglesOf(await fs.promises.readFile(source), matrix)
          read.set(part.id, found)
        }
        return found
      }
      const files = []
      for (const set of wanted)
        files.push({
          name: set.name,
          data: meshFile(
            format as MeshFormat,
            await Promise.all(
              set.parts.map(async (part) => ({
                label: part.label ?? part.id,
                triangles: await triangles(part),
              }))
            )
          ),
        })
      if (how === "file") await fs.promises.writeFile(into, files[0].data)
      else if (how === "zip") await fs.promises.writeFile(into, zipOf(files))
      else {
        const folder = makeFolder(into, name.replace(/^\.+/, "") || "parts")
        for (const file of files)
          await fs.promises.writeFile(path.join(folder, file.name), file.data)
      }
      saving.savedIn(how === "folder" ? into : path.dirname(into))
      analytics?.record("model saved", {
        as: "files",
        format: String(format),
        files: files.length,
      })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelSaveDrawing,
    async (_, name: unknown, svg: unknown) => {
      if (!win || typeof svg !== "string") return false
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(path.basename(String(name))),
        filters: [{ name: "SVG", extensions: ["svg"] }],
      })
      if (picked.canceled || !picked.filePath) return false
      await fs.promises.writeFile(picked.filePath, svg, "utf8")
      saving.savedIn(path.dirname(picked.filePath))
      analytics?.record("model saved", { as: "drawings", files: 1 })
      return true
    }
  )
  ipcMain.handle(
    CHANNEL.modelSaveDrawings,
    async (_, folder: unknown, drawings: unknown) => {
      if (!win || !Array.isArray(drawings)) return false
      const wanted = (drawings as { name?: unknown; svg?: unknown }[]).flatMap(
        (entry) =>
          typeof entry?.svg === "string"
            ? [{ name: path.basename(String(entry.name)), svg: entry.svg }]
            : []
      )
      if (wanted.length === 0) return false
      const called =
        String(folder)
          .replace(/[\\/:]+/g, "-")
          .replace(/^\.+/, "")
          .trim() || "blueprint"
      const picked = await dialog.showOpenDialog(win, {
        message: `Choose where the folder "${called}" goes, with its ${wanted.length} SVG files`,
        buttonLabel: "Save here",
        defaultPath: saving.folder(),
        properties: ["openDirectory", "createDirectory"],
      })
      if (picked.canceled || !picked.filePaths[0]) return false
      const into = makeFolder(picked.filePaths[0], called)
      for (const { name, svg } of wanted)
        await fs.promises.writeFile(path.join(into, name), svg, "utf8")
      saving.savedIn(picked.filePaths[0])
      // the folder is opened, to show what was saved and where: it was made inside the
      // one that was picked, which is not where anyone goes looking for it
      void shell.openPath(into)
      analytics?.record("model saved", {
        as: "drawings",
        files: wanted.length,
      })
      return true
    }
  )

  ipcMain.handle(
    CHANNEL.inspirationRead,
    (_, id: string, codexModel: unknown) =>
      inspiration.read(String(id), modelFrom(codexModel))
  )
  ipcMain.handle(CHANNEL.inspirationAdd, (_, id: string, picture: unknown) =>
    projects.get(String(id))
      ? inspiration.add(
          String(id),
          picture as Parameters<Inspiration["add"]>[1]
        )
      : null
  )
  ipcMain.handle(CHANNEL.inspirationFetch, (_, link: unknown) => {
    const pasted = typeof link === "string" ? pastedLink(link) : null
    return pasted
      ? linkedPicture(pasted, (url, init) => net.fetch(String(url), init))
      : null
  })
  ipcMain.handle(
    CHANNEL.inspirationSave,
    (_, id: string, board: unknown, codexModel: unknown) => {
      if (projects.get(String(id)))
        inspiration.save(String(id), board, modelFrom(codexModel))
    }
  )
  ipcMain.handle(
    CHANNEL.inspirationConfirmRemove,
    async (_, id: string, what: unknown): Promise<boolean> => {
      if (!projects.get(String(id))) return false
      const { images, groups } = (what ?? {}) as {
        images?: unknown
        groups?: unknown
      }
      const count = typeof images === "number" ? images : 0
      const titles = Array.isArray(groups)
        ? groups.filter((title): title is string => typeof title === "string")
        : []
      if (count < 1) return false
      // (a run with nobody at it has nobody to ask)
      if (!win || CAPTURE) return true
      const called = titles.map((title) => `“${title}”`)
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message:
          count === 1
            ? "Delete this image from the board?"
            : `Delete ${count} images from the board?`,
        detail: [
          ...(called.length > 0
            ? [
                `The ${called.length === 1 ? "group" : "groups"} ${called.length === 1 ? called[0] : `${called.slice(0, -1).join(", ")} and ${called.at(-1)}`} ${called.length === 1 ? "goes" : "go"} with ${count === 1 ? "it" : "them"}.`,
              ]
            : []),
          `${count === 1 ? "Its file goes" : "Their files go"} to the ${process.platform === "darwin" ? "Trash" : "Recycle Bin"}, what was noted on ${count === 1 ? "it" : "them"} is forgotten, and the agent no longer designs by ${count === 1 ? "it" : "them"}.`,
        ].join(" "),
        buttons: ["Delete", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      })
      return response === 0
    }
  )
  ipcMain.handle(CHANNEL.inspirationStop, (_, id: string) =>
    inspiration.stop(String(id))
  )
  ipcMain.handle(CHANNEL.inspirationReveal, (_, id: string, file: unknown) => {
    const project = projects.get(String(id))
    if (!project || typeof file !== "string" || !isPictureFile(file)) return
    const at = path.join(project.path, INSPIRATION_FOLDER, file)
    if (fs.existsSync(at)) shell.showItemInFolder(at)
  })
  ipcMain.handle(
    CHANNEL.inspirationSaveArchive,
    async (_, id: string): Promise<boolean> => {
      const project = projects.get(String(id))
      if (!win || !project) return false
      const folder = path.join(project.path, INSPIRATION_FOLDER)
      const { board } = inspiration.read(project.id)
      const taken = new Set<string>()
      const wanted = board.images.flatMap((image) => {
        const source = path.join(folder, image.file)
        if (!fs.existsSync(source)) return []
        const ending = path.extname(image.file)
        const stem =
          path.basename(image.name, path.extname(image.name)).trim() || image.id
        let name = `${stem}${ending}`
        for (let more = 2; taken.has(name.toLowerCase()); more++)
          name = `${stem} ${more}${ending}`
        taken.add(name.toLowerCase())
        return [{ source, name }]
      })
      if (wanted.length === 0) return false
      const picked = await dialog.showSaveDialog(win, {
        defaultPath: saving.offer(
          `${
            (project.name ?? "")
              .replace(/[^A-Za-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .toLowerCase() || "project"
          }-inspiration.zip`
        ),
      })
      if (picked.canceled || !picked.filePath) return false
      const archive = zipOf(
        await Promise.all(
          wanted.map(async ({ source, name }) => ({
            name,
            data: await fs.promises.readFile(source),
          }))
        )
      )
      await fs.promises.writeFile(picked.filePath, archive)
      saving.savedIn(path.dirname(picked.filePath))
      return true
    }
  )

  ipcMain.handle(CHANNEL.picturesAdd, (_, id: string, picture: unknown) =>
    projects.get(String(id))
      ? pictures.add(String(id), picture as Parameters<Pictures["add"]>[1])
      : null
  )
  ipcMain.handle(CHANNEL.picturesDrop, (_, id: string, picture: unknown) =>
    pictures.drop(String(id), picture)
  )
  ipcMain.handle(CHANNEL.picturesRedrawn, (_, picture: unknown) =>
    redrawn(picture as Parameters<typeof redrawn>[0])
  )

  ipcMain.on(
    CHANNEL.versionsShow,
    (_, id: unknown, conversationId: unknown) => {
      if (typeof id !== "string" || typeof conversationId !== "string") return
      if (!projects.get(id)) return
      showing.set(id, conversationId)
      unturned.delete(id)
      follow()
      // the project's other conversations are read again when they are wanted
      threads.shelve(id, conversationId)
    }
  )

  ipcMain.handle(
    CHANNEL.threadItems,
    (_, id: string, conversationId: string) => {
      // (nothing held back is told after the items as they are now, to undo them)
      pace.flush()
      return threads.items(String(id), String(conversationId))
    }
  )
  ipcMain.handle(
    CHANNEL.threadSend,
    (
      _,
      id: string,
      conversationId: string | null,
      text: string,
      notes: PartNote[] | null,
      objects: ObjectRef[] | null,
      given: Partial<Manner> | null,
      reference: unknown,
      attached: unknown,
      quotes: unknown,
      board: unknown
    ) => {
      const manner = mannerFrom(given)
      const noted = Array.isArray(notes)
        ? notes.filter((note) => note?.part?.id)
        : []
      const called = objectsFrom(objects)
      const about = referencedBy(String(id), reference)
      const shown = pictures.read(String(id), attached)
      const quoted = quotesFrom(quotes)
      const onScreen = boardBy(String(id), board)
      // answers at once, with the conversation it went into: the turn runs for as long
      // as it runs, and reports through thread items
      const into = threads.send(
        String(id),
        conversationId === null ? null : String(conversationId),
        String(text),
        noted,
        called,
        manner,
        about,
        shown,
        quoted,
        onScreen
      )
      // the user has started on the project themselves: its model is theirs to have
      // put in order, by asking
      if (into) projects.lookedOver(String(id))
      // (how it was put, and how much went with it: nothing of what it says)
      if (into)
        analytics?.record("message sent", {
          ...mannerSaid(manner),
          fresh: conversationId === null,
          notes: noted.length,
          objects: called.length,
          pictures: shown.length,
          quotes: quoted.length,
          reference: about !== null,
          board: onScreen !== null,
        })
      return into
    }
  )
  ipcMain.handle(
    CHANNEL.threadLookOver,
    (_, id: string, seen: unknown, manner: Partial<Manner> | null) =>
      lookOver(String(id), seenFrom(seen), mannerFrom(manner))
  )
  ipcMain.handle(CHANNEL.threadStop, (_, id: string) => threads.stop(id))
  ipcMain.handle(CHANNEL.threadStopJob, (_, id: string) => threads.stopJob(id))
  ipcMain.handle(CHANNEL.threadSendNow, (_, id: string, queued: string) =>
    threads.sendNow(String(id), String(queued))
  )
  ipcMain.handle(CHANNEL.threadUnqueue, (_, id: string, queued: string) => {
    // the pictures that were to go with it are no conversation's: they are not kept
    for (const picture of threads.unqueue(String(id), String(queued)))
      pictures.drop(String(id), picture.id)
  })
  ipcMain.handle(CHANNEL.changesUndo, (_, id: string) =>
    turnBack(String(id), "undo")
  )
  ipcMain.handle(CHANNEL.changesRedo, (_, id: string) =>
    turnBack(String(id), "redo")
  )
  ipcMain.handle(
    CHANNEL.threadRename,
    (_, id: string, conversationId: string, name: string) =>
      threads.rename(String(id), String(conversationId), String(name))
  )
  ipcMain.handle(
    CHANNEL.threadAnswer,
    (_, id: string, permissionId: string, answer: PermissionAnswer) =>
      threads.answer(id, permissionId, answer)
  )
  ipcMain.handle(
    CHANNEL.threadTell,
    (_, id: string, questionId: string, answers: unknown) =>
      threads.tell(
        String(id),
        String(questionId),
        Array.isArray(answers)
          ? answers.map((answer) => (typeof answer === "string" ? answer : ""))
          : null
      )
  )

  ipcMain.handle(CHANNEL.providersList, () => providers.list())
  ipcMain.handle(CHANNEL.providersChange, (_, id: unknown, patch: unknown) => {
    const which = PROVIDERS.find((one) => one === id)
    // answers at once, with what was chosen: what comes of looking at the agent again,
    // where that is called for, the window hears of as it is found out. (A key this
    // machine cannot keep safely is not kept, which the window is told: it says why.)
    if (which) void providers.change(which, patch)
    const on = (patch as { enabled?: unknown } | null)?.enabled
    if (which && typeof on === "boolean")
      analytics?.record("provider switched", { provider: which, on })
    return providers.list()
  })
  ipcMain.handle(CHANNEL.providersCheck, async () => {
    await providers.check()
    return providers.list()
  })
  ipcMain.handle(CHANNEL.providersUpdate, async (_, id: unknown) => {
    const which = PROVIDERS.find((one) => one === id)
    if (!which) return { outcome: "same", version: null }
    const updated = await providers.update(which)
    analytics?.record("provider updated", {
      provider: which,
      outcome: updated.outcome,
    })
    return updated
  })
  // What Claude Code can be called on for is asked afresh each time: it changes with the
  // folder, and with what the user installs. One asking at a time for a project.
  const commands = new Map<string, Promise<Commands>>()
  ipcMain.handle(CHANNEL.claudeCommands, (_, id: string): Promise<Commands> => {
    const project = projects.get(String(id))
    if (!project) return Promise.resolve({ commands: [], skills: [] })
    let asking = commands.get(project.id)
    if (!asking) {
      asking = providers.found
        .then(() =>
          listCommands(
            providers.launch("claude"),
            project.path,
            projects.goesByOwnSettings(project.id)
          )
        )
        .finally(() => commands.delete(project.id))
      commands.set(project.id, asking)
    }
    return asking
  })

  ipcMain.handle(CHANNEL.settingsGet, (): Settings => settings.get())
  ipcMain.handle(
    CHANNEL.settingsChooseProjectsFolder,
    async (): Promise<Settings> => {
      if (!win) return settings.get()
      const picked = await dialog.showOpenDialog(win, {
        title: "Where new projects go",
        buttonLabel: "Use this folder",
        defaultPath: settings.get().projectsFolder,
        properties: ["openDirectory", "createDirectory"],
      })
      if (picked.canceled || !picked.filePaths[0]) return settings.get()
      return settings.set({ projectsFolder: picked.filePaths[0] })
    }
  )
  // (beside the app's archive where it is packed, and not in it: what opens it is
  // another program, which cannot read in there)
  ipcMain.handle(CHANNEL.settingsOpenLicenses, async () => {
    const file = app.isPackaged
      ? path.join(process.resourcesPath, "THIRD-PARTY-LICENSES.txt")
      : path.join(HERE, "THIRD-PARTY-LICENSES.txt")
    if (!fs.existsSync(file)) return false
    return (await shell.openPath(file)) === ""
  })
  ipcMain.handle(CHANNEL.settingsRevealProjectsFolder, () => {
    const { projectsFolder } = settings.get()
    fs.mkdirSync(projectsFolder, { recursive: true })
    void shell.openPath(projectsFolder)
  })
  ipcMain.handle(CHANNEL.settingsProjectsFolderSize, () =>
    folderSize(settings.get().projectsFolder)
  )
  ipcMain.handle(CHANNEL.settingsSetLookOver, (_, on: unknown): Settings =>
    settings.set({ lookOver: on === true })
  )
  ipcMain.handle(CHANNEL.settingsSetVersions, (_, on: unknown): Settings => {
    const next = settings.set({ versions: on === true })
    // what can be taken back in a project is not the same either way
    broadcast()
    return next
  })
  ipcMain.handle(CHANNEL.settingsSetAnalytics, (_, on: unknown): Settings => {
    const next = settings.set({ analytics: on === true })
    if (!next.analytics) analytics?.forget()
    return next
  })
  ipcMain.handle(
    CHANNEL.coloursSave,
    (_, projectId: unknown, given: unknown): void => {
      if (typeof projectId !== "string") return
      if (projects.saveColours(projectId, readColours(given)))
        keepColours(projectId)
    }
  )
  // (once: what the window kept itself, before the folders kept them)
  ipcMain.handle(
    CHANNEL.coloursAdopt,
    async (_, kept: unknown): Promise<string[]> => {
      if (typeof kept !== "object" || kept === null) return []
      // what could not be written where it belongs, to be tried again: not what has
      // nowhere to go any more, nor what a folder has colours of its own in place of
      const left: string[] = []
      let any = false
      for (const [key, given] of Object.entries(kept)) {
        const parts = readColours(given)
        if (Object.keys(parts).length === 0) continue
        const [projectId, conversationId] = key.split("/")
        if (conversationId !== undefined) {
          const put = await versions
            .adopt(projectId, conversationId, COLOURS_FILE, coloursFile(parts))
            .then(() => true)
            .catch(() => false)
          if (!put) left.push(key)
        } else if (projects.get(projectId) && !projects.hasColours(projectId)) {
          if (projects.saveColours(projectId, parts, { announce: true })) {
            any = true
            keepColours(projectId)
          } else left.push(key)
        }
      }
      if (any) broadcast()
      return left
    }
  )
  ipcMain.handle(CHANNEL.themesList, (): Theme[] => listThemes(THEMES))
  ipcMain.handle(CHANNEL.themesDefaults, (): Defaults => readDefaults(THEMES))
  ipcMain.handle(CHANNEL.themesSaveDefaults, (_, given: unknown): Defaults => {
    if (app.isPackaged)
      throw new Error("The app's own look is changed as it is worked on.")
    return saveDefaults(THEMES, given as Defaults)
  })
  ipcMain.handle(
    CHANNEL.themesSave,
    (_, given: unknown, replacing: unknown): Theme => {
      if (app.isPackaged)
        throw new Error("Themes are made in the app as it is worked on.")
      // what the window sends is read as a file would be, and only a theme is written
      const theme = readTheme("new", given)
      if (!theme) throw new Error("That is not a theme the app can write.")
      return saveTheme(
        THEMES,
        theme,
        typeof replacing === "string" ? replacing : undefined
      )
    }
  )
  ipcMain.handle(
    CHANNEL.themesRemove,
    async (_, id: unknown): Promise<Theme[]> => {
      if (app.isPackaged)
        throw new Error("Themes are taken away in the app as it is worked on.")
      const theme = listThemes(THEMES).find((one) => one.id === String(id))
      // its file goes, which nothing in the app brings back: that is asked about first
      if (theme && win && !CAPTURE) {
        const { response } = await dialog.showMessageBox(win, {
          type: "warning",
          message: `Remove the theme “${theme.name}”?`,
          detail: `Its file, ${THEME_FOLDER}/${theme.id}.json, is deleted.`,
          buttons: ["Remove", "Cancel"],
          defaultId: 0,
          cancelId: 1,
        })
        if (response !== 0) return listThemes(THEMES)
      }
      removeTheme(THEMES, String(id))
      return listThemes(THEMES)
    }
  )
  // (only what is on the list is counted: the window cannot have anything else sent)
  ipcMain.on(CHANNEL.analyticsUsed, (_, feature: unknown) => {
    const which = FEATURES.find((one) => one === feature)
    if (which) analytics?.used(which)
  })

  ipcMain.handle(
    CHANNEL.updateGet,
    (): Update => updates?.get() ?? { state: "none" }
  )
  ipcMain.handle(CHANNEL.updateDownload, () => {
    const found = updates?.get()
    if (found?.state === "available")
      analytics?.record("update fetched", { to: found.version })
    updates?.download()
  })
  ipcMain.handle(CHANNEL.updateRestart, async () => {
    // Starting again stops whatever is under way, an agent in the middle of a turn
    // with it: that is asked about first, and what it did is kept before it goes.
    if (leaving !== null || !(await mayLeave("Restart"))) return
    leaving = "asked"
    await settle()
    leaving = "now"
    updates?.restart()
  })

  ipcMain.on(CHANNEL.viewportResponse, (_, response: ViewportResponse) => {
    const request = waiting.get(response.id)
    if (!request) return
    waiting.delete(response.id)
    clearTimeout(request.timer)
    if (response.ok) request.resolve(response.data)
    else request.reject(new Error(response.error))
  })
}

// What goes wrong with nothing there to hear of it (a write that fails in a timer, a
// promise nobody waits on) is logged, and the app goes on. Left to itself Electron puts
// up a dialog for each, which something that goes wrong again and again, every few
// hundred milliseconds, would bury the window under; and it went on after them anyway.
process.on("uncaughtException", (error) => console.error("[uncaught]", error))
process.on("unhandledRejection", (reason) =>
  console.error("[unhandled]", reason)
)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  void app.whenReady().then(() => {
    // Run from a checkout, the app in the Dock is Electron's own, and so is its icon:
    // it is given the app's mark on another colour, which tells it from the app that is
    // installed. An app made into a package has the icon in it, and macOS draws that one.
    if (!app.isPackaged) app.dock?.setIcon(path.join(ICONS, "icon-dev.png"))
    // A run that only takes a picture of itself, with its window hidden, is not in the
    // Dock at all: beside the app being worked on, it would be taken for that one.
    if (CAPTURE) app.dock?.hide()
    // What a Mac's About says is Electron's own too, down to the version, twice over.
    // (A version given here is shown just as it is given, so the word goes with it.)
    if (!app.isPackaged && process.platform === "darwin")
      app.setAboutPanelOptions({
        applicationName: SHOWN,
        applicationVersion: `Version ${app.getVersion()}`,
        version: "",
      })

    const data = app.getPath("userData")
    // What is set in an agent's environment is often a key: the system keeps those, where
    // it has somewhere to keep them, and the settings file holds only what it gives back.
    // (on Linux, with no keyring to keep them, Electron "keeps" them in a key anybody has:
    // that is no keeping at all)
    const sealing =
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" ||
        safeStorage.getSelectedStorageBackend() !== "basic_text")
    const vault: Vault | null = sealing
      ? {
          seal: (text) => safeStorage.encryptString(text).toString("base64"),
          unseal: (sealed) =>
            safeStorage.decryptString(Buffer.from(sealed, "base64")),
        }
      : null
    settings = new SettingsStore(
      path.join(data, "settings.json"),
      {
        // Documents is where a Mac keeps what its user makes; a run that keeps its state
        // elsewhere keeps its projects there too
        projectsFolder: ELSEWHERE
          ? path.join(ELSEWHERE, "Projects")
          : path.join(app.getPath("documents"), "Enclose"),
        lookOver: true,
        analytics: true,
        versions: true,
      },
      vault
    )
    // (what is in each project's folder is looked for once the window is opening)
    projects = new Projects(
      path.join(data, "projects.json"),
      broadcast,
      (id, root, board) => previews.written(id, root, board),
      { later: true }
    )
    // (one thing at a time in a project's folder, whichever of these it is)
    const locks = new Locks()
    changes = new Changes(path.join(data, "changes"), locks)
    saving = new SaveFolder(path.join(data, "save-folder"), () =>
      app.getPath("downloads")
    )
    versions = new Versions(path.join(data, "versions"), locks)
    pictures = new Pictures(path.join(data, "pictures"))
    inspiration = new Inspiration({
      folderOf: (id) => projects.get(id)?.path ?? null,
      // (each picture is looked at by Claude Code, whichever agent the user talks to,
      // as a group of parts is named by it; and by Codex where Claude Code is not there.
      // Either is there to be asked once it is found)
      look: lookingWith(async () => {
        await providers.found
        const claude = providers.launch("claude")
        if (claude) return { by: "claude", launch: claude }
        const codex = providers.launch("codex")
        return codex ? { by: "codex", launch: codex } : null
      }),
      trash: (file) => shell.trashItem(file),
      onChange: (id, state) => send(CHANNEL.inspirationChanged, id, state),
    })
    connection = new Connection({
      saved: () => settings.github(),
      save: (github) => settings.setGitHub(github),
      open: (url) => void shell.openExternal(url),
      copy: (text) => clipboard.writeText(text),
      get: (url, init) => net.fetch(String(url), init),
      onChange: sendGitHub,
      onConnected: () => {
        analytics?.record("github connected")
        // every project there is, backed up now, with the window saying how far it has got
        void backups.all(true)
      },
    })
    backups = new Backups({
      git,
      projects: backed,
      keep: (id) => projects.keep(id),
      fits: (dir) => versions.fits(dir),
      versioned: () => settings.get().versions,
      on: (id) => versions.on(id),
      hold: (id, work) => locks.hold(id, work),
      github: () => connection.connected(),
      signedOut: () => connection.signedOut(),
      onProgress: (progress) => {
        backingUp = progress
        sendGitHub()
      },
      onFailures: sendGitHub,
    })
    threads = new Threads({
      dir: path.join(data, "threads"),
      projects,
      changes,
      turnTo,
      versioned: async (id) => {
        const project = projects.get(id)
        if (!project || !settings.get().versions) return "off"
        return (await versions.fits(project.path)) ? "yes" : "big"
      },
      launch: (id) => providers.launch(id),
      tools: toolServer,
      kit: KIT,
      scenes: SCENES,
      fileGuide: (id, given, replacing) => {
        const project = projects.get(id)
        if (!project?.manifest)
          throw new Error(
            "This project has no model built yet: there is nothing to write a guide to."
          )
        const parts = partsOf(project.manifest)
        const filed = fileGuide(
          project.path,
          given,
          parts.map((part) => part.id),
          replacing,
          Date.now(),
          new Map(parts.map((part) => [part.id, part.label]))
        )
        // its cover is in the view as soon as it is written, and not when the turn ends
        projects.refresh(id)
        broadcast()
        analytics?.record("assembly guide written", {
          steps: given.steps.length,
        })
        return filed
      },
      onRenamed: (from, to) => {
        followFolder(from, to)
        const renamed = projects.list(() => []).find((one) => one.path === to)
        if (renamed) void backups.renamed(renamed.id)
      },
      // (what the commit says is what came of the turn, as a change log, where Claude
      // Code is there to write one; and what was asked, where it is not)
      onTurned: (projectId, conversationId, what, conversation, said) =>
        void backups.record(projectId, {
          what,
          conversation,
          conversationId,
          log: (files) =>
            changeLog(providers.launch("claude"), what, said, files),
        }),
      history: (projectId) => {
        const project = projects.get(projectId)
        if (!project?.kept || !isRepository(project.path)) return "off"
        return connection.connected() ? "github" : "local"
      },
      viewport: askViewport,
      inspiration: (projectId) => inspiration.digest(projectId),
      onItem: (projectId, conversationId, item) =>
        pace.put(projectId, conversationId, item),
      onVersion: (projectId, from, to, manner) => {
        // the window turns to it, where it was showing the one it was asked for in
        send(CHANNEL.versionsBegun, projectId, from, to)
        analytics?.record("version begun", mannerSaid(manner))
      },
      startProject: (fromId, copy, shown) => {
        const from = projects.get(fromId)
        if (!from) throw new Error("The project is not there any more.")
        const id = startProject(
          copy
            ? { path: from.path, name: from.name ?? path.basename(from.path) }
            : null,
          "conversation"
        )
        pictures.share(
          fromId,
          id,
          shown.map((picture) => picture.id)
        )
        return id
      },
      onProject: (from, to) => {
        // the window has it in the list before it is told to turn to it
        broadcast()
        send(CHANNEL.projectsStarted, from, to)
      },
      onSummary: () => {
        // a turn may have begun, or be over: the model is built as it is written meanwhile
        drafts.sync()
        broadcastSoon()
        // a turn may be over: the folder it was had in is free to be another's
        follow()
      },
      // (how long it took, how far it got and how much is on it: nothing of what the
      // board is or is called)
      onBoardMade: (_, made) =>
        analytics?.record("board made", {
          ...mannerSaid(made.manner),
          outcome: made.outcome,
          minutes: minutesOf(made.took),
          placing: minutesOf(made.steps.placing),
          connecting: minutesOf(made.steps.connecting),
          routing: minutesOf(made.steps.routing),
          checking: minutesOf(made.steps.checking),
          back: made.back,
          steps: made.did,
          builds: made.builds,
          rough: made.rough,
          finished: made.finished,
          parts: made.made?.parts ?? null,
          nets: made.made?.nets ?? null,
          connections: made.made?.connections ?? null,
          vias: made.made?.vias ?? null,
        }),
      onSignedOut: (id) => providers.signedOut(id),
    })
    drafts = new Drafts({
      folder: path.join(data, "drafts"),
      ids: () => projects.list(() => []).map((project) => project.id),
      project: (id) => projects.get(id),
      working: (id) => threads.working(id),
      mayBuild: (id, command) => threads.mayBuild(id, command),
      env: cleanEnv,
      onChange: broadcast,
    })
    // Models are built with a Python that has build123d: where the machine has none, the
    // app makes one of its own, as soon as it can look for one (see python.ts).
    python = new Python({
      dir: path.join(data, "python"),
      env: cleanEnv,
      locate,
      onChange: settingUp,
    })
    putFirstOnPath(() => python.bin())
    providers = new Providers({
      settings,
      look: {
        claude: lookAtClaude,
        codex: lookAtCodex,
        grok: lookAtGrok,
        opencode: lookAtOpencode,
      },
      onChange: () => {
        send(CHANNEL.providersChanged, providers.list())
        // with an agent found, a model can be looked over and what the cards say summed up
        broadcast()
      },
    })
    wire()
    void providers.found.then(() => python.ready())
    // a newer version of an agent comes out while the app is open, too
    setInterval(() => providers.lookForUpdates(), NEWER_EVERY_MS).unref()

    // Run from a checkout, the app is being worked on and not used, and nothing of that
    // is counted: unless it is told where to send it, which is how this is tried out.
    const key = ANALYTICS_KEY ?? (app.isPackaged ? POSTHOG.key : "")
    if (key && !CAPTURE) {
      analytics = new Analytics({
        key,
        host: POSTHOG.host,
        file: path.join(data, "analytics-id"),
        allowed: () => settings.get().analytics,
        about: {
          app_version: app.getVersion(),
          os: SYSTEMS[process.platform] ?? process.platform,
          os_version: process.getSystemVersion(),
          arch: process.arch,
          packaged: app.isPackaged,
        },
        post: async (url, body, signal) =>
          net.fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal,
          }),
      })
      analytics.record("app opened")
    }

    // Run from a checkout, the app is whatever was last built there. It is the app made
    // into a package that has newer versions of itself to look for. On Linux only the
    // AppImage updates itself (its feed names nothing else): a deb, rpm or pacman install
    // is replaced by installing the newer one, so it looks for none, rather than offer
    // one it cannot fetch.
    if (
      app.isPackaged &&
      !CAPTURE &&
      (process.platform !== "linux" || process.env.APPIMAGE)
    ) {
      // (on Linux the AppImage's own updater, named: left to itself electron-updater would
      // take a deb's, rpm's or pacman's wherever the app carries their package-type file,
      // which an AppImage does not, but only for the order electron-builder makes them in)
      const updater =
        process.platform === "linux"
          ? new electronUpdater.AppImageUpdater()
          : electronUpdater.autoUpdater
      if (UPDATES_FROM)
        updater.setFeedURL({ provider: "generic", url: UPDATES_FROM })
      updates = new Updates({
        updater,
        onChange: (update) => send(CHANNEL.updateChanged, update),
      })
      updates.start()
    }

    const given = process.argv
      .slice(app.isPackaged ? 1 : 2)
      .filter((arg) => !arg.startsWith("-"))
    // (the projects there were before: one opened now has its model made as it is)
    const listed = projects.ids()
    let first: string | null = null
    try {
      first = open(given).id
    } catch (error) {
      console.error("[open]", error)
    }
    // The window is opened before anything more is read: it loads meanwhile, and asks for
    // the projects once it has, which is answered when all this is done.
    createWindow(first)
    unreadable(
      projects.aside &&
        `The list of your projects could not be read, so it starts empty: add their folders again. The file was moved aside as it was, to ${projects.aside}.`,
      settings.aside &&
        `Your settings could not be read, so the defaults are in use. The file was moved aside as it was, to ${settings.aside}.`
    )
    projects.locateAll()

    // Files that were still being made a model of when the app was last quit, or that
    // could not be: tried again, now that whatever was wanting may be there. Only in
    // folders of the app's own making: nobody else's build is run unasked.
    for (const id of listed) {
      const project = projects.get(id)
      if (
        project?.made &&
        project.build &&
        !project.manifest &&
        broughtIn(project.path)
      )
        makeModel(id)
    }

    // what changed in the projects while the app was not open goes to GitHub, unshown
    if (connection.connected() && !CAPTURE) void backups.all(false)

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(null)
    })
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
  // Quitting stops whatever is under way: that is asked about first, and each turn is
  // then stopped and seen to its end, what it did kept as a change that can be taken
  // back and committed, before the app goes. (Not for long: a turn that has not seen
  // to that in QUIT_WAIT_MS is left as it is.)
  app.on("before-quit", (event) => {
    if (leaving === "now") return letGo()
    event.preventDefault()
    if (leaving === "asked") return
    leaving = "asked"
    void mayLeave("Quit").then(async (yes) => {
      if (!yes) {
        leaving = null
        return
      }
      await settle()
      leaving = "now"
      app.quit()
    })
  })
}

/** How long quitting waits for what turns that were stopped for it leave to be kept, ms. */
const QUIT_WAIT_MS = 10_000
/**
 * How far the app is from being quit: asked, while the user is asked whether to, or the
 * turns stopped for it are seen to their end; now, once nothing is in the way of it.
 */
let leaving: "asked" | "now" | null = null

/** How many projects an agent is at work in, or a model is being made of. */
const busyCount = () =>
  projects
    ? projects
        .list(() => [])
        .filter(({ id }) => threads.working(id) || builds.has(id)).length
    : 0

/**
 * Whether the app may be quit, or started again (`as`): yes, where nothing is under
 * way; and where something is, as the user says, asked first.
 */
async function mayLeave(as: "Quit" | "Restart"): Promise<boolean> {
  const busy = busyCount()
  if (busy === 0 || CAPTURE) return true
  const asking = {
    type: "warning" as const,
    message: `${as} Enclose now?`,
    detail: `${
      busy === 1 ? "A project is" : `${busy} projects are`
    } still being worked on, and that will be stopped. What was done so far can still be undone.`,
    buttons: [as, "Cancel"],
    defaultId: 0,
    cancelId: 1,
  }
  const { response } =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, asking)
      : await dialog.showMessageBox(asking)
  return response === 0
}

/**
 * Stop what is under way, for the app to be quit: models being made, and turns and
 * boards, each seen to its end and its commit, for QUIT_WAIT_MS at most. (What is being
 * pushed is not waited for: it goes with the next push.)
 */
async function settle() {
  for (const stop of builds.values()) stop()
  if (!threads) return
  await Promise.race([
    threads.stopAll().then(() => backups?.committed()),
    new Promise((resolve) => setTimeout(resolve, QUIT_WAIT_MS)),
  ])
  // and the conversations written down, where they were being, or were to be soon (what
  // is left after that is written as the app goes)
  await Promise.race([
    threads.saved(),
    new Promise((resolve) => setTimeout(resolve, QUIT_WAIT_MS)),
  ])
}

/** Let go of everything, as the app goes. */
function letGo() {
  if (summing) clearTimeout(summing)
  for (const stop of builds.values()) stop()
  threads?.close()
  toolServer.close()
  guideServer.close()
  projects?.close()
  previews.close()
  drafts?.close()
  updates?.close()
  analytics?.close()
  python?.close()
  stopPeers()
}
