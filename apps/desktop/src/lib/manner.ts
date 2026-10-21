// How a message is to be answered: by whose agent, with which model, thinking how hard,
// asking how much. The user picks each; what is picked has to be squared with what the
// agent offers.

import {
  ACCESSES,
  type Access,
  type Effort,
  type Manner,
  type ModelChoice,
  type ProviderId,
} from "@shared/api"

/**
 * How much an agent may do without asking, as it was last chosen and kept. Nothing
 * chosen yet, it does what is routine and asks about the rest: full access is the
 * user's to give.
 */
export function savedAccess(kept: string | null): Access {
  // what an earlier version called the one of its two that asked
  if (kept === "ask") return "edits"
  return ACCESSES.find((access) => access === kept) ?? "auto"
}

/**
 * The model that will answer: the one picked, if the agent still offers it, and
 * otherwise whichever it is set to run. None, while it has not said what it offers.
 */
export function chosenModel(
  models: ModelChoice[],
  picked: string | null
): ModelChoice | null {
  return (
    models.find((model) => model.id === picked) ??
    models.find((model) => model.id === null) ??
    null
  )
}

/** How hard that model will be told to think: as picked, if it can be told so. */
export function chosenEffort(
  model: ModelChoice | null,
  picked: Effort | null
): Effort | null {
  return picked && model?.efforts.includes(picked) ? picked : null
}

/** What goes with a message, from what is picked and what the agent offers. */
export function mannerOf(
  provider: ProviderId,
  models: ModelChoice[],
  model: string | null,
  effort: Effort | null,
  access: Access
): Manner {
  if (models.length === 0) return { provider, model, effort, access }
  const chosen = chosenModel(models, model)
  return {
    provider,
    model: chosen?.id ?? null,
    effort: chosenEffort(chosen, effort),
    access,
  }
}

/** What each way of asking is called, and what it comes to. */
export const ACCESS_WORDS: Record<Access, { label: string; detail: string }> = {
  supervised: {
    label: "Supervised",
    detail: "Asks before changing files or running anything",
  },
  edits: {
    label: "Auto-accept edits",
    detail: "Edits files freely, asks before anything else",
  },
  auto: {
    label: "Auto",
    detail: "Does what is routine, asks about the rest",
  },
  full: { label: "Full access", detail: "Never asks" },
}

export const EFFORT_WORDS: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}
