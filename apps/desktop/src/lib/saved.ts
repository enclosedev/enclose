// What a file the app saves is called: its own name, and before that the day it is
// saved on, where the settings ask for it. So that a folder of files had from a project
// over the weeks lists them in the order they were had, and tells this week's from last.
// And what saves parts of a model, in the format that is chosen for that.
import type { WebSource } from "@/components/viewport/web"
import { partFile, type Download } from "@/lib/model"
import { usePreferences, type Format } from "@/lib/preferences"

/** A name with a day before it, as the year, the month and the day: 2026_10_11_name. */
export function dated(name: string, on: Date = new Date()): string {
  const two = (number: number) => String(number).padStart(2, "0")
  return `${on.getFullYear()}_${two(on.getMonth() + 1)}_${two(on.getDate())}_${name}`
}

/**
 * What a file, or a folder or an archive of files, is saved as today: what is in a folder
 * or an archive keeps its own name, having the day on what it is in.
 */
export const savedAs = (name: string): string =>
  usePreferences.getState().datedFiles ? dated(name) : name

/** A name as a page's address has it: small letters, figures and dashes. */
export const webName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model"

/**
 * Save some of the model (all of it, where no parts are given) for a web page: a GLB,
 * into the project's web folder as `name`.glb, over what was saved there as that before,
 * so that a page that has it from there has it as it is now. No day goes before its
 * name: a page asks for it by name. Says where it went.
 */
export async function saveForWeb(
  projectId: string,
  loaded: WebSource,
  name: string,
  parts: string[] | null = null
): Promise<boolean> {
  // (had only when asked for: three.js's exporter is not wanted before then, and the
  // store would bring the whole window into what only works out a name)
  const [{ webModel }, { useStore }] = await Promise.all([
    import("@/components/viewport/web"),
    import("@/lib/store"),
  ])
  const { say, colours, materials } = useStore.getState()
  let data: ArrayBuffer
  try {
    data = await webModel(loaded, {
      parts,
      colours: colours[projectId],
      materials: materials[projectId],
    })
  } catch (error) {
    console.error("Could not make the model for the web", error)
    say("It could not be made for the web")
    return false
  }
  const saved = await window.cad.model.saveWeb(
    projectId,
    `${webName(name)}.glb`,
    data
  )
  say(saved ? `Saved in the project as ${saved}` : "It could not be saved")
  return saved !== null
}

/**
 * Some of a model's parts, to be saved in the format chosen: how many files that comes
 * to, how big they are together where that is known, and what saves them. One part is
 * one file; several, a folder called `folder` of a file for each. STEP is what the build
 * wrote, where it wrote one for the part; a mesh is made of what the view draws, and is
 * there for every part. Null where there is nothing of them to save.
 */
export function savingParts(
  projectId: string,
  downloads: Download[],
  format: Format,
  parts: { id: string; label: string }[],
  folder: string,
  /** the model as the view has it: what a GLB for the web is made of */
  loaded?: WebSource
): {
  files: number
  bytes: number | null
  save: () => Promise<boolean>
} | null {
  if (parts.length === 0) return null
  // (for a page, one file of them together, however many they are)
  if (format === "web") {
    if (!loaded) return null
    const ids = parts.map((part) => part.id)
    return {
      files: 1,
      bytes: null,
      save: () =>
        saveForWeb(
          projectId,
          loaded,
          parts.length === 1 ? ids[0] : folder,
          ids
        ),
    }
  }
  if (format !== "step") {
    const sets = parts.map((part) => ({
      name: `${part.id}.${format}`,
      parts: [part.id],
    }))
    return {
      files: sets.length,
      bytes: null,
      save: () =>
        sets.length === 1
          ? window.cad.model.saveMeshes(
              projectId,
              format,
              sets,
              "file",
              savedAs(sets[0].name)
            )
          : window.cad.model.saveMeshes(
              projectId,
              format,
              sets,
              "folder",
              savedAs(folder)
            ),
    }
  }
  const files = [
    ...new Map(
      parts.flatMap((part) => {
        const file = partFile(downloads, part.id, part.label)
        return file ? [[file.file, file] as const] : []
      })
    ).values(),
  ]
  if (files.length === 0) return null
  return {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    save: () =>
      files.length === 1
        ? window.cad.model.saveCopy(
            projectId,
            files[0].file,
            savedAs(files[0].name)
          )
        : window.cad.model.saveCopies(
            projectId,
            files.map(({ file, name }) => ({ file, name })),
            savedAs(folder)
          ),
  }
}
