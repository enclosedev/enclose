// What a file the app saves is called: its own name, and before that the day it is
// saved on, where the settings ask for it. So that a folder of files had from a project
// over the weeks lists them in the order they were had, and tells this week's from last.
// And what saves parts of a model, in the format that is chosen for that.
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
  folder: string
): {
  files: number
  bytes: number | null
  save: () => Promise<boolean>
} | null {
  if (parts.length === 0) return null
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
