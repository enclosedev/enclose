import * as React from "react"

import type { ProviderId } from "@shared/api"
import { Floating } from "@/components/floating"
import { ProviderIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDER_WORDS, updatable } from "@/lib/providers"
import { updateProvider, useStore } from "@/lib/store"

/** The newer versions left be, by agent: each is not offered again, where it was. */
const PASSED_KEY = "enclose:passed-updates"

type Passed = Partial<Record<ProviderId, string>>

function readPassed(): Passed {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PASSED_KEY) ?? "{}")
    return kept && typeof kept === "object" ? (kept as Passed) : {}
  } catch {
    return {}
  }
}

/**
 * At the foot of the view: a newer version of an agent in use, with a button that leaves
 * it be for now and another that puts it in. One agent at a time. A version left be, or tried and
 * not had, is not offered here again: the settings still offer it, until a newer one
 * still comes out.
 */
export function NewerAgent() {
  const providers = useStore((state) => state.providers)
  const [passed, setPassed] = React.useState(readPassed)
  const pass = (id: ProviderId, version: string) =>
    setPassed((was) => {
      const now = { ...was, [id]: version }
      localStorage.setItem(PASSED_KEY, JSON.stringify(now))
      return now
    })
  const one = providers.find(
    (provider) =>
      provider.updating ||
      (updatable(provider) && passed[provider.id] !== provider.update?.version)
  )
  if (!one) return null
  const { cli } = PROVIDER_WORDS[one.id]
  const version = one.update?.version
  return (
    <Floating
      role="status"
      className="pointer-events-auto flex items-center gap-2.5 py-1.5 pr-1.5 pl-4"
    >
      <ProviderIcon provider={one.id} className="size-4 shrink-0" />
      <span className="mr-1 truncate">
        {/* which version, the settings say */}
        {one.updating
          ? `Updating ${cli}…`
          : `A new version of ${cli} is available`}
      </span>
      {one.updating ? (
        <Spinner className="m-2 text-muted-foreground" />
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full px-3.5"
            onClick={() => version && pass(one.id, version)}
          >
            Not now
          </Button>
          <Button
            size="sm"
            className="rounded-full px-3.5"
            title={one.update ? `Runs ${one.update.command}` : undefined}
            onClick={() => {
              if (!version) return
              void updateProvider(one.id).finally(() => pass(one.id, version))
            }}
          >
            Update
          </Button>
        </div>
      )}
    </Floating>
  )
}
