import { beforeEach, describe, expect, it, vi } from "vitest"

import { SETTLE_DAYS } from "./conversations"
import { PRESETS } from "./navigation"

// What was chosen is kept in the window's storage, and read from it as the app
// starts: so each of these starts it afresh, over what it is to find there.
const KEY = "enclose:preferences"
const kept = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
})

/** The preferences, as the app has them on starting with this kept. */
async function started(found?: unknown) {
  kept.clear()
  if (found !== undefined)
    kept.set(KEY, typeof found === "string" ? found : JSON.stringify(found))
  vi.resetModules()
  const { usePreferences } = await import("./preferences")
  return usePreferences
}

beforeEach(() => kept.clear())

describe("the preferences", () => {
  it("are what the app comes with, where nothing was chosen", async () => {
    const preferences = (await started()).getState()
    expect(preferences).toMatchObject({
      scrolling: "auto",
      ...PRESETS.enclose,
      turnSpeed: 1,
      zoomSpeed: 1,
      wheelReversed: false,
      upright: false,
      pivot: "view",
      settleDays: SETTLE_DAYS.initial,
      thinkingTokens: false,
      units: "mm",
      datedFiles: true,
      format: "step",
    })
  })

  it("are what was chosen, where that was kept", async () => {
    const chosen = {
      scrolling: "wheel",
      ...PRESETS.fusion,
      turnSpeed: 1.5,
      zoomSpeed: 0.6,
      wheelReversed: true,
      upright: true,
      pivot: "pointer",
      settleDays: 14,
      thinkingTokens: true,
      units: "in",
      datedFiles: false,
      format: "obj",
    }
    expect((await started(chosen)).getState()).toMatchObject(chosen)
  })

  it("take nothing that is no choice there is, each thing by itself", async () => {
    const preferences = (
      await started({
        scrolling: "sideways",
        middle: "spin",
        // (the right button turns or pans: it is never what zooms)
        right: "zoom",
        shift: "turn",
        pivot: "corner",
        units: "cm",
        wheelReversed: "yes",
        datedFiles: 0,
        thinkingTokens: "yes",
        format: "3mf",
      })
    ).getState()
    expect(preferences).toMatchObject({
      scrolling: "auto",
      middle: PRESETS.enclose.middle,
      right: PRESETS.enclose.right,
      shift: "turn",
      pivot: "view",
      units: "mm",
      wheelReversed: false,
      datedFiles: true,
      thinkingTokens: false,
      format: "step",
    })
  })

  it("keep a speed, and how long a conversation is left, within what they may be", async () => {
    const { TURN_SPEED, ZOOM_SPEED } = await import("./preferences")
    expect(
      (
        await started({ turnSpeed: 40, zoomSpeed: 0, settleDays: 9000 })
      ).getState()
    ).toMatchObject({
      turnSpeed: TURN_SPEED.max,
      zoomSpeed: ZOOM_SPEED.min,
      settleDays: SETTLE_DAYS.max,
    })
    expect(
      (
        await started({ turnSpeed: "fast", zoomSpeed: null, settleDays: 2.5 })
      ).getState()
    ).toMatchObject({
      turnSpeed: 1,
      zoomSpeed: 1,
      settleDays: SETTLE_DAYS.initial,
    })
  })

  it("are what the app comes with, where what was kept does not read", async () => {
    expect((await started("{not json")).getState()).toMatchObject({
      scrolling: "auto",
      units: "mm",
    })
  })

  it("keep what is changed, and of it only what was chosen", async () => {
    const preferences = await started()
    preferences.getState().change({ units: "in", turnSpeed: 2 })
    expect(preferences.getState()).toMatchObject({ units: "in", turnSpeed: 2 })
    const written = JSON.parse(kept.get(KEY)!) as Record<string, unknown>
    expect(written).toMatchObject({ units: "in", turnSpeed: 2, pivot: "view" })
    expect(written).not.toHaveProperty("change")
    expect((await started(written)).getState().units).toBe("in")
  })
})
