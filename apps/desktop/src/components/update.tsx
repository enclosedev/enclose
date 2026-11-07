// The app's newer version, where there is one: told at the foot of the view, as a newer
// agent is (newer-agent.tsx), with a button that leaves it be for now and another that
// fetches it. While it comes, how far along it is; then the button that starts the app
// again, as that version.
import * as React from "react"

import { Floating } from "@/components/floating"
import { Logo } from "@/components/mark"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useStore } from "@/lib/store"
import type { Update } from "@shared/api"

/**
 * What was left be: a version not fetched, or one fetched and not started as (that,
 * "<version> ready"). Neither is offered here again: the settings still offer both.
 */
const PASSED_KEY = "enclose:passed-app-update"

function readPassed(): string | null {
  try {
    return localStorage.getItem(PASSED_KEY)
  } catch {
    return null
  }
}

/** What of an update there is to leave be, as it is kept once it is. */
function passing(update: Update): string | null {
  if (update.state === "available") return update.version
  if (update.state === "ready") return `${update.version} ready`
  return null
}

/** What the pill says, with the version in it. */
function said(update: Exclude<Update, { state: "none" }>): string {
  switch (update.state) {
    case "available":
      return update.failed
        ? `Enclose ${update.version} did not download`
        : `A new version of Enclose is available`
    case "downloading":
      return `Downloading Enclose ${update.version}… ${Math.round(update.fraction * 100)}%`
    case "ready":
      return `Enclose ${update.version} is ready`
    case "restarting":
      return "Restarting…"
  }
}

export function NewerApp() {
  const update = useStore((state) => state.update)
  const [passed, setPassed] = React.useState(readPassed)
  if (update.state === "none") return null
  const leaving = passing(update)
  if (leaving !== null && leaving === passed) return null
  const pass = () => {
    if (leaving === null) return
    try {
      localStorage.setItem(PASSED_KEY, leaving)
    } catch {
      // (left be until the app is opened again, then)
    }
    setPassed(leaving)
  }
  const busy = update.state === "downloading" || update.state === "restarting"
  return (
    <Floating
      role="status"
      className="pointer-events-auto flex items-center gap-2.5 py-1.5 pr-1.5 pl-4"
    >
      <Logo size={18} className="shrink-0" />
      <span className="mr-1 truncate tabular-nums">{said(update)}</span>
      {busy ? (
        <Spinner className="m-2 text-muted-foreground" />
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full px-3.5"
            onClick={pass}
          >
            Not now
          </Button>
          {update.state === "ready" ? (
            <Button
              size="sm"
              className="rounded-full px-3.5"
              onClick={() => void window.cad.update.restart()}
            >
              Restart
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-full px-3.5"
              onClick={() => void window.cad.update.download()}
            >
              {update.failed ? "Try again" : "Update"}
            </Button>
          )}
        </div>
      )}
    </Floating>
  )
}
