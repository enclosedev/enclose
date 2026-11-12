// What Claude is shown of a project that is not the one on screen. The view only ever has
// the open project in it, but an agent may be at work on another while the user looks at
// this one, and still wants to see what it made, and which parts there are. Its model is
// loaded off screen for the asking, by a renderer of its own, drawn as it would be on
// opening (from the front right and above, all of it in view, in the colours the user
// gave its parts) and let go of again: nothing of the open project's view changes.
import * as THREE from "three"

import type { Project } from "@shared/api"
import { solidColours } from "@shared/materials"
import { arranged, NOT_ARRANGED } from "@/lib/arrange"
import { readModel } from "@/lib/model"
import { useStore } from "@/lib/store"
import { disposeModel, loadModel, type LoadedModel } from "./load"
import { FOV, HOME_DIRECTION, toWorld } from "./rig"
import { stage, standing } from "./thumbnails"

/** How big the picture is, in pixels: as large as an image needs to be for Claude. */
const SIZE = { width: 1568, height: 1040 }
/** The room left round the model, as the view opens with it (rig's HOME_MARGIN). */
const MARGIN = 1.18

/** What Claude is told with a picture drawn this way, so it knows it is not the view. */
export const DRAWN_ELSEWHERE =
  "This project is not the one open in the app right now, so this was drawn off screen: all of the model as it opens, from the front, the right and above, in the colours the user gave its parts. How the user last had it in the view (camera, exploded, section, hidden parts) is not in it."

/** The project's model, loaded for the asking: let go of with disposeModel. */
async function load(project: Project): Promise<LoadedModel> {
  if (project.manifest === null)
    throw new Error("This project has no model yet: nothing has been built.")
  const source = await window.cad.model.read(project.id)
  if (!source) throw new Error("The model's manifest could not be read.")
  return loadModel(
    readModel(source.manifest),
    source.baseUrl,
    project.revision,
    () => {}
  )
}

/** Every part, as `parts` gives them for the open project (see viewport.tsx). */
function partsOf(project: Project, loaded: LoadedModel) {
  const state = useStore.getState()
  const { groups, of } = arranged(
    loaded.model,
    state.arranged[project.id] ?? NOT_ARRANGED,
    state.named[project.id] ?? {}
  )
  const called = new Map(groups.map((group) => [group.id, group.label]))
  const round = (n: number) => Math.round(n * 100) / 100
  return loaded.parts.map((part) => {
    const box = part.box.clone().applyMatrix4(part.home)
    const own = part.part.group
    const group = of.get(part.part.id) ?? own
    return {
      id: part.part.id,
      label: part.part.label,
      group,
      groupLabel: called.get(group) ?? group,
      ...(group !== own && { byHand: true }),
      min: box.min.toArray().map(round),
      max: box.max.toArray().map(round),
      faces: part.faces,
      color: state.colours[project.id]?.[part.part.id] ?? part.part.color,
      material: state.materials[project.id]?.[part.part.id] ?? null,
      // a project is opened with all of its parts on show
      shown: true,
    }
  })
}

/** Stand the camera where the view opens with all of what is in `box` in it. */
function home(camera: THREE.PerspectiveCamera, box: THREE.Box3) {
  const middle = box.getCenter(new THREE.Vector3())
  const toward = toWorld(HOME_DIRECTION)
  camera.position.copy(middle).add(toward)
  camera.lookAt(middle)
  camera.updateMatrixWorld()
  const high = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
  const wide = high * camera.aspect
  const turned = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse)
  const corner = new THREE.Vector3()
  let away = 0
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      )
      .sub(middle)
      .applyMatrix4(turned)
    // (the camera looks down its own -z: a corner toward it is nearer by that much)
    away = Math.max(
      away,
      corner.z + (Math.abs(corner.x) * MARGIN) / wide,
      corner.z + (Math.abs(corner.y) * MARGIN) / high
    )
  }
  away = away || 1
  camera.position.copy(middle).addScaledVector(toward, away)
  camera.near = away / 100
  camera.far = away * 10
  camera.updateProjectionMatrix()
}

/** The model as the view would open with it, as a JPEG over the window's background. */
function pictureOf(project: Project, loaded: LoadedModel) {
  const { colours, materials } = useStore.getState()
  const given = solidColours(
    colours[project.id] ?? {},
    materials[project.id] ?? {}
  )
  const dark = document.documentElement.classList.contains("dark")
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE.width, SIZE.height, false)
  renderer.setClearColor(0x000000, 0)
  const { scene, root } = stage()
  const stood = loaded.parts.map((part) =>
    standing(part, dark, given[part.part.id])
  )
  try {
    for (const { holder } of stood) root.add(holder)
    root.updateMatrixWorld(true)
    const camera = new THREE.PerspectiveCamera(
      FOV,
      SIZE.width / SIZE.height,
      0.1,
      1000
    )
    home(camera, new THREE.Box3().setFromObject(root))
    renderer.render(scene, camera)
    const canvas = document.createElement("canvas")
    canvas.width = SIZE.width
    canvas.height = SIZE.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not draw the model.")
    // the view is drawn over the window's background, and so is this
    context.fillStyle = getComputedStyle(
      document.getElementById("root")!.firstElementChild!
    ).backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(renderer.domElement, 0, 0)
    return {
      data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1],
      mimeType: "image/jpeg",
      note: DRAWN_ELSEWHERE,
    }
  } finally {
    for (const { dispose } of stood) dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/**
 * Answer what Claude asks of the view for a project that is not on screen: a picture of
 * its model, or its parts.
 */
export async function askedElsewhere(
  projectId: string,
  kind: "screenshot" | "parts"
): Promise<unknown> {
  const project = useStore
    .getState()
    .projects.find((one) => one.id === projectId)
  if (!project) throw new Error("There is no such project in the app.")
  const loaded = await load(project)
  try {
    return kind === "parts"
      ? partsOf(project, loaded)
      : pictureOf(project, loaded)
  } finally {
    disposeModel(loaded)
  }
}
