// At the foot of a blueprint: how its sheets show the model. Pulled apart or put
// together; saying how big it is, or not; and naming its parts, or not. Each is a switch
// in a bar of its own. Next to the first two, while they are on, is what goes with them,
// in a bar of its own again: how far apart the parts are pulled, and what the sizes are
// said in. And after them all, what takes all the sheets away at once.
import * as React from "react"
import { cn } from "cn"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Spread, Twice } from "@/components/viewport/explode-slider"
import { usePreferences, type Unit } from "@/lib/preferences"
import { SPREAD, useStore } from "@/lib/store"
import { useSaving } from "./saving"

/** What a length can be said in, in the order they are offered. */
const UNITS: Unit[] = ["mm", "in"]

/** What every bar here is, as the one at the foot of the view while Claude looks a model over is. */
const BAR =
  "glass flex h-10 items-center rounded-full bg-background/60 shadow-md ring-1 ring-foreground/10 select-none"
/** One with a switch in it, and the words that say what the switch is for. */
const SWITCH = `${BAR} animate-in pr-3.5 pl-5 text-sm font-medium duration-200 fade-in slide-in-from-bottom-2`

/** How long the bars take to come back to the middle once the pointer has left them, ms. */
const BACK_MS = 300

/**
 * What goes with a switch, next to it: there while the switch is on, opening out of
 * nothing beside it as it is turned on, and a little way from it. `children` is given
 * whether it is there, to fade by: it is glass, and glass inside something that is fading
 * has nothing behind it to be glass over.
 */
function With({
  on,
  children,
}: {
  on: boolean
  children: (fades: string) => React.ReactNode
}) {
  return (
    <div
      inert={!on}
      className={cn(
        "grid transition-[grid-template-columns] duration-300 ease-in-out motion-reduce:transition-none",
        on ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
      )}
    >
      {/* (What closes up cuts off whatever is outside it: there is room round the bar
          for its edge and its shadow, which are drawn outside it. The room lies over
          the end of the switch's bar, and is not to take a press meant for that.) */}
      <div className="pointer-events-none -m-3 min-w-0 overflow-hidden p-3">
        {children(
          cn(
            "pointer-events-auto ml-2 transition-opacity duration-200",
            !on && "opacity-0"
          )
        )}
      </div>
    </div>
  )
}

export function Options({
  further,
}: {
  /** the model comes apart twice: into its pieces, and those into their parts */
  further: boolean
}) {
  const exploded = useStore((state) => state.view.exploded)
  const dimensions = useStore((state) => state.view.dimensions)
  const labels = useStore((state) => state.view.labels)
  const setView = useStore((state) => state.setView)
  const units = usePreferences((state) => state.units)
  const change = usePreferences((state) => state.change)
  const saveAll = useSaving((state) => state.all)

  // The bars are in the middle of the foot of the view, and another comes up next to a
  // switch as it is turned on: which would take the switch out from under the pointer
  // that has just pressed it. So for as long as the pointer is on them they stay where
  // they are at their left, and take up more room to the right; and when it has gone,
  // they go back to the middle.
  const bars = React.useRef<HTMLDivElement>(null)
  /** how far in from the left they are kept, while the pointer is on them */
  const [kept, setKept] = React.useState<number | null>(null)
  /** where their left was when the pointer left, to go back to the middle from */
  const left = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    const from = left.current
    left.current = null
    if (kept !== null || from === null || !bars.current) return
    const moved = from - bars.current.getBoundingClientRect().left
    if (Math.abs(moved) < 1) return
    bars.current.animate(
      [{ transform: `translateX(${moved}px)` }, { transform: "none" }],
      { duration: BACK_MS, easing: "ease-in-out" }
    )
  }, [kept])

  return (
    <div
      ref={bars}
      className="pointer-events-auto flex items-center"
      style={
        kept === null
          ? undefined
          : { alignSelf: "flex-start", marginLeft: kept }
      }
      onPointerEnter={(event) => {
        const within = event.currentTarget.offsetParent?.getBoundingClientRect()
        const at = event.currentTarget.getBoundingClientRect()
        setKept(at.left - (within?.left ?? 0))
      }}
      onPointerLeave={(event) => {
        left.current = event.currentTarget.getBoundingClientRect().left
        setKept(null)
      }}
    >
      <label className={cn(SWITCH, "gap-3")}>
        Exploded
        <Switch
          checked={exploded}
          // pulled apart afresh, it is by the model's own distances
          onCheckedChange={(exploded) =>
            setView({ exploded, alone: false, spread: SPREAD.min })
          }
        />
      </label>
      <With on={exploded}>
        {(fades) => (
          <div className={cn(BAR, "gap-2 px-3.5", fades)}>
            {further && <Twice />}
            <Spread />
          </div>
        )}
      </With>
      {/* (every bar is as far from the next as a switch is from what goes with it) */}
      <label className={cn(SWITCH, "ml-2 gap-3")}>
        Dimensions
        <Switch
          checked={dimensions}
          onCheckedChange={(dimensions) => setView({ dimensions })}
        />
      </label>
      <With on={dimensions}>
        {(fades) => (
          <ToggleGroup
            aria-label="Units"
            spacing={0.5}
            value={[units]}
            // one is always chosen: pressing the chosen one again changes nothing
            onValueChange={(chosen) => {
              const next = chosen.find((unit) => unit !== units) as
                Unit | undefined
              if (next) change({ units: next })
            }}
            className={cn(BAR, "p-1", fades)}
          >
            {UNITS.map((unit) => (
              <ToggleGroupItem
                key={unit}
                value={unit}
                size="sm"
                className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground"
              >
                {unit}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </With>
      <label className={cn(SWITCH, "ml-2 gap-3")}>
        Labels
        <Switch
          checked={labels}
          onCheckedChange={(labels) => setView({ labels })}
        />
      </label>
      <Button
        variant="ghost"
        disabled={!saveAll}
        onClick={() => saveAll?.()}
        className={cn(
          SWITCH,
          "ml-2 cursor-pointer gap-2 pr-5 pl-4 hover:bg-foreground/8 hover:ring-foreground/20 dark:hover:bg-foreground/8"
        )}
      >
        <DownloadIcon />
        Download all SVG
      </Button>
    </div>
  )
}
