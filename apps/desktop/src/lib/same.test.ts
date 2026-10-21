import { describe, expect, it } from "vitest"

import { keptAsWas } from "./same"

/** A project as it comes, much shortened: new objects every time, whatever is in them. */
const project = (status = "idle", name = "Case") => ({
  id: "p",
  name,
  revision: 3,
  manifest: "model.json",
  bringingIn: null,
  conversations: [
    { id: "a", status, queued: [] as { id: string }[] },
    { id: "b", status: "idle", queued: [{ id: "q" }] },
  ],
})

describe("keptAsWas", () => {
  it("is what was there, where nothing has changed", () => {
    const was = [project()]
    expect(keptAsWas(was, [project()])).toBe(was)
  })

  it("keeps all of what did not change, where something did", () => {
    const [was] = [project()]
    const now = keptAsWas(was, project("working"))
    expect(now).not.toBe(was)
    expect(now).toEqual(project("working"))
    expect(now.conversations).not.toBe(was.conversations)
    expect(now.conversations[0]).not.toBe(was.conversations[0])
    expect(now.conversations[1]).toBe(was.conversations[1])
    expect(now.conversations[1].queued).toBe(was.conversations[1].queued)
    expect(now.conversations[0].queued).toBe(was.conversations[0].queued)
  })

  it("tells things in a list apart by their ids, wherever they come in it", () => {
    const was = project()
    const next = project()
    next.conversations.unshift({ id: "c", status: "idle", queued: [] })
    const now = keptAsWas(was, next)
    expect(now.conversations[1]).toBe(was.conversations[0])
    expect(now.conversations[2]).toBe(was.conversations[1])
  })

  it("takes a field gone, or come, for a change", () => {
    const was: Record<string, unknown> = { id: "p", branch: "main" }
    expect(keptAsWas(was, { id: "p" })).toEqual({ id: "p" })
    expect(keptAsWas({ id: "p" }, was)).toEqual(was)
    expect(keptAsWas({ id: "p", branch: undefined }, { id: "p" })).toEqual({
      id: "p",
    })
  })

  it("takes a list grown shorter or longer for a change", () => {
    const was = [1, 2, 3]
    expect(keptAsWas(was, [1, 2])).toEqual([1, 2])
    expect(keptAsWas(was, [1, 2, 3, 4])).toEqual([1, 2, 3, 4])
    expect(keptAsWas(was, [1, 2, 3])).toBe(was)
  })

  it("takes what is not plain data as it comes", () => {
    const at = new Date(0)
    expect(keptAsWas(new Date(0), at)).toBe(at)
    expect(keptAsWas(null, { id: "p" })).toEqual({ id: "p" })
    expect(keptAsWas({ id: "p" }, null)).toBeNull()
  })
})
