// The app's examples are not in the app: each is fetched as one archive, from a release
// of the app's repository. This packs them, every folder in examples/ that the list in
// shared/examples.json names, into release/examples/, and writes into that list how big
// each archive is and its SHA-256, which is how the app knows what it has fetched is the
// example. It is only needed when an example has been changed; the archives then go up
// as a release under a new name (the list says which), since an app already made goes
// on fetching the ones it was made with:
//   npm run examples
//   gh release create <release> release/examples/*.tar.br --title "Examples" --latest=false
// (the repository's latest release is the app's own: the README sends people there)
// The same files make the same archive, so packing what has not changed changes nothing.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

// (Node reads this as it is, from 22.18 on: the app unpacks with what this packs with)
import { pack } from "../electron/archive.ts"

const ROOT = resolve(import.meta.dirname, "..")
const EXAMPLES = resolve(ROOT, "../../examples")
const LIST = join(ROOT, "shared/examples.json")
const OUT = join(ROOT, "release/examples")

const list = JSON.parse(readFileSync(LIST, "utf8"))
mkdirSync(OUT, { recursive: true })
for (const example of list.examples) {
  const packed = pack(join(EXAMPLES, example.id))
  writeFileSync(join(OUT, `${example.id}.tar.br`), packed)
  example.bytes = packed.length
  example.sha256 = createHash("sha256").update(packed).digest("hex")
  console.log(
    `${example.id}.tar.br  ${(packed.length / 1e6).toFixed(1)} MB  ${example.sha256}`
  )
}

// one example to a line, as the list is kept
const lines = list.examples.map((example) => `    ${oneLine(example)}`)
writeFileSync(
  LIST,
  `{\n  "release": ${JSON.stringify(list.release)},\n  "examples": [\n${lines.join(",\n")}\n  ]\n}\n`
)

function oneLine(example) {
  const fields = Object.entries(example).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`
  )
  return `{ ${fields.join(", ")} }`
}
