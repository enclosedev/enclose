// What a model is saved for the web as, beside its GLB (src/components/viewport/web.ts):
// a script that makes it move as the project's tools move it in the app, and a page
// that shows it with their controls. All three go in the project's web folder, under the
// model's name, and are written over each time it is saved again.
//
//   web/clock.glb     the model
//   web/clock.js      the tools, and what runs them on the GLB's nodes (src/web/runtime.ts)
//   web/clock.html    a page of the model and the tools' controls, to see it by, and to
//                     take from for a page of one's own
//
// A page that loads modules is not opened from a file: the app serves the folder to this
// machine to be looked at (WebPreview), and anywhere else it is served as any site is.
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"

import type { ToolSource, WebPage } from "../shared/api"
import { WEB_FOLDER } from "../shared/manifest-format"
import { resolveInside } from "./projects"

/**
 * A tool's file as a function that makes it: what it exports by default is what the
 * function gives. A tool is plain JavaScript that imports nothing (see kit/tools.md),
 * so its `export`s are all there is of a module in it.
 */
export function toolMaker(source: string): string {
  const body = source
    .replace(/^([ \t]*)export\s+default\s+/m, "$1made = ")
    .replace(
      /^([ \t]*)export\s+(?=(async\s+)?function|const|let|var|class)/gm,
      "$1"
    )
  return `() => {\n"use strict"\nlet made\n${body}\nreturn made\n}`
}

/**
 * The script saved as web/<name>.js: the runtime (bundled by itself, as a script that
 * gives `EncloseRuntime`), the project's tools, and the model's parts as the tools are
 * told of them.
 */
export function webScript(
  name: string,
  runtime: string,
  tools: ToolSource[],
  page: Pick<WebPage, "parts" | "palette">
): string {
  return `// ${name}.js, saved by Enclose with ${name}.glb: the model's own tools, which move it
// as they do in the app. Saved over each time the model is saved for the web again.
//
//   import { enclose } from "./${name}.js"
//
//   const gltf = await new GLTFLoader().loadAsync("./${name}.glb")
//   scene.add(gltf.scene)
//   const model = enclose(gltf.scene)
//
//   model.tools                        // each tool: { id, name, controls }
//   model.set(tool, control, value)    // set a control, as a hand would
//   model.press(tool, control, option) // press one of a row of buttons
//   model.onChange((tool) => ...)      // a tool's controls changed
//   model.update()                     // each frame, before drawing: moves the parts
//
// Each part is the node of its id, in metres with Y up. ${name}.html shows it all at work.

${runtime.trim()}

const tools = [
${tools.map((tool) => `  { id: ${JSON.stringify(tool.id)}, load: ${toolMaker(tool.source)} },`).join("\n")}
]

const data = ${JSON.stringify({ parts: page.parts, palette: page.palette })}

export function enclose(root) {
  return EncloseRuntime.enclose(root, data, tools)
}
`
}

const escaped = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[one]!
  )

/** The page saved as web/<name>.html. */
export function webPage(name: string, page: Pick<WebPage, "title" | "three">) {
  const three = `https://cdn.jsdelivr.net/npm/three@${page.three}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaped(page.title)}</title>
<!-- Saved by Enclose with ${name}.glb and ${name}.js, and saved over with them. Served
     from this folder, it shows the model and its tools' controls; opened as a file, a
     browser will not load it. -->
<style>
  :root { color-scheme: light dark; --bg: #f3f3f1; --panel: #ffffffd9; --ink: #1d1d1f; --soft: #6e6e73; --line: #0000001a; --on: #1d1d1f; --on-ink: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161617; --panel: #232325d9; --ink: #f2f2f2; --soft: #9a9aa0; --line: #ffffff1f; --on: #f2f2f2; --on-ink: #161617; } }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.4 system-ui, -apple-system, sans-serif; }
  canvas { display: block; width: 100%; height: 100%; }
  #tools { position: fixed; top: 16px; right: 16px; width: 260px; max-height: calc(100% - 32px); overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  #tools:empty { display: none; }
  section { background: var(--panel); backdrop-filter: blur(16px); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
  .control { margin: 10px 0 0; }
  .title { display: flex; justify-content: space-between; gap: 8px; font-weight: 500; }
  .says { color: var(--soft); font-variant-numeric: tabular-nums; }
  .about { color: var(--soft); font-size: 12px; margin: 1px 0 6px; }
  input[type=range] { width: 100%; accent-color: var(--on); }
  select { width: 100%; font: inherit; padding: 4px 6px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; }
  .row { display: flex; flex-wrap: wrap; gap: 4px; }
  button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
  button[aria-pressed=true] { background: var(--on); color: var(--on-ink); border-color: var(--on); }
  @media (max-width: 600px) { #tools { top: auto; bottom: 16px; left: 16px; width: auto; max-height: 45%; } }
</style>
<script type="importmap">
{ "imports": { "three": "${three}/build/three.module.js", "three/addons/": "${three}/examples/jsm/" } }
</script>
</head>
<body>
<canvas></canvas>
<div id="tools"></div>
<script type="module">
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { enclose } from "./${name}.js"

const canvas = document.querySelector("canvas")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture
const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 1000)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

const gltf = await new GLTFLoader().loadAsync("./${name}.glb")
scene.add(gltf.scene)
const model = enclose(gltf.scene)

// the camera a little above the model and to its right, all of it in sight
const box = new THREE.Box3().setFromObject(gltf.scene)
const middle = box.getCenter(new THREE.Vector3())
const reach = box.getSize(new THREE.Vector3()).length() || 1
camera.near = reach / 100
camera.far = reach * 100
camera.position.copy(middle).add(new THREE.Vector3(0.7, 0.55, 1).multiplyScalar(reach * 1.1))
controls.target.copy(middle)

const panel = document.getElementById("tools")
function fit() {
  const { clientWidth: width, clientHeight: height } = canvas
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  // the model in the middle of the room the panel leaves it, where the panel is at its side
  const side = panel.childElementCount > 0 && width > 600 ? panel.offsetWidth + 32 : 0
  if (side) camera.setViewOffset(width + side, height, side, 0, width, height)
  else camera.clearViewOffset()
  camera.updateProjectionMatrix()
}
addEventListener("resize", fit)
fit()
renderer.setAnimationLoop(() => {
  model.update()
  controls.update()
  renderer.render(scene, camera)
})

// The tools' controls, drawn plainly: each kind as the nearest thing a page has to it
function el(tag, { dataset = {}, ...props } = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props)
  Object.assign(node.dataset, dataset)
  node.append(...children)
  return node
}
const labelOf = (option) => option.label || option.icon || option.id

function controlOf(tool, control) {
  const set = (value) => model.set(tool.id, control.id, value)
  const head = el("div", { className: "title" }, [el("span", { textContent: control.title })])
  const says = control.says ?? (control.kind === "slider" ? String(control.value) : "")
  if (says) head.append(el("span", { className: "says", textContent: says }))
  const parts = [head]
  if (control.description) parts.push(el("div", { className: "about", textContent: control.description }))
  const range = (min, max, step, value, onInput) =>
    el("input", { type: "range", min, max, step: step || "any", value, oninput: (event) => onInput(Number(event.target.value)) })
  switch (control.kind) {
    case "slider":
      parts.push(range(control.min, control.max, control.step, control.value, set))
      break
    case "pad":
      parts.push(
        range(control.x.min, control.x.max, 0, control.value[0], (x) => set([x, control.value[1]])),
        range(control.y.min, control.y.max, 0, control.value[1], (y) => set([control.value[0], y]))
      )
      break
    case "toggle":
      parts.push(el("div", { className: "row" }, [
        el("button", { textContent: control.value ? "On" : "Off", ariaPressed: String(control.value), onclick: () => set(!control.value) }),
      ]))
      break
    case "choice":
    case "buttons":
      parts.push(el("div", { className: "row" }, control.options.map((option) =>
        el("button", {
          textContent: labelOf(option),
          ariaPressed: String(control.kind === "choice" && control.value === option.id),
          onclick: () => control.kind === "choice" ? set(option.id) : model.press(tool.id, control.id, option.id),
        })
      )))
      break
    case "list":
    case "palette": {
      const options = control.options.map((option) => typeof option === "string" ? { id: option, label: option } : option)
      parts.push(el("select", { onchange: (event) => set(event.target.value) }, options.map((option) =>
        el("option", { value: option.id, textContent: labelOf(option), selected: option.id === control.value })
      )))
      break
    }
    case "readout":
      head.append(el("span", { className: "says", textContent: control.value }))
      break
  }
  return el("div", { className: "control", dataset: { control: control.id } }, parts)
}

function show(tool) {
  const shown = el("section", { dataset: { tool: tool.id } }, [
    el("h2", { textContent: tool.name }),
    ...tool.controls.map((control) => controlOf(tool, control)),
  ])
  const before = panel.querySelector(\`section[data-tool="\${tool.id}"]\`)
  // (not under a hand that is on a slider: it would let go of it)
  if (before?.contains(document.activeElement) && document.activeElement.type === "range") {
    for (const control of tool.controls) {
      const says = before.querySelector(\`[data-control="\${control.id}"] .says\`)
      if (says && control.says) says.textContent = control.says
    }
    return
  }
  if (before) before.replaceWith(shown)
  else panel.append(shown)
}
model.tools.forEach(show)
fit()
model.onChange((id) => {
  const tool = model.tools.find((one) => one.id === id)
  if (tool) show(tool)
  else panel.querySelector(\`section[data-tool="\${id}"]\`)?.remove()
})
</script>
</body>
</html>
`
}

/** What a file is, as a content type says it. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mid": "audio/midi",
}

/**
 * Serves a project's web folder, to this machine only, for as long as the app is open:
 * so that its page can be looked at as a site would show it. Where it is is known only
 * to whoever the app opened a browser for, the address having a key in it that is made
 * when the app starts.
 */
export class WebPreview {
  private server: http.Server | null = null
  private port: Promise<number> | null = null
  private readonly key = randomBytes(18).toString("base64url")
  private readonly folder: (id: string) => string | null

  /** `folder` says where a project is, by its id. */
  constructor(folder: (id: string) => string | null) {
    this.folder = folder
  }

  private listen(): Promise<number> {
    this.port ??= new Promise<number>((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.handle(request, response).catch(() => {
          if (!response.headersSent) response.writeHead(500)
          response.end()
        })
      })
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        this.server = server
        resolve((server.address() as AddressInfo).port)
      })
    })
    return this.port
  }

  private async handle(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ) {
    const send = (status: number, type?: string, body?: Buffer) =>
      response
        .writeHead(status, {
          ...(type ? { "content-type": type } : {}),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        })
        .end(body)
    if (request.method !== "GET" && request.method !== "HEAD") return send(405)
    // /<key>/<project>/<file in its web folder>
    const [, key, projectId, ...rest] = decodeURIComponent(
      (request.url ?? "").split("?")[0]
    ).split("/")
    const root = key === this.key ? this.folder(projectId ?? "") : null
    const file =
      root && resolveInside(path.join(root, WEB_FOLDER), rest.join("/"))
    if (!file) return send(404)
    try {
      const type =
        MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"
      send(200, type, await fs.promises.readFile(file))
    } catch {
      send(404)
    }
  }

  /** Where a page in a project's web folder is served, for a browser to be opened at. */
  async address(projectId: string, page: string): Promise<string> {
    const port = await this.listen()
    return `http://127.0.0.1:${port}/${this.key}/${projectId}/${encodeURIComponent(page)}`
  }

  close() {
    this.server?.close()
    this.server = null
    this.port = null
  }
}
