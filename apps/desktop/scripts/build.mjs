// Production build: the window into dist/, the Electron side into dist-electron/, and with
// them what of other people's code went into either, and under what terms
// (scripts/licenses.mjs). `npm start` then runs the result.
import path from "node:path"

import { build as bundle } from "esbuild"
import { build as buildWindow } from "vite"

import { guide, main, preload, web } from "./electron-build.mjs"
import { writeLicenses } from "./licenses.mjs"

const window = await buildWindow()
const [, , page] = await Promise.all([
  bundle(main),
  bundle(preload),
  bundle({ ...guide, metafile: true }),
  bundle(web),
])

// the files each bundler took, as paths: Vite's modules, and esbuild's inputs
const outputs = (Array.isArray(window) ? window : [window]).flatMap(
  (one) => one.output ?? []
)
const bundled = [
  ...outputs.flatMap((chunk) => Object.keys(chunk.modules ?? {})),
  ...Object.keys(page.metafile.inputs).map((input) =>
    path.resolve(import.meta.dirname, "..", input)
  ),
]
  .map((id) => id.replace(/^\0/, "").replace(/\?.*$/, ""))
  .filter((id) => id.includes("node_modules"))
const counted = writeLicenses(bundled)
console.log(`Third-party licenses: ${counted} packages`)
