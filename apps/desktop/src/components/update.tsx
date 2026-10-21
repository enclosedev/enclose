// The app's newer version, where there is one: a button over the one for the settings.
// Pressed, it fetches that version, and shows how much of it has come round its own
// edge. Then it is the button that starts the app again, as that version.
import { cn } from "cn"
import { DownloadIcon, RotateCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"
import type { Update } from "@shared/api"

/** What the button says it is for, to whoever points at it. */
function said(update: Exclude<Update, { state: "none" }>): string {
  switch (update.state) {
    case "available":
      return update.failed
        ? "The update did not download. Try again"
        : `Download update ${update.version}`
    case "downloading":
      return `Downloading update: ${Math.round(update.fraction * 100)}%`
    case "ready":
      return `Restart to update to ${update.version}`
    case "restarting":
      return "Restarting"
  }
}

/**
 * How much of a download has come, drawn round the edge of the button it is on: that
 * much of the edge. Until the first of it comes, a length of the edge goes round.
 */
function Ring({ fraction }: { fraction: number }) {
  const waiting = fraction === 0
  return (
    <svg
      viewBox="0 0 32 32"
      // (over the button's own edge, which is outside what it has room for inside)
      className={cn(
        "absolute -top-px -left-px size-8",
        waiting ? "animate-spin" : "-rotate-90"
      )}
      aria-hidden
    >
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={waiting ? 0.75 : 1 - fraction}
        // it is told how far along it is about once a second: it goes there evenly
        className="stroke-foreground transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  )
}

export function UpdateButton() {
  const update = useStore((state) => state.update)
  if (update.state === "none") return null
  const { state } = update
  const here = state === "ready" || state === "restarting"
  const busy = state === "downloading" || state === "restarting"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            // not to be pressed while it is at work, and still there to be pointed at
            disabled={busy}
            focusableWhenDisabled
            className={cn(
              "relative animate-in bg-background shadow-sm duration-200 zoom-in-90 fade-in",
              busy && "cursor-default active:translate-y-0",
              here &&
                "border-transparent bg-attention text-background hover:bg-attention/85 hover:text-background"
            )}
            onClick={() =>
              void (here
                ? window.cad.update.restart()
                : window.cad.update.download())
            }
          />
        }
      >
        {state === "restarting" ? (
          <Spinner />
        ) : here ? (
          <RotateCwIcon />
        ) : (
          <DownloadIcon className={cn(busy && "opacity-50")} />
        )}
        {state === "downloading" && <Ring fraction={update.fraction} />}
        <span className="sr-only">{said(update)}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{said(update)}</TooltipContent>
    </Tooltip>
  )
}
