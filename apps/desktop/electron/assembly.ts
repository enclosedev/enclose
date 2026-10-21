// A project's assembly guides, as the app's own process has them: found in the project's
// folder (see shared/assembly-format.ts), and written there from what an agent gives.
// How one is handed out, as a page, is in guide-page.ts.
import fs from "node:fs"
import path from "node:path"

import type { GuideSummary } from "../shared/api"
import {
  ASSEMBLY_FOLDER,
  fileNameOf,
  GUIDE_FILE,
  leftOut,
  mixed,
  MOST_GUIDE_BYTES,
  MOST_GUIDES,
  partsIn,
  readGuide,
  troubleWith,
  writtenAs,
  type Guide,
  type GuideGiven,
} from "../shared/assembly-format"

/** The files in a folder's assembly/ that are guides, by name. */
export function findGuides(root: string): string[] {
  let names: string[]
  try {
    names = fs.readdirSync(path.join(root, ASSEMBLY_FOLDER))
  } catch {
    return []
  }
  return names
    .filter((name) => GUIDE_FILE.test(name))
    .sort()
    .slice(0, MOST_GUIDES)
}

/** A guide as it was found: read, or with why it could not be. */
type Found = {
  id: string
  file: string
  /** when its file was last written (ms) */
  written: number
  guide: Guide | null
  trouble: string | null
}

/** A folder's guides as they are written, in the order of their files. */
function foundIn(root: string): Found[] {
  return findGuides(root).map((name): Found => {
    const file = path.join(root, ASSEMBLY_FOLDER, name)
    const id = GUIDE_FILE.exec(name)![1]
    let written = 0
    try {
      const { size, mtimeMs } = fs.statSync(file)
      written = mtimeMs
      if (size > MOST_GUIDE_BYTES)
        throw new Error("The file is too long to be a guide.")
      const guide = readGuide(JSON.parse(fs.readFileSync(file, "utf8")))
      return { id, file, written, guide, trouble: null }
    } catch (error) {
      return {
        id,
        file,
        written,
        guide: null,
        trouble: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

/** One of a folder's guides, by what it is known by: null if there is none, or it does not read. */
export function guideOf(root: string, id: string): Guide | null {
  return foundIn(root).find((one) => one.id === id)?.guide ?? null
}

/**
 * Take one of a folder's guides away, by what it is known by: its file is handed to
 * `away`, which is to put it where it can be had back from, and not to destroy it.
 * Whether there was one. (Its file may not read as a guide: that is no reason to keep it.)
 */
export async function removeGuide(
  root: string,
  id: string,
  away: (file: string) => Promise<void>
): Promise<boolean> {
  const found = foundIn(root).find((one) => one.id === id)
  if (!found) return false
  await away(found.file)
  return true
}

/** A folder's guides as their covers have them, the one written last first. */
export function guidesIn(root: string): GuideSummary[] {
  return foundIn(root)
    .map(({ id, written, guide, trouble }): GuideSummary => ({
      id,
      title: guide?.title ?? id,
      version: guide?.version ?? 1,
      made: guide?.made ?? written,
      steps: guide?.steps.length ?? 0,
      parts: guide ? partsIn(guide) : [],
      cover: guide?.cover ?? { view: null, parts: [] },
      trouble,
    }))
    .sort((a, b) => b.made - a.made)
}

export const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/**
 * Write a guide into a folder, from what an agent gave: checked against the parts the
 * model has, by id, and filed as the next writing of the guide to that thing. Throws,
 * in words the guide can be mended by, where it is not one that can be shown.
 * `replacing` is a guide written a moment ago, in the same turn, that this one is
 * instead of: an agent that thinks better of what it wrote has written one guide, and
 * not two. Returns what it is known by, and what to say of it: with which of its steps
 * put on parts of more than one kind at once, which is seldom how a thing goes
 * together, going by what the parts are called (`called`, by id).
 */
export function fileGuide(
  root: string,
  given: GuideGiven,
  model: string[],
  replacing: string | null,
  now: number,
  called: ReadonlyMap<string, string> = new Map()
): { id: string; said: string } {
  const read = readGuide(given)
  const trouble = troubleWith(read, model)
  if (trouble.length > 0)
    throw new Error(
      [
        "The guide was not written. Put these right and give it again, whole:",
        ...trouble.map((one) => `- ${one}`),
      ].join("\n")
    )
  const dir = path.join(root, ASSEMBLY_FOLDER)
  fs.mkdirSync(dir, { recursive: true })
  if (replacing && GUIDE_FILE.test(`${replacing}.json`))
    fs.rmSync(path.join(dir, `${replacing}.json`), { force: true })
  const name = fileNameOf(read.title)
  const before = foundIn(root).filter(
    (one) => one.guide && fileNameOf(one.guide.title) === name
  )
  const version = Math.max(0, ...before.map((one) => one.guide!.version)) + 1
  const guide: Guide = { ...read, version, made: now }
  let id = `${name}-v${version}`
  // (a file by that name that is not a guide to this, or does not read: not written over)
  for (let n = 2; fs.existsSync(path.join(dir, `${id}.json`)); n++)
    id = `${name}-v${version}-${n}`
  fs.writeFileSync(path.join(dir, `${id}.json`), writtenAs(guide))
  const left = leftOut(guide, model)
  const lumped = mixed(guide, called)
  return {
    id,
    said: [
      `Written as ${ASSEMBLY_FOLDER}/${id}.json: ${counted(guide.steps.length, "step")}, ${counted(partsIn(guide).length, "part")}, version ${version}. Its cover is in the app's Assembly view, where the user opens it and takes it away.`,
      ...(left.length > 0
        ? [
            `${counted(left.length, "part")} of the model ${left.length === 1 ? "is" : "are"} in no step and will not be shown: ${left.join(", ")}. That is right for a guide to part of the model. If this is a guide to all of it, give it again with ${left.length === 1 ? "it" : "them"} in.`,
          ]
        : []),
      ...(lumped.length > 0
        ? [
            `${lumped.length === 1 ? "One step puts" : `${lumped.length} steps each put`} on parts of more than one kind at once:`,
            ...lumped.map(
              ({ step, parts }) =>
                `- step ${step + 1}, "${guide.steps[step].title}": ${parts.join(", ")}`
            ),
            `The page brings a step's parts in together, as one, so the reader does not see how these go to each other. That is right only for what comes to them as one piece. Where one of these is fitted to another (pressed in, screwed on, glued), that fitting is a step of its own: split the step, and where the fitting is done before the thing goes on, make it a sub-assembly ("sub", then "fits"). Then give the guide again.`,
          ]
        : []),
    ].join("\n"),
  }
}
