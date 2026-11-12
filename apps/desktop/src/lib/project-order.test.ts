import { describe, expect, it } from "vitest"

import type { ConversationSummary, Project } from "@shared/api"
import { inOrder } from "./project-order"

/** A project of a group, with conversations last asked in at these times. */
const project = (
  id: string,
  group: { id: string; addedAt: number; pinned?: boolean },
  asked: (number | null)[] = []
) =>
  ({
    id,
    group: { name: null, pinned: false, ...group },
    conversations: asked.map((askedAt) => ({ askedAt }) as ConversationSummary),
  }) as unknown as Project

const ids = (projects: Project[]) => projects.map((one) => one.id)

describe("the order projects are listed in", () => {
  // as the app's own process hands them over: pinned, then the one made last first
  const pinned = { id: "p", addedAt: 1, pinned: true }
  const newest = { id: "n", addedAt: 300 }
  const older = { id: "o", addedAt: 200 }
  const oldest = { id: "x", addedAt: 100 }
  const handed = [
    project("p1", pinned, [50]),
    project("n1", newest),
    project("o1", older, [250]),
    project("o2", older, [900, null]),
    project("x1", oldest, [500]),
  ]

  it("is as they were handed over, by when they were made", () => {
    expect(ids(inOrder(handed, "created"))).toEqual([
      "p1",
      "n1",
      "o1",
      "o2",
      "x1",
    ])
  })

  it("is by the last message in any of a group's projects, the latest first", () => {
    expect(ids(inOrder(handed, "asked"))).toEqual([
      "p1",
      "o1",
      "o2",
      "x1",
      "n1",
    ])
  })

  it("has a group made since the last message at the top", () => {
    const fresh = { id: "f", addedAt: 1000 }
    expect(ids(inOrder([project("f1", fresh), ...handed], "asked"))).toEqual([
      "p1",
      "f1",
      "o1",
      "o2",
      "x1",
      "n1",
    ])
  })

  it("keeps groups with nothing asked in them in the order they were made", () => {
    const quiet = [
      project("n1", newest),
      project("o1", older),
      project("x1", oldest),
    ]
    expect(ids(inOrder(quiet, "asked"))).toEqual(["n1", "o1", "x1"])
  })

  it("is the order they were dragged to, pinned ones still first", () => {
    const second = { id: "q", addedAt: 2, pinned: true }
    const all = [project("q1", second), ...handed]
    expect(ids(inOrder(all, "manual", ["n", "x", "p", "o", "q"]))).toEqual([
      "p1",
      "q1",
      "n1",
      "x1",
      "o1",
      "o2",
    ])
  })

  it("has a group not dragged anywhere yet at the top, as it came", () => {
    expect(ids(inOrder(handed, "manual", ["x", "o"]))).toEqual([
      "p1",
      "n1",
      "x1",
      "o1",
      "o2",
    ])
  })
})
