// The one description of the model manifest. The docs point here, and Claude is
// given this text when a folder has no model yet, so it can write one.

import { PALETTE_NAMES } from "./palette"

// the first is the name to write; the rest are what earlier projects wrote
export const MANIFEST_NAMES = [
  "enclose.model.json",
  "report.json",
  "model.json",
]

/** The file at the top of a project that says where its model is and how to build it. */
export const CONFIG_NAMES = ["enclose.json"]

/**
 * The manifest of a reference scene, and where in a project it is looked for: in a
 * folder of that name at the top, unless the project's enclose.json says where
 * ("reference"). kit/enclose.py writes one, and says there what is in it.
 */
export const REFERENCE_NAME = "enclose.reference.json"
export const REFERENCE_FOLDER = "reference"

/**
 * Where in a project the model is saved for a web page (a GLB the app makes of it, see
 * src/components/viewport/web.ts), and where the agent puts what else a page needs.
 */
export const WEB_FOLDER = "web"

export const MANIFEST_FORMAT = `A model is a folder holding one manifest (a JSON file named enclose.model.json) and the
files it names. Every path in the manifest is relative to the manifest. Units are
millimetres, Z is up.

A model is made of parts: each separate component is one part, with its own file. The
app lists the parts under groups, and lets the user look at one part or one group on
its own.

{
  "title": "Enclosure",                 // optional
  "reference": "table",                 // optional: the reference scene of the app's that the thing is best seen in, by where it is used
  "groups": [                            // how the parts list is grouped, in this order
    { "id": "enclosure", "label": "Enclosure", "shell": true },   // the outside: taken apart part by part when exploded
    { "id": "inside", "label": "Electronics" },
    { "id": "screws", "label": "Screws" }
  ],
  "parts": [
    {
      "id": "top",                       // unique, stable between builds
      "label": "Lid",                    // what the user reads: short, and says what the part is
      "group": "enclosure",              // the id of the group it is listed under
      "file": "top.glb",                 // glTF binary, Y-up metres (the build123d/OCCT default)
      "edges": "top.edges.bin",          // optional: float32 x1 y1 z1 x2 y2 z2 per edge segment, mm
      "color": "blue",                   // optional: one of ${PALETTE_NAMES.join(", ")}; any other colour is drawn as the nearest of them. Omit it to keep the colours in the file, or to be given one by the group
      "matrix": null,                    // optional: 16 numbers, row-major, placing the part
      "explode": [0, 0, 46],             // optional: where it goes when exploded, mm (worked out when no part says: the parts of a group that touch go together)
      "finish": "metal",                 // optional: "metal" is drawn as bare metal (screws, pins), "glass" see-through whatever the view (a window, a lens)
      "mesh": false,                     // optional: true for a part made of a mesh's triangles (STL, OBJ): its file is one primitive, shaded smooth where triangles meet at under 20°, with no face to trace a click to
      "board": "main"                    // optional: the name of the project's circuit board the part has in it (pcb/main.circuit.tsx); it is drawn in green, and no other part is then
    }
  ],
  "keepouts": [                          // optional: space something needs that is not modelled
    { "id": "usb0", "label": "USB-C plug", "min": [x, y, z], "max": [x, y, z], "hits": [] }
  ],
  "downloads": [                         // optional: files to hand out, e.g. STEP per part
    { "file": "step/top.step", "name": "top.step", "label": "Lid", "detail": "", "kind": "part", "part": "top", "bytes": 265106 }
  ]
}

Export one glTF primitive per CAD face (what build123d's export_gltf does): the app
merges them for speed and keeps the face order so a click can be traced to a face.`
