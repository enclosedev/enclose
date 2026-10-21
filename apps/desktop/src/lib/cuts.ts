// The cut each project was last left with, so that cutting it open again shows it as it
// was. Kept by the window, like the rest of how a model is looked at. And where a cut
// stands to what is on show of the model.
import * as THREE from "three"

import type { Vec3 } from "@shared/api"
import type { Section } from "@/lib/store"

const numbers = (value: unknown, count: number) =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((one) => typeof one === "number" && Number.isFinite(one))

/** What was kept, as far as it can be made out: a cut that does not read as one is dropped. */
export function readCuts(kept: string | null): Record<string, Section> {
  let read: unknown
  try {
    read = JSON.parse(kept ?? "{}")
  } catch {
    return {}
  }
  if (!read || typeof read !== "object") return {}
  const cuts: Record<string, Section> = {}
  for (const [project, cut] of Object.entries(read)) {
    const { position, turn, flipped } = (cut ?? {}) as Partial<Section>
    if (
      numbers(position, 3) &&
      numbers(turn, 4) &&
      typeof flipped === "boolean"
    )
      cuts[project] = { position, turn, flipped } as Section
  }
  return cuts
}

/** The cuts of the projects there still are: one that has been removed takes its cut with it. */
export function cutsOf(
  cuts: Record<string, Section>,
  projects: { id: string }[]
): Record<string, Section> {
  const kept = Object.entries(cuts).filter(([id]) =>
    projects.some((project) => project.id === id)
  )
  return kept.length === Object.keys(cuts).length
    ? cuts
    : Object.fromEntries(kept)
}

/** The flat a cut lies in, in the model's frame. */
const planeOf = ({ position, turn }: Section) =>
  new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...turn)),
    new THREE.Vector3(...position)
  )

/** Whether a cut goes through a box of the model, with some of it either side. */
export const passesThrough = (cut: Section, box: THREE.Box3) =>
  planeOf(cut).intersectsBox(box)

/** The place on a cut nearest a point: where its handle stands, for a point it is to keep to. */
export const nearestOn = (cut: Section, point: Vec3): Vec3 =>
  planeOf(cut)
    .projectPoint(new THREE.Vector3(...point), new THREE.Vector3())
    .toArray()
