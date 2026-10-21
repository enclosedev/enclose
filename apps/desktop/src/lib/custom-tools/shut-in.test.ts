import { describe, expect, it } from "vitest"

import { shutIn, WAYS_OUT, WAYS_OUT_BESIDES } from "./shut-in"

/**
 * A worker as a browser makes one: what it can do is mostly not its own, but its
 * kind's, and its kind's kind's. Some of it is had by asking (`indexedDB`), and some is
 * the worker's own (`WebSocket`).
 */
function worker() {
  class Navigator {
    get storage() {
      return { getDirectory: () => "the app's own files" }
    }
    get usb() {
      return { getDevices: () => [] }
    }
    get userAgent() {
      return "Enclose"
    }
  }
  class Scope {
    fetch() {
      return "out"
    }
    importScripts() {
      return "out"
    }
    get indexedDB() {
      return { open: () => "out" }
    }
    setTimeout() {
      return 1
    }
  }
  class Dedicated extends Scope {
    postMessage() {}
  }
  const scope = Object.assign(new Dedicated(), {
    WebSocket: class {},
    Notification: class {},
    Math,
    navigator: new Navigator(),
  })
  return { scope, Scope, Navigator }
}

/** Everything of this name there is to be had from a thing, wherever along its line it is kept. */
function had(from: object, name: string): unknown[] {
  const all: unknown[] = []
  for (let at: object | null = from; at; at = Object.getPrototypeOf(at)) {
    const kept = Object.getOwnPropertyDescriptor(at, name)
    if (!kept) continue
    const value: unknown = kept.get ? kept.get.call(from) : kept.value
    if (value !== undefined) all.push(value)
  }
  return all
}

describe("shutIn", () => {
  it("takes a way out away from the worker itself", () => {
    const { scope } = worker()
    shutIn(scope)
    expect(scope.WebSocket).toBeUndefined()
    expect(scope.Notification).toBeUndefined()
  })

  it("takes it away from further up the worker's line, where it is mostly kept", () => {
    const { scope, Scope } = worker()
    expect(had(scope, "fetch")).toHaveLength(1)
    shutIn(scope)
    expect(scope.fetch).toBeUndefined()
    expect(had(scope, "fetch")).toEqual([])
    expect(had(scope, "importScripts")).toEqual([])
    expect(Scope.prototype.fetch).toBeUndefined()
  })

  it("takes away what is had by asking, as well as what is simply there", () => {
    const { scope } = worker()
    shutIn(scope)
    expect(scope.indexedDB).toBeUndefined()
    expect(had(scope, "indexedDB")).toEqual([])
  })

  it("leaves no way to put any of it back", () => {
    const { scope, Scope } = worker()
    shutIn(scope)
    const back = { value: () => "out", configurable: true }
    expect(() => Object.defineProperty(Scope.prototype, "fetch", back)).toThrow(
      TypeError
    )
    expect(() => Object.defineProperty(scope, "WebSocket", back)).toThrow(
      TypeError
    )
    expect(Reflect.deleteProperty(Scope.prototype, "fetch")).toBe(false)
  })

  it("takes away what the worker's navigator gives of them, and leaves the rest of it", () => {
    const { scope } = worker()
    shutIn(scope)
    expect(scope.navigator.storage).toBeUndefined()
    expect(had(scope.navigator, "storage")).toEqual([])
    expect(had(scope.navigator, "usb")).toEqual([])
    expect(scope.navigator.userAgent).toBe("Enclose")
  })

  it("leaves a tool what it has a call for", () => {
    const { scope } = worker()
    shutIn(scope)
    expect(scope.setTimeout()).toBe(1)
    expect(scope.postMessage).toBeTypeOf("function")
    expect(scope.Math).toBe(Math)
  })

  it("says nothing was left when all of it was taken away", () => {
    const { scope } = worker()
    expect(shutIn(scope)).toEqual([])
  })

  it("says what it could not take away, and takes the rest all the same", () => {
    const { scope, Scope, Navigator } = worker()
    Object.defineProperty(Scope.prototype, "fetch", {
      value: () => "out",
      writable: false,
      configurable: false,
    })
    Object.defineProperty(Navigator.prototype, "usb", {
      get: () => ({ getDevices: () => [] }),
      configurable: false,
    })
    expect(shutIn(scope)).toEqual(["fetch", "navigator.usb"])
    expect(had(scope, "fetch")).toHaveLength(1)
    expect(had(scope, "importScripts")).toEqual([])
    expect(scope.WebSocket).toBeUndefined()
    expect(scope.navigator.storage).toBeUndefined()
  })

  it("says it of a way out taken from in front but left further up the line", () => {
    const { scope, Scope } = worker()
    // put on the worker itself, over its kind's, which cannot be taken
    Object.defineProperty(Scope.prototype, "fetch", {
      value: () => "out",
      writable: false,
      configurable: false,
    })
    Object.defineProperty(scope, "fetch", {
      value: () => "out",
      configurable: true,
    })
    expect(shutIn(scope)).toEqual(["fetch"])
    expect((scope as { fetch?: unknown }).fetch).toBeUndefined()
    expect(had(scope, "fetch")).toHaveLength(1)
  })

  it("is not stopped by a worker with no navigator", () => {
    const { scope } = worker()
    Reflect.deleteProperty(scope, "navigator")
    expect(shutIn(scope)).toEqual([])
    expect(had(scope, "importScripts")).toEqual([])
    expect(scope.WebSocket).toBeUndefined()
  })

  it("has in its lists every way to the network a worker comes with", () => {
    for (const way of [
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "importScripts",
      "WebTransport",
      "FontFace",
    ])
      expect(WAYS_OUT).toContain(way)
    expect(WAYS_OUT_BESIDES).toContain("sendBeacon")
  })
})
