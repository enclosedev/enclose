// The model for a web page: one binary glTF file (GLB), as three.js, <model-viewer> and
// the like take it. Made of what the view draws, in the colours the user sees and of
// the materials Render draws parts in, so that what is on the page is what is in the app.
//
// As glTF has it: metres, Y up, the model's front (-Y in the app) toward +Z. Each part is
// a node of its own, called by its id, under a node for its group, also called by its
// id; and each says what it goes by in its extras ({ label }), which three.js reads into
// userData. Every part sits where the model has it, unexploded, with its origin where
// the part's own is: a page that moves a part (a lid opening) turns it about that.
//
// What a material has that only the app can draw is left out: the picture of a grain
// (oak, felt) is laid on by a shader of the app's own, and a part from CAD has no
// coordinates to lay a picture on with. Such a part is its material's colour.
import * as THREE from "three"
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js"

import type { Model } from "@/lib/model"
import { currentPalette } from "@/lib/palette"
import type { WebPage } from "@shared/api"
import { materialOf, type PartMaterial } from "@shared/materials"
import type { LoadedPart } from "./load"
import { ownMaterial, physicalOf } from "./materials"
import { skinColour } from "./paint"

/** What a GLB is made of: the parts as the view has them, and the model's groups. */
export type WebSource = {
  model: Pick<Model, "title" | "groups">
  parts: LoadedPart[]
}

/** Model millimetres, Z up, to glTF's metres, Y up. */
const TO_GLTF = new THREE.Matrix4()
  .makeRotationX(-Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
const TO_METRES = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001)
const FROM_METRES = new THREE.Matrix4().makeScale(1000, 1000, 1000)

/** What a part is made of on the page: its own material, or what its model says it is. */
function surfaceOf(
  part: LoadedPart,
  index: number,
  colour: string | null,
  chosen: PartMaterial | null
): THREE.MeshPhysicalMaterial {
  const material =
    (chosen && materialOf(chosen.material)) || ownMaterial(part.part)
  const made = physicalOf(material, chosen, new THREE.Vector3(), null)
  // (a material of its own colour, wood or steel, is that: one that takes the part's
  // colour is the part's, as the light look draws it)
  made.color = material.tinted
    ? skinColour(part, part.skins[index], false, colour, "light")
    : new THREE.Color(material.colour)
  if (material.glow) made.emissive = made.color.clone()
  made.side = THREE.DoubleSide
  made.name = chosen ? material.id : part.part.id
  return made
}

/**
 * The GLB of the parts given (every part, if none are), as a page would show them. The
 * colours and materials are the ones the user has given parts, by part.
 */
export async function webModel(
  loaded: WebSource,
  {
    parts: only = null,
    colours = {},
    materials = {},
  }: {
    parts?: string[] | null
    colours?: Record<string, string>
    materials?: Record<string, PartMaterial>
  } = {}
): Promise<ArrayBuffer> {
  const { model } = loaded
  const scene = new THREE.Scene()
  scene.name = model.title ?? "model"
  const groups = new Map<string, THREE.Object3D>()
  const groupOf = (id: string) => {
    let found = groups.get(id)
    if (!found) {
      found = new THREE.Group()
      found.name = id
      const label = model.groups.find((group) => group.id === id)?.label
      if (label) found.userData = { label }
      groups.set(id, found)
    }
    return found
  }
  const made: THREE.BufferGeometry[] = []
  for (const part of loaded.parts) {
    if (only && !only.includes(part.part.id)) continue
    const node = new THREE.Group()
    node.name = part.part.id
    node.userData = { label: part.part.label }
    // Where the part sits, in metres: the place the model gives it, turned and scaled to
    // glTF's, with the scale taken back off it and put into the corners themselves, so
    // that the node holds no more than a turn and a move.
    new THREE.Matrix4()
      .multiplyMatrices(TO_GLTF, part.home)
      .multiply(FROM_METRES)
      .decompose(node.position, node.quaternion, node.scale)
    part.skins.forEach((skin, index) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        "position",
        skin.geometry.attributes.position.clone()
      )
      if (skin.geometry.attributes.normal)
        geometry.setAttribute("normal", skin.geometry.attributes.normal.clone())
      if (skin.geometry.index) geometry.setIndex(skin.geometry.index.clone())
      geometry.applyMatrix4(TO_METRES)
      made.push(geometry)
      const mesh = new THREE.Mesh(
        geometry,
        surfaceOf(
          part,
          index,
          colours[part.part.id] ?? null,
          materials[part.part.id] ?? null
        )
      )
      mesh.name =
        part.skins.length > 1 ? `${part.part.id}-${index + 1}` : part.part.id
      node.add(mesh)
    })
    groupOf(part.part.group).add(node)
  }
  // the groups in the model's order
  for (const group of model.groups) {
    const found = groups.get(group.id)
    if (found) scene.add(found)
  }
  for (const [id, found] of groups)
    if (!model.groups.some((group) => group.id === id)) scene.add(found)
  try {
    const out = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      onlyVisible: false,
      // (a move and a turn, and no matrix: what a page that moves a part sets)
      trs: true,
    })
    if (!(out instanceof ArrayBuffer))
      throw new Error("no binary glTF came out")
    return out
  } finally {
    for (const geometry of made) geometry.dispose()
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh)
        (object.material as THREE.Material).dispose()
    })
  }
}

/**
 * What the whole model's script and page are saved with, besides its GLB: its parts as
 * its tools are told of them (as the view tells them, see viewport.tsx), and the colours
 * a tool can give a part, as the light look has them.
 */
export function webPageOf(loaded: WebSource): WebPage {
  return {
    title: loaded.model.title ?? "Model",
    parts: loaded.parts.map((part) => {
      const box = part.box.clone().applyMatrix4(part.home)
      return {
        id: part.part.id,
        label: part.part.label,
        group: part.part.group,
        min: box.min.toArray(),
        max: box.max.toArray(),
      }
    }),
    palette: { ...currentPalette("light") },
    // (the version of three the app draws with, from the web: 0.186, its latest fix)
    three: `0.${THREE.REVISION}`,
  }
}
