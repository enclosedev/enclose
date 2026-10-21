// A picture of each kind of part on a circuit board, for the list of them in PCB mode:
// the part in 3D on its own, as the board has it, drawn off screen as the pictures of the
// boards are, and in the theme's colours as they are (see pictures.ts).
import * as React from "react"
import * as THREE from "three"

import type { BoardSummary } from "@shared/api"
import type { PcbColours } from "@shared/theme-format"
import { frame, stage } from "@/components/viewport/thumbnails"
import { useThemeColors } from "@/lib/css-color"
import { boardUrl } from "./boards"
import type { BoardPart } from "./parts"
import { keptPictures } from "./kept"
import { BOARD_FROM, disposeBoard, inBoardColours, loadBoard } from "./pictures"

/** Pixels a side: twice the size they are shown at, for sharp screens. */
const PICTURE = 240
/** How much of its picture a part fills. */
const FILL = 0.72
/** How thick a part with no 3D of its own is drawn: a plain block the size it takes up, mm. */
const BLOCK = 1

/**
 * The pictures drawn, by board, by when it was built, by kind of part, and by the
 * colours it was drawn in (as JSON). Those of a build before the latest are let go of,
 * and so are the least looked at past a few boards' worth.
 */
const pictured = keptPictures(400)
const pictureOf = (
  projectId: string,
  board: BoardSummary,
  part: BoardPart,
  colours: string
) =>
  [`${projectId}:${board.id}`, board.built, `${part.key}:${colours}`] as const

/**
 * A picture of each of some kinds of part, handed over as a data URL as each is drawn:
 * the first of each, as the board has it in 3D, by itself. A part the board has no 3D
 * of is a grey block the size it takes up on the board.
 */
async function draw(
  projectId: string,
  board: BoardSummary,
  parts: BoardPart[],
  colours: PcbColours,
  each: (part: BoardPart, url: string) => void,
  stopped: () => boolean
) {
  const loaded = await loadBoard(boardUrl(projectId, board, "model")).catch(
    () => null
  )
  if (!loaded || stopped()) {
    if (loaded) disposeBoard(loaded)
    return
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(2)
  renderer.setSize(PICTURE / 2, PICTURE / 2, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // as PCB mode has them drawn (react-three-fiber's way)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const { scene } = stage()
  const camera = new THREE.OrthographicCamera()
  const meshes: THREE.Mesh[] = []
  loaded.traverse((thing) => {
    if (thing instanceof THREE.Mesh) meshes.push(thing)
  })
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1, BLOCK, 1),
    new THREE.MeshStandardMaterial({ color: "#5b5f66", roughness: 0.7 })
  )
  // (the block a grey as what is on the board is)
  inBoardColours(loaded, colours)
  inBoardColours(block, colours)
  scene.add(loaded)
  loaded.updateMatrixWorld(true)
  try {
    for (const part of parts) {
      if (stopped()) break
      const own = loaded.getObjectByName(part.names[0])
      const shown = new Set<THREE.Object3D>()
      own?.traverse((thing) => shown.add(thing))
      for (const mesh of meshes) mesh.visible = shown.has(mesh)
      let box: THREE.Box3
      if (own && meshes.some((mesh) => mesh.visible))
        box = new THREE.Box3().setFromObject(own)
      else if (part.size) {
        // (tscircuit's 3D lies flat with its top up Y)
        block.scale.set(part.size[0], 1, part.size[1])
        scene.add(block)
        block.updateMatrixWorld(true)
        box = new THREE.Box3().setFromObject(block)
      } else continue
      frame(camera, box, BOARD_FROM, FILL)
      renderer.render(scene, camera)
      scene.remove(block)
      each(part, renderer.domElement.toDataURL("image/png"))
      // (a moment between, for the window to be drawn meanwhile)
      await new Promise((done) => setTimeout(done))
    }
  } finally {
    disposeBoard(loaded)
    block.geometry.dispose()
    block.material.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/**
 * The pictures of the kinds of part on a board, by their keys, filling in as they are
 * drawn: once for each time the board is built, and none until it is built in 3D.
 */
export function usePartPictures(
  projectId: string,
  board: BoardSummary,
  parts: BoardPart[]
): Record<string, string> {
  const [, setDrawn] = React.useState(0)
  // (by what they are, and not by which object has them)
  const colours = JSON.stringify(useThemeColors().pcb)
  React.useEffect(() => {
    if (!board.model || board.built === null) return
    const wanted = parts.filter(
      (part) => !pictured.has(...pictureOf(projectId, board, part, colours))
    )
    if (wanted.length === 0) return
    let stopped = false
    void draw(
      projectId,
      board,
      wanted,
      JSON.parse(colours) as PcbColours,
      (part, url) => {
        pictured.set(...pictureOf(projectId, board, part, colours), url)
        if (!stopped) setDrawn((count) => count + 1)
      },
      () => stopped
    )
    return () => {
      stopped = true
    }
  }, [projectId, board, parts, colours])
  return Object.fromEntries(
    parts.flatMap((part) => {
      const url = pictured.get(...pictureOf(projectId, board, part, colours))
      return url ? [[part.key, url]] : []
    })
  )
}
