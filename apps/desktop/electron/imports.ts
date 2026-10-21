// Opening what was made somewhere else. A folder that already holds a model the app can
// show is a project as it stands, and is opened where it is. CAD files are another
// matter. They come out of every kind of setup, so they are copied into a folder of the
// app's own, laid out the way the projects it makes itself are - the files in source/,
// a model.py that builds the model from them, the exporter beside it - and built.
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

import type { BringingIn } from "../shared/api"
import { CONFIG_NAMES } from "../shared/manifest-format"
import {
  findModel,
  folderName,
  makeFolder,
  SKIP,
  type Written,
} from "./projects"

/** The meshes that can be brought in: triangles only, which are made solids as they are read. */
export const MESH_ENDINGS = [".stl", ".obj"]
/** The files that can be brought in, by how their names end. */
export const CAD_ENDINGS = [".step", ".stp", ...MESH_ENDINGS]

/** Where in a project the files it was made from are kept. */
const SOURCE = "source"
/** What builds the model of them, as the project's enclose.json has it. */
const BUILD = "python3 model.py"

const MAX_DEPTH = 6
const MAX_FOLDERS = 4000

const isCad = (file: string) =>
  CAD_ENDINGS.includes(path.extname(file).toLowerCase())

/** Whether a file brought in is a mesh, by its name. */
export const isMesh = (file: string) =>
  MESH_ENDINGS.includes(path.extname(file).toLowerCase())

/** In the order a person would list them: "part 2" before "part 10". */
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

/** The CAD files in a folder, however deep in it, as paths within it. */
export function cadFilesIn(root: string): string[] {
  const found: string[] = []
  let level = [root]
  let seen = 0
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = []
    for (const dir of level) {
      if (++seen > MAX_FOLDERS) return found.sort(byName)
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!SKIP.has(entry.name)) next.push(full)
        } else if (entry.isFile() && isCad(entry.name)) {
          found.push(path.relative(root, full))
        }
      }
    }
    level = next
  }
  return found.sort(byName)
}

/**
 * CAD files to be made one project of: what it is to be called, and each file with the
 * place it takes among the project's own.
 */
export type Bundle = { name: string; files: { from: string; as: string }[] }

export type Opened = {
  /** folders to open where they are */
  folders: string[]
  /** CAD files to bring in, each lot as a project of its own */
  bundles: Bundle[]
  /** what was given that is neither */
  refused: string[]
}

/** Whether a project's folder holds files that were brought in. */
export const broughtIn = (dir: string) => fs.existsSync(path.join(dir, SOURCE))

/** Whether a folder is set up as a project already, built or not. */
const isProject = (dir: string) =>
  CONFIG_NAMES.some((name) => fs.existsSync(path.join(dir, name))) ||
  findModel(dir).manifest !== null

/**
 * Sort what was given to open into what is to be done with it. A folder that is a
 * project already (`known` says which the app has) is opened where it is, and so is one
 * with no CAD file in it, which is somewhere to start. Any other folder is brought in:
 * its CAD files, as one project named for it. Files given by themselves are brought in
 * together, as one project named for the file, or for the folder they are in.
 */
export function sortOpened(
  paths: string[],
  known: (dir: string) => boolean = () => false
): Opened {
  const opened: Opened = { folders: [], bundles: [], refused: [] }
  const loose: string[] = []
  for (const given of paths) {
    let stat: fs.Stats
    try {
      stat = fs.statSync(given)
    } catch {
      opened.refused.push(given)
      continue
    }
    if (stat.isDirectory()) {
      const files = known(given) || isProject(given) ? [] : cadFilesIn(given)
      if (files.length === 0) opened.folders.push(given)
      else
        opened.bundles.push({
          name: path.basename(given),
          files: files.map((file) => ({
            from: path.join(given, file),
            as: file,
          })),
        })
    } else if (stat.isFile() && isCad(given)) loose.push(given)
    else opened.refused.push(given)
  }
  if (loose.length > 0) {
    loose.sort((a, b) => byName(path.basename(a), path.basename(b)))
    const taken = new Set<string>()
    opened.bundles.push({
      name:
        loose.length === 1
          ? path.parse(loose[0]).name
          : path.basename(path.dirname(loose[0])),
      files: loose.map((from) => {
        const { name, ext } = path.parse(from)
        let as = name + ext
        for (let n = 2; taken.has(as.toLowerCase()); n++)
          as = `${name}-${n}${ext}`
        taken.add(as.toLowerCase())
        return { from, as }
      }),
    })
  }
  return opened
}

/**
 * What Claude makes of a model on looking it over: what the thing is, what its project
 * is to be called, which of the app's reference scenes it is best seen in, the groups
 * its parts go in, and each part, by the id it was read under, with the name it is to go
 * by and its group.
 */
export type Arrangement = {
  what: string
  name?: string
  reference?: string
  groups: { name: string; outside?: boolean }[]
  parts: { id: string; name: string; group: string }[]
}

/** The same, made fit to write a model.py with. */
export type Arranged = {
  what: string
  /** what the project is to be called, where it was said: the model's title, then */
  name: string | null
  /** the reference scene of the app's that suits the thing, where one was named */
  reference: string | null
  groups: { label: string; shell: boolean }[]
  /** `from` is the id a part is read from the files under; `id` the one it has here */
  parts: { from: string; id: string; label: string; group: string }[]
}

/** The most letters a name is let run to. */
const NAME_LENGTH = 60

/** A name on one line, no longer than a name is. */
const named = (text: unknown) =>
  (typeof text === "string" ? text : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_LENGTH)
    .trim()

/** What the exporter makes an id of a name by (`_slug` in kit/enclose.py). */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "part"

/**
 * Put a model's parts in the order Claude gave: each under its new name, in its group.
 * `read` is the parts as the files gave them. A part Claude left out stays as it was
 * read. `scenes` are the reference scenes the app has, by what each is known by: one
 * that is none of them is left out, and the app goes by the model's size. Throws, in words for Claude to mend what it gave by, when that cannot be gone
 * by: a part that is not one of the model's, or one with no name or no group.
 */
export function arrange(
  read: { id: string; label: string; group: string }[],
  given: Arrangement,
  scenes: string[] = []
): Arranged {
  const wanted = new Map<string, { label: string; group: string }>()
  for (const part of Array.isArray(given.parts) ? given.parts : []) {
    const id = typeof part?.id === "string" ? part.id.trim() : ""
    if (!read.some((one) => one.id === id))
      throw new Error(
        `No part has the id "${id}". The parts are: ${read.map((one) => one.id).join(", ")}.`
      )
    if (wanted.has(id)) throw new Error(`The part "${id}" is listed twice.`)
    const label = named(part.name)
    const group = named(part.group)
    if (!label) throw new Error(`The part "${id}" was given no name.`)
    if (!group) throw new Error(`The part "${id}" was given no group.`)
    wanted.set(id, { label, group })
  }
  if (wanted.size === 0) throw new Error("No parts were listed.")

  // Groups are told apart as the exporter tells them apart, by the id it makes of each:
  // "Gear train" and "Gear-train" are one group, called what it was first called.
  const groups = new Map<string, { label: string; shell: boolean }>()
  for (const group of Array.isArray(given.groups) ? given.groups : []) {
    const label = named(group?.name)
    if (label && !groups.has(slug(label)))
      groups.set(slug(label), { label, shell: group.outside === true })
  }
  const labels = new Set<string>()
  const ids = new Set<string>()
  const parts = read.map((one) => {
    const { label: asked, group } = wanted.get(one.id) ?? one
    if (!groups.has(slug(group)))
      groups.set(slug(group), { label: group, shell: false })
    let label = asked
    for (let n = 2; labels.has(label.toLowerCase()); n++)
      label = `${asked} ${n}`
    labels.add(label.toLowerCase())
    let id = slug(label)
    for (let n = 2; ids.has(id); n++) id = `${slug(label)}_${n}`
    ids.add(id)
    return { from: one.id, id, label, group: groups.get(slug(group))!.label }
  })
  return {
    what: named(given.what),
    name: named(given.name) || null,
    reference: scenes.find((scene) => scene === given.reference) ?? null,
    groups: [...groups.values()].filter((group) =>
      parts.some((part) => part.group === group.label)
    ),
    parts,
  }
}

/**
 * The model.py of a project made of CAD files: every body in them, a part. It starts
 * with each named and grouped as the files have it; once Claude has looked the model
 * over, it is written again with the names and groups that came of that (`arranged`).
 */
export function modelScript(
  title: string,
  files: string[],
  arranged?: Arranged
): string {
  // (what JSON writes for a string is a string to Python too)
  const py = (text: string) => JSON.stringify(text)
  // STEP files alone are read as they always were; with a mesh among them, by what
  // reads both, and the parts made of a mesh are said to be
  const meshes = files.some(isMesh)
  const reader = meshes ? "read_files" : "read_step"
  const reading = [
    `for found in ${reader}(`,
    ...files.map((file) => `    ${py(file)},`),
    "):",
  ]
  const mesh = meshes ? ["        mesh=found.mesh,"] : []
  if (!arranged)
    return [
      `"""Builds this project's model from the CAD files in ${SOURCE}/.`,
      "",
      "Enclose wrote this when the files were opened. From here on it is the project's own:",
      "change it to change the model, and run it again to see the change.",
      '"""',
      "",
      `from enclose import Model, ${reader}`,
      "",
      `model = Model(${py(title)})`,
      "",
      "# Every body in the files is a part, under the group its file puts it in.",
      "groups = {}",
      ...reading,
      "    if found.group not in groups:",
      "        groups[found.group] = model.group(found.group)",
      "    model.part(",
      "        found.id,",
      "        found.shape,",
      "        label=found.label,",
      "        group=groups[found.group],",
      "        color=found.color,",
      ...mesh,
      "    )",
      "",
      "model.write()",
      "",
    ].join("\n")
  // in a docstring, where nothing of it can end the docstring
  const what = arranged.what.replace(/["\\]/g, "'")
  return [
    `"""Builds this project's model from the CAD files in ${SOURCE}/.`,
    "",
    "Enclose wrote this when the files were opened, with the names and groups Claude gave",
    "the parts on looking the model over.",
    ...(what ? ["", `It took the thing to be: ${what}`] : []),
    "",
    "From here on it is the project's own: change it to change the model, and run it again",
    "to see the change.",
    '"""',
    "",
    `from enclose import Model, ${reader}`,
    "",
    arranged.reference
      ? `model = Model(${py(title)}, reference=${py(arranged.reference)})`
      : `model = Model(${py(title)})`,
    "",
    "# The groups the parts are listed under, in the order the list shows them.",
    "groups = {",
    ...arranged.groups.map(
      ({ label, shell }) =>
        `    ${py(label)}: model.group(${py(label)}${shell ? ", shell=True" : ""}),`
    ),
    "}",
    "",
    "# Each body in the files, by the id it is read under: the id it has here, what it is",
    "# called, and the group it is listed under.",
    "PARTS = {",
    ...arranged.parts.map(
      ({ from, id, label, group }) =>
        `    ${py(from)}: (${py(id)}, ${py(label)}, ${py(group)}),`
    ),
    "}",
    "",
    ...reading,
    "    # (a body the files did not have when the parts were named stays as it is read)",
    "    id, label, group = PARTS.get(found.id, (found.id, found.label, found.group))",
    "    if group not in groups:",
    "        groups[group] = model.group(group)",
    "    model.part(",
    "        id,",
    "        found.shape,",
    "        label=label,",
    "        group=groups[group],",
    "        color=found.color,",
    ...mesh,
    "    )",
    "",
    "model.write()",
    "",
  ].join("\n")
}

/** Where in a project the script that builds its model is. */
export const SCRIPT = "model.py"

/**
 * Make a project's folder of a lot of CAD files, in `into`, and return where it is, with
 * what its model.py was written from. The files are copied, never moved: what was opened
 * stays as it was. `kit` is the app's exporter, which the project gets its own copy of.
 */
export function bringIn(
  bundle: Bundle,
  into: string,
  kit: string,
  now = new Date()
): { dir: string; written: Written } {
  const dir = makeFolder(into, folderName(bundle.name, now))
  const written: Written = {
    title: bundle.name,
    files: bundle.files.map((file) =>
      [SOURCE, ...file.as.split(path.sep)].join("/")
    ),
  }
  try {
    for (const file of bundle.files) {
      const to = path.join(dir, SOURCE, file.as)
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(file.from, to, fs.constants.COPYFILE_FICLONE)
    }
    fs.copyFileSync(kit, path.join(dir, "enclose.py"))
    fs.writeFileSync(
      path.join(dir, SCRIPT),
      modelScript(written.title, written.files)
    )
    fs.writeFileSync(
      path.join(dir, CONFIG_NAMES[0]),
      `${JSON.stringify({ model: "build/enclose.model.json", build: BUILD })}\n`
    )
  } catch (error) {
    // half a project is no project: the folder was made a moment ago, and is all copies
    fs.rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return { dir, written }
}

// What the exporter prints as it writes a model: how many parts there are to write,
// then each one as it is done.
const TOTAL = /^(\d+) parts?$/
const DONE = /^ {2}.+: \d+(\.\d+)?s$/
/** What a build says when it had no Python to run, or one without build123d. */
const NO_PYTHON =
  /No module named '(build123d|OCP)'|python3?: (command )?not found|is not recognized/
/** No oftener than this (ms) is it said how far a build has got. */
const PACE = 150

/**
 * Run a project's build, saying how far it has got as it goes. `finished` resolves to
 * null once the model is written, or to what went wrong.
 */
export function runBuild(
  dir: string,
  command: string,
  env: NodeJS.ProcessEnv,
  onProgress: (done: number, total: number | null) => void
): { finished: Promise<BringingIn | null>; stop: () => void } {
  const child = spawn(command, {
    cwd: dir,
    shell: true,
    // (Python holds on to what it prints, when nobody is watching, until there is a lot)
    env: { ...env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    // a process group of its own, for `stop` to reach all of it (on Windows this would
    // open a console window for the build instead)
    detached: process.platform !== "win32",
  })
  let done = 0
  let total: number | null = null
  let said = 0
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const count = TOTAL.exec(line)
    if (count) total = Number(count[1])
    else if (DONE.test(line)) done++
    else return
    if (Date.now() - said < PACE) return
    said = Date.now()
    onProgress(done, total)
  })
  let complaint = ""
  child.stderr.on("data", (chunk: Buffer) => {
    complaint = (complaint + chunk.toString("utf8")).slice(-4000)
  })
  const finished = new Promise<BringingIn | null>((resolve) => {
    const failed = (code: number | null) =>
      resolve({
        state: "failed",
        // 127 is a shell's way of saying it found no such command
        why: code === 127 || NO_PYTHON.test(complaint) ? "python" : "build",
        // (the exporter says what is wrong with a file as a ValueError: its words
        // are for reading, the name Python gives the saying of them is not)
        detail:
          complaint
            .trim()
            .split("\n")
            .at(-1)
            ?.trim()
            .replace(/^ValueError: /, "") ||
          `The build ended with code ${code}.`,
      })
    child.once("error", () => failed(null))
    child.once("close", (code) => (code === 0 ? resolve(null) : failed(code)))
  })
  // once it is over, its group's number may be given to something else
  let over = false
  void finished.then(() => (over = true))
  /**
   * Stop the build: the shell it runs in, and all that the shell started. A shell does
   * not always hand itself over to the command it was given (dash, the /bin/sh of Debian
   * and Ubuntu, never does), and with only the shell stopped Python would build on to
   * the end. So the whole group the build was started in is told.
   */
  const stop = () => {
    if (over || child.pid === undefined) return
    try {
      if (process.platform === "win32") child.kill()
      else process.kill(-child.pid, "SIGTERM")
    } catch {
      // gone already
    }
  }
  return { finished, stop }
}
