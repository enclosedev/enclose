// The order the sidebar lists projects in. The app's own process hands them over by their
// groups: those pinned first, the one pinned last at the top, then the rest, the one made
// last first. That is the order by when they were made. By the last message, the groups
// that are not pinned go instead by when the user last sent a message in any of their
// projects' conversations, the latest at the top: what they are at work on is at hand.
// A group made since then counts from when it was made, so that a new one is at the top.
// By hand, they go in the order the user dragged them to; one made since then is at the
// top, until it is dragged somewhere else.
import type { Project } from "@shared/api"

/**
 * asked: by when the user last sent a message. created: by when the group was made.
 * manual: in the order the user dragged them to.
 */
export type ProjectOrder = "asked" | "created" | "manual"

/** The ids of the projects' groups, each once, in the order they come. */
export const groupsOf = (projects: Project[]): string[] => [
  ...new Set(projects.map((project) => project.group.id)),
]

/** When the user was last at work on a group: their last message in it, or its making. */
function lastAt(projects: Project[]): number {
  let at = projects[0].group.addedAt
  for (const project of projects)
    for (const conversation of project.conversations)
      if (conversation.askedAt !== null && conversation.askedAt > at)
        at = conversation.askedAt
  return at
}

/**
 * The projects in the order the sidebar lists them, from the order they were handed over
 * in. Those of a group stay together, in the order they came; pinned groups stay at the
 * top, in theirs.
 */
export function inOrder(
  projects: Project[],
  order: ProjectOrder,
  /** the groups' ids in the order they were dragged to, for `manual` */
  manual: string[] = []
): Project[] {
  if (order === "created") return projects
  const groups: Project[][] = []
  for (const project of projects) {
    const last = groups.at(-1)
    if (last?.[0].group.id === project.group.id) last.push(project)
    else groups.push([project])
  }
  // (sorting keeps the order they came in where two come out even)
  const sorted = (some: Project[][]) =>
    order === "manual"
      ? some
          .map((group) => ({ group, at: manual.indexOf(group[0].group.id) }))
          .sort((a, b) => a.at - b.at)
          .map(({ group }) => group)
      : some
          .map((group) => ({ group, at: lastAt(group) }))
          .sort((a, b) => b.at - a.at)
          .map(({ group }) => group)
  const pinned = groups.filter((group) => group[0].group.pinned)
  const rest = groups.filter((group) => !group[0].group.pinned)
  // pinned ones keep the order they were pinned in, but where put in one by hand
  return [
    ...(order === "manual" ? sorted(pinned) : pinned),
    ...sorted(rest),
  ].flat()
}
