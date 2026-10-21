// A tool that tries to get out of where it is run, for `npm run sandbox`: every way to
// the network that a worker comes with, and what else a tool has no call for. It is
// run by the app as any project's tool is, and says what came of each way in the one
// thing a tool has to say anything with, a readout.
//
// Each try is at a listening post on this machine, which the check that wrote this
// file in keeps (its address stands where __POST__ does): so whatever gets through is
// heard there, whatever this file says of it.
const POST = "http://__POST__/"
const SOCKET = "ws://__POST__/"

/** What a worker may have of its own that is a way out, and what its navigator may. */
const OF_THE_WORKER = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebSocketStream",
  "WebTransport",
  "EventSource",
  "importScripts",
  "FontFace",
  "fonts",
  "RTCPeerConnection",
  "indexedDB",
  "caches",
  "BroadcastChannel",
  "Worker",
  "SharedWorker",
  "Notification",
]
const OF_ITS_NAVIGATOR = [
  "sendBeacon",
  "serviceWorker",
  "storage",
  "storageBuckets",
  "locks",
  "usb",
  "hid",
  "serial",
  "bluetooth",
]

/**
 * Everything of a name that is to be had from a thing, wherever along its line it is
 * kept: on itself, or on its kind, or on its kind's kind. Each with how far up that is.
 */
function reached(name, from = self) {
  const all = []
  for (let at = from, up = 0; at; at = Object.getPrototypeOf(at), up++) {
    const kept = Object.getOwnPropertyDescriptor(at, name)
    if (!kept) continue
    let value
    try {
      value = kept.get ? kept.get.call(from) : kept.value
    } catch {
      // not to be had by asking: not there
    }
    if (value !== undefined && value !== null) all.push({ up, value })
  }
  return all
}

const found = {
  /** the ways out that are still to be had, each with how far up the line it was found */
  there: [],
  /** what came of trying each way out: it got through, or how it was refused */
  tried: {},
  /** what came of something a tool is let do: so that it is known the trying works */
  could: {},
}
let done = false

const THROUGH = "GOT THROUGH"
const soon = (ms) =>
  new Promise((resolve) => setTimeout(() => resolve("refused (no answer)"), ms))

/** Try something, and keep what came of it. */
async function attempt(into, way, does) {
  try {
    into[way] = String(
      await Promise.race([Promise.resolve().then(does), soon(1500)])
    )
  } catch (error) {
    const said = String(error?.message ?? error).slice(0, 100)
    into[way] = `refused (${error?.name ?? "Error"}: ${said})`
  }
}
const tried = (way, does) => attempt(found.tried, way, does)
/** Something that says how it went when it has gone one way or the other. */
const settled = (make) =>
  new Promise((resolve, reject) =>
    make(
      () => resolve(THROUGH),
      () => reject(new Error("it failed"))
    )
  )

async function tryAll() {
  for (const name of OF_THE_WORKER)
    for (const { up } of reached(name)) found.there.push(`${name} (${up} up)`)
  for (const name of OF_ITS_NAVIGATOR)
    for (const { up } of reached(name, navigator))
      found.there.push(`navigator.${name} (${up} up)`)

  await attempt(found.could, "import a module of its own making", async () => {
    const url = URL.createObjectURL(
      new Blob(["export default 7"], { type: "text/javascript" })
    )
    return (await import(url)).default === 7 ? "allowed" : "not what it made"
  })

  await Promise.all([
    ...reached("fetch").map(({ up, value }) =>
      tried(`fetch (${up} up)`, async () => {
        await value.call(self, `${POST}fetch-${up}`, { mode: "no-cors" })
        return THROUGH
      })
    ),
    ...reached("XMLHttpRequest").map(({ up, value }) =>
      tried(`XMLHttpRequest (${up} up)`, () =>
        settled((through, failed) => {
          const request = new value()
          request.open("GET", `${POST}xhr-${up}`)
          request.onload = through
          request.onerror = failed
          request.send()
        })
      )
    ),
    ...reached("WebSocket").map(({ up, value }) =>
      tried(`WebSocket (${up} up)`, () =>
        settled((through, failed) => {
          const socket = new value(`${SOCKET}websocket-${up}`)
          socket.onopen = through
          socket.onerror = failed
        })
      )
    ),
    ...reached("EventSource").map(({ up, value }) =>
      tried(`EventSource (${up} up)`, () =>
        settled((through, failed) => {
          const source = new value(`${POST}eventsource-${up}`)
          source.onopen = through
          source.onerror = failed
        })
      )
    ),
    ...reached("importScripts").map(({ up, value }) =>
      tried(`importScripts (${up} up)`, () => {
        value.call(self, `${POST}importscripts-${up}.js`)
        return THROUGH
      })
    ),
    ...reached("FontFace").map(({ up, value }) =>
      tried(`FontFace (${up} up)`, async () => {
        await new value("escape", `url(${POST}font-${up}.woff2)`).load()
        return THROUGH
      })
    ),
    // a worker of its own would come with all of these afresh
    ...reached("Worker").map(({ up, value }) =>
      tried(
        `Worker (${up} up)`,
        () =>
          new Promise((resolve, reject) => {
            const inside = `fetch(${JSON.stringify(`${POST}worker-${up}`)}, { mode: "no-cors" }).then(() => postMessage("${THROUGH}"), (error) => postMessage("refused (inside it: " + error.message + ")"))`
            const worker = new value(
              URL.createObjectURL(
                new Blob([inside], { type: "text/javascript" })
              )
            )
            worker.onmessage = (event) => resolve(event.data)
            worker.onerror = (event) =>
              reject(new Error(event.message || "it failed"))
          })
      )
    ),
    ...reached("sendBeacon", navigator).map(({ up, value }) =>
      tried(`navigator.sendBeacon (${up} up)`, () =>
        value.call(navigator, `${POST}beacon-${up}`) ? THROUGH : "refused"
      )
    ),
    // and what no list of names takes away: code from somewhere else, or made up
    tried("import from an address", async () => {
      await import(`${POST}import.js`)
      return THROUGH
    }),
    tried("eval", () => `${THROUGH} with ${(0, eval)("6 * 7")}`),
    tried(
      "new Function",
      () => `${THROUGH} with ${new Function("return 6 * 7")()}`
    ),
    tried(
      "a timer given words to run",
      () =>
        new Promise((resolve) => {
          self.ran = () => resolve(THROUGH)
          setTimeout("self.ran()", 0)
          setTimeout(() => resolve("refused (they never ran)"), 500)
        })
    ),
  ])
  done = true
}
void tryAll()

export default {
  name: "Escape",
  controls: {
    found: {
      kind: "readout",
      title: "Found",
      description: "What came of each way out.",
      value: "",
    },
  },
  frame(tool) {
    if (done) tool.set("found", `ESCAPE ${JSON.stringify(found)}`)
  },
}
