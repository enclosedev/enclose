// The theme creator, which the app has only as it is worked on: over the whole window, a
// colour picker for each thing a theme colours down the left, and the window drawn in
// what is picked on the right, in the light look or the dark. The window's own colours
// are on one tab; a circuit board's in PCB mode on another, where the window is drawn
// in PCB mode with a board of its own, looked at the way of what is being picked; and
// the settings' on a third, where the window has them open over it.
// What is picked in one look is that look's alone; what is not picked is the app's own. Saved, the theme is a file
// in themes/ at the top of the repository, to be put to the app in a pull request. It
// changes the app's own look as well, in themes/default.json, put to the app the same
// way: then what is not picked is the app's own as src/index.css has it. What the theme
// is called is its title, changed where it stands.
import * as React from "react"
import { cn } from "cn"
import { MoonIcon, RotateCcwIcon, SunIcon, XIcon } from "lucide-react"

import { PALETTE_NAMES, type PaletteName } from "@shared/palette"
import {
  changes,
  NAME_LENGTH,
  PCB_AREAS,
  PCB_SLOTS,
  readLooks,
  SLOTS,
  THEME_FOLDER,
  type Mode,
  type PcbColours,
  type ThemeColours,
  type ThemeLooks,
  type SlotId,
  type Theme,
} from "@shared/theme-format"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { slotColourOf } from "@/lib/css-color"
import type { BoardAs } from "@/lib/store"
import {
  paletteOf,
  propertiesOf,
  useLook,
  useThemes,
  type Making,
} from "@/lib/themes"
import { Mockup, MOCKUP } from "./mockup"
import { ColourPicker } from "./picker"

/** Whether two of a theme's looks colour the same, however each came to be written. */
const same = (a: ThemeLooks, b: ThemeLooks) =>
  JSON.stringify(readLooks(a)) === JSON.stringify(readLooks(b))

/** The parts of the window, in the order their colours are picked. */
const AREAS = ["Sidebar", "Viewer", "Chat", "Tools"] as const

/** The tabs the colours are picked on, and what of the window is on each. */
const TABS = [
  { value: "general", label: "General", areas: AREAS },
  { value: "pcb", label: "PCB", areas: PCB_AREAS },
  { value: "settings", label: "Settings", areas: ["Settings"] },
] as const
type Tab = (typeof TABS)[number]["value"]

/** The way PCB mode looks at a board to show what is picked of each of its ways. */
const SHOWN_AS: Record<(typeof PCB_AREAS)[number], BoardAs> = {
  "3D view": "3d",
  "Technical view": "pcb",
  Schematic: "schematic",
}

/**
 * The colours of a board's layers of copper, the top's first, as the sample board has
 * them (sample-board.tsx): picked as the parts' are, from a row of them, each by its
 * number, with one picker for the one picked.
 */
const LAYER_SLOTS = [
  "technical-top",
  "technical-inner1",
  "technical-inner2",
  "technical-bottom",
] as const satisfies readonly SlotId[]

/** And how each is drawn while another is looked at, through that one: picked under them. */
const BEHIND_SLOTS = LAYER_SLOTS.map(
  (id) => `${id}-behind` as const
) satisfies readonly SlotId[]

/** Black or white, whichever is read better on a colour ("#rrggbb"): for a number on it. */
function inkOn(colour: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(colour.slice(at, at + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return light > 0.18 ? "#000000" : "#ffffff"
}

/** How long it says that it was saved, and how long that takes to fade, ms. */
const NOTED = 3000
const FADE = 300

/** The two looks a theme is made in, as the button for each says. */
const LOOKS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const

/**
 * What each thing a theme colours is drawn in, in one look, with the theme's colours for
 * it (`colours`) over the app's own: as that has been changed, or (`base`) as
 * src/index.css has it. What the theme gives no colour is drawn as the app has it, which
 * for some is as something else is (a pour of copper as the traces): as the theme has
 * that.
 */
function shownOf(
  mode: Mode,
  base: boolean,
  colours: ThemeColours
): Record<SlotId, string> {
  // read off something of that look that no theme the window is in reaches
  const probe = document.createElement("div")
  probe.dataset.themePreview = ""
  if (base) probe.dataset.themeBase = ""
  probe.className = mode
  probe.hidden = true
  for (const [token, value] of Object.entries(propertiesOf(colours)))
    probe.style.setProperty(token, value)
  document.body.append(probe)
  const style = getComputedStyle(probe)
  const read = Object.fromEntries(
    SLOTS.map((slot) => [slot.id, slotColourOf(style, slot)])
  ) as Record<SlotId, string>
  probe.remove()
  return read
}

/** The window drawn as big as it fits in what holds it, and no bigger than it is. */
function Fitted({ children }: { children: React.ReactNode }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0.5)
  React.useLayoutEffect(() => {
    const held = box.current
    if (!held) return
    const fit = () =>
      setScale(
        Math.min(
          1,
          held.clientWidth / MOCKUP.width,
          held.clientHeight / MOCKUP.height
        )
      )
    fit()
    const watching = new ResizeObserver(fit)
    watching.observe(held)
    return () => watching.disconnect()
  }, [])
  return (
    <div
      ref={box}
      className="absolute inset-x-10 top-16 bottom-24 flex items-center justify-center"
    >
      <div
        style={{ width: MOCKUP.width * scale, height: MOCKUP.height * scale }}
      >
        <div
          style={{
            ...MOCKUP,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** One thing the theme colours: what it is, on the left, and its picker. */
function Row({
  area,
  label,
  changed,
  reset,
  onReset,
  onUse,
  children,
}: {
  area: string
  label: string
  /** its colour, in this look, is not what it goes back to (see `reset` below) */
  changed: boolean
  /** what is said of putting it back as it was */
  reset: string
  onReset: () => void
  /** anything in it is pressed or gone into */
  onUse?: () => void
  children: React.ReactNode
}) {
  return (
    <section
      onPointerDownCapture={onUse}
      onFocusCapture={onUse}
      // (the first under the tabs has their line over it)
      className="flex gap-5 border-t py-5 first:border-t-0"
    >
      <div className="flex w-28 shrink-0 flex-col items-start text-sm">
        <span>{area}</span>
        {label !== area && (
          <span className="text-muted-foreground">{label}</span>
        )}
        {changed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onReset}
                  className="mt-2 -ml-1 flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              }
            >
              <RotateCcwIcon className="size-3.5" />
              <span className="sr-only">{reset}</span>
            </TooltipTrigger>
            <TooltipContent>{reset}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </section>
  )
}

export function ThemeCreator({
  making,
  look: given,
  changing = null,
}: {
  making: Making
  /** the look shown at first: the one the window is in, where none is given */
  look?: Mode
  /** the theme it changes, where it is one already made: null for a new one */
  changing?: Theme | null
}) {
  const setCreating = useThemes((state) => state.setCreating)
  const save = useThemes((state) => state.save)
  const saveDefaults = useThemes((state) => state.saveDefaults)
  const under = useThemes((state) => state.defaults)
  const look = useLook()
  const base = making === "defaults"
  const [mode, setMode] = React.useState<Mode>(given ?? look)
  // what was saved last: for a new theme, nothing at first, from nothing of its own; for
  // one already made, it as it is; for the app's own look, what is changed of it now
  const [kept, setKept] = React.useState<{ name: string; looks: ThemeLooks }>(
    () => {
      const from = base ? under : changing
      return {
        name: from?.name ?? "",
        looks: from
          ? structuredClone({ light: from.light, dark: from.dark })
          : { light: {}, dark: {} },
      }
    }
  )
  // and what the theme saved last was called, which saving it again writes in place of
  const [savedAs, setSavedAs] = React.useState<string | null>(
    base ? null : (changing?.id ?? null)
  )
  const [made, setMade] = React.useState<ThemeLooks>(kept.looks)
  const [name, setName] = React.useState(kept.name)
  const [part, setPart] = React.useState<PaletteName>("blue")
  const [tab, setTab] = React.useState<Tab>("general")
  // the way the board is looked at, on the PCB tab: as PCB mode first looks at one
  const [boardAs, setBoardAs] = React.useState<BoardAs>("3d")
  const [boardLayer, setBoardLayer] = React.useState(1)
  const [said, setSaid] = React.useState<string | null>(null)
  // that it was saved, for a while: `at` tells one saving from the next
  const [note, setNote] = React.useState<{
    text: string
    at: number
    going: boolean
  } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const naming = React.useRef<HTMLInputElement>(null)
  const parts = React.useRef<HTMLDivElement>(null)

  const colours = made[mode]
  const shown = React.useMemo(
    () => shownOf(mode, base, colours),
    [mode, base, colours]
  )
  const palette = base ? paletteOf(colours) : paletteOf(colours, under[mode])
  const boardColours = React.useMemo(
    () =>
      Object.fromEntries(
        PCB_SLOTS.map(({ id }) => [id, shown[id]])
      ) as PcbColours,
    [shown]
  )
  const anything = changes(made.light) || changes(made.dark)
  const unsaved = name.trim() !== kept.name || !same(made, kept.looks)
  const named = base || name.trim() !== ""
  // What a colour goes back to: for a theme, none of its own, so the default's; for the
  // default, what was saved of it, which is the default. A colour is marked where it is
  // not that: a theme's own colours, or what is changed of the default and not saved
  const reset = base ? "Back to the saved default" : "Back to the default"
  const saved = kept.looks[mode]
  const backTo = (id: SlotId) => (base ? (saved[id] ?? null) : null)
  const partBackTo = (name: PaletteName) =>
    base ? (saved.parts?.[name] ?? null) : null
  const differs = (id: SlotId) => (colours[id] ?? null) !== backTo(id)
  const partDiffers = (name: PaletteName) =>
    (colours.parts?.[name] ?? null) !== partBackTo(name)

  const colour = (id: SlotId, value: string | null) => {
    setSaid(null)
    setMade((before) => {
      const next = { ...before[mode] }
      if (value) next[id] = value
      else delete next[id]
      return { ...before, [mode]: next }
    })
  }
  const partColour = (which: PaletteName, value: string | null) => {
    setSaid(null)
    setMade((before) => {
      const next = { ...before[mode].parts }
      if (value) next[which] = value
      else delete next[which]
      return { ...before, [mode]: { ...before[mode], parts: next } }
    })
  }

  // Esc leaves the title, if it is being changed; else puts it all away while all that is
  // picked is saved. Nothing under it hears it
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      event.preventDefault()
      if (event.target === naming.current) naming.current?.blur()
      else if (!unsaved) setCreating(null)
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [unsaved, setCreating])

  /** Have what was written be what is picked, and what was saved last. */
  const written = (saved: {
    name: string
    light: ThemeColours
    dark: ThemeColours
  }) => {
    const looks = { light: saved.light, dark: saved.dark }
    setKept({ name: saved.name, looks })
    setMade(looks)
    setName(saved.name)
  }

  /** Say, for as long as NOTED, that it was saved, and then let that fade. */
  const noteSaved = (text: string) => {
    const at = Date.now()
    setNote({ text, at, going: false })
    const now = (change: (was: NonNullable<typeof note>) => typeof note) =>
      setNote((was) => (was?.at === at ? change(was) : was))
    setTimeout(() => now((was) => ({ ...was, going: true })), NOTED)
    setTimeout(() => now(() => null), NOTED + FADE)
  }

  // Saved, it stays open, for more to be picked and saved again
  const done = async () => {
    if (!unsaved || !named) return
    if (!base && !anything) {
      setSaid(
        "Change a colour first: a theme with none of its own is the app's look."
      )
      return
    }
    setSaving(true)
    try {
      if (base) {
        await saveDefaults({ name: name.trim() || kept.name, ...made })
        written(useThemes.getState().defaults)
        noteSaved(`Saved in ${THEME_FOLDER}/default.json`)
      } else {
        const theme = await save(
          { name, light: made.light, dark: made.dark },
          savedAs ?? undefined
        )
        written(theme)
        setSavedAs(theme.id)
        noteSaved(
          `Saved as ${THEME_FOLDER}/${theme.id}.json: open a pull request with it to share it`
        )
      }
    } catch (error) {
      setSaid(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Theme creator"
      className="theme-creator fixed inset-0 z-50 flex animate-in bg-background text-foreground duration-200 fade-in-0 select-none"
    >
      <aside className="no-drag flex w-104 shrink-0 flex-col border-r">
        {/* room for the window's traffic lights, and something to drag it by */}
        <div className="drag h-12 shrink-0" />
        <header className="flex items-start justify-between gap-4 px-7 pt-3 pb-6">
          <div className="flex min-w-0 flex-1 flex-col text-xl/[1.2] font-medium">
            <input
              ref={naming}
              aria-label={
                base
                  ? "What the app's own look is called"
                  : "What the theme is called"
              }
              placeholder="Untitled theme"
              spellCheck={false}
              maxLength={NAME_LENGTH}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setSaid(null)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
              onBlur={() => {
                if (base && !name.trim()) setName(kept.name)
              }}
              className="-ml-1.5 field-sizing-content max-w-full min-w-0 cursor-text self-start rounded-md bg-transparent px-1.5 outline-none select-text placeholder:text-muted-foreground hover:bg-muted focus:bg-muted"
            />
            <span className="text-muted-foreground">
              {mode === "dark" ? "Dark mode" : "Light mode"}
            </span>
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            onClick={() => setCreating(null)}
          >
            <XIcon />
            <span className="sr-only">Close the theme creator</span>
          </Button>
        </header>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList
            variant="line"
            className="mx-7 h-10! w-auto shrink-0 justify-start gap-5 rounded-none border-b p-0"
          >
            {TABS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-full flex-none px-0 after:-bottom-px! after:h-px!"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            value={tab}
            // (each tab from its top)
            key={tab}
            className="min-h-0 overflow-y-auto px-7 pb-8"
          >
            {TABS.find(({ value }) => value === tab)!.areas.map((area) => (
              <React.Fragment key={area}>
                {area === "Technical view" && (
                  <Row
                    area={area}
                    label="Layers"
                    changed={differs(LAYER_SLOTS[boardLayer - 1])}
                    reset={reset}
                    onReset={() => {
                      const id = LAYER_SLOTS[boardLayer - 1]
                      colour(id, backTo(id))
                    }}
                    onUse={() => setBoardAs("pcb")}
                  >
                    {/* the board's layers of copper, the top's 1: one picked, and
                        drawn in the view opposite, whose own buttons pick it too */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {LAYER_SLOTS.map((id, at) => (
                        <button
                          key={id}
                          type="button"
                          // ("Layer 1 · Top", as the theme has it)
                          title={SLOTS.find((slot) => slot.id === id)?.label}
                          aria-pressed={boardLayer === at + 1}
                          onClick={() => setBoardLayer(at + 1)}
                          className="relative flex aspect-square cursor-pointer items-center justify-center rounded-full text-sm tabular-nums ring-1 ring-foreground/15 outline-offset-2 outline-foreground ring-inset hover:ring-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:outline-2"
                          style={{
                            background: shown[id],
                            color: inkOn(shown[id]),
                          }}
                        >
                          {at + 1}
                          {differs(id) && (
                            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-foreground ring-2 ring-background" />
                          )}
                        </button>
                      ))}
                    </div>
                    <ColourPicker
                      label={`Layer ${boardLayer}`}
                      value={shown[LAYER_SLOTS[boardLayer - 1]]}
                      onChange={(value) =>
                        colour(LAYER_SLOTS[boardLayer - 1], value)
                      }
                    />
                  </Row>
                )}
                {area === "Technical view" && (
                  <Row
                    area={area}
                    label={`Layer ${boardLayer} behind`}
                    changed={differs(BEHIND_SLOTS[boardLayer - 1])}
                    reset={reset}
                    onReset={() => {
                      const id = BEHIND_SLOTS[boardLayer - 1]
                      colour(id, backTo(id))
                    }}
                    onUse={() => setBoardAs("pcb")}
                  >
                    <ColourPicker
                      alpha
                      label={`Layer ${boardLayer}, behind`}
                      // what was picked, as it was picked: read back, how much of it
                      // shows can be a little off
                      value={
                        colours[BEHIND_SLOTS[boardLayer - 1]] ??
                        shown[BEHIND_SLOTS[boardLayer - 1]]
                      }
                      onChange={(value) =>
                        colour(BEHIND_SLOTS[boardLayer - 1], value)
                      }
                    />
                  </Row>
                )}
                {SLOTS.filter(
                  (slot) =>
                    slot.area === area &&
                    !([...LAYER_SLOTS, ...BEHIND_SLOTS] as SlotId[]).includes(
                      slot.id
                    )
                ).map((slot) => (
                  <Row
                    key={slot.id}
                    area={area}
                    label={slot.label}
                    changed={differs(slot.id)}
                    reset={reset}
                    onReset={() => colour(slot.id, backTo(slot.id))}
                    onUse={
                      area in SHOWN_AS
                        ? () =>
                            setBoardAs(SHOWN_AS[area as keyof typeof SHOWN_AS])
                        : undefined
                    }
                  >
                    <ColourPicker
                      label={`${area}, ${slot.label}`}
                      value={shown[slot.id]}
                      onChange={(value) => colour(slot.id, value)}
                    />
                  </Row>
                ))}
                {area === "Viewer" && (
                  <div ref={parts} className="scroll-my-4">
                    <Row
                      area="Viewer"
                      label="Parts"
                      changed={partDiffers(part)}
                      reset={reset}
                      onReset={() => partColour(part, partBackTo(part))}
                    >
                      {/* a part in the window opposite picks its colour too */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {PALETTE_NAMES.map((name) => (
                          <button
                            key={name}
                            type="button"
                            title={name}
                            aria-pressed={part === name}
                            onClick={() => setPart(name)}
                            className="relative aspect-square cursor-pointer rounded-full ring-1 ring-foreground/15 outline-offset-2 outline-foreground ring-inset hover:ring-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:outline-2"
                            style={{ background: palette[name] }}
                          >
                            {partDiffers(name) && (
                              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-foreground ring-2 ring-background" />
                            )}
                            <span className="sr-only">{name}</span>
                          </button>
                        ))}
                      </div>
                      <ColourPicker
                        label={`Parts, ${part}`}
                        value={palette[part]}
                        onChange={(value) => partColour(part, value)}
                      />
                    </Row>
                  </div>
                )}
              </React.Fragment>
            ))}
          </TabsContent>
        </Tabs>
      </aside>
      <main className="relative min-w-0 flex-1">
        <div className="drag absolute inset-x-0 top-0 h-12" />
        <ToggleGroup
          aria-label="Look"
          variant="outline"
          spacing={2}
          value={[mode]}
          // one is always chosen: pressing the chosen one again changes nothing
          onValueChange={(picked) => {
            const next = LOOKS.find(
              ({ value }) => value !== mode && picked.includes(value)
            )
            if (next) setMode(next.value)
          }}
          className="no-drag absolute top-3 right-4"
        >
          {LOOKS.map(({ value, label, Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={value}
                    aria-label={label}
                    // circles, as the settings' looks are
                    className="size-9 min-w-0 rounded-full border-border bg-input/30 px-0 hover:bg-input/50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground"
                  />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
        <Fitted>
          <Mockup
            mode={mode}
            colours={colours}
            base={base}
            palette={palette}
            board={
              tab === "pcb"
                ? {
                    as: boardAs,
                    onAs: setBoardAs,
                    layer: boardLayer,
                    onLayer: setBoardLayer,
                    colours: boardColours,
                    ground: shown.viewer,
                  }
                : null
            }
            settings={tab === "settings"}
            picked={part}
            onPick={(name) => {
              setPart(name)
              parts.current?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              })
            }}
          />
        </Fitted>
        <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
          {said && <p className="text-sm text-muted-foreground">{said}</p>}
          <div
            inert={!named}
            className={cn(
              "transition-[translate,opacity] duration-300 ease-out",
              !named && "translate-y-6 opacity-0"
            )}
          >
            <button
              type="button"
              disabled={saving || !unsaved}
              onClick={() => void done()}
              className="h-9 cursor-pointer rounded-full bg-foreground px-4.5 text-sm font-medium text-background shadow-md transition-opacity outline-none hover:bg-foreground/85 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-foreground"
            >
              {saving ? "Saving…" : base ? "Save default theme" : "Save theme"}
            </button>
          </div>
        </div>
        <div
          aria-live="polite"
          className="pointer-events-none absolute right-10 bottom-8 flex h-9 max-w-[calc(50%-8rem)] items-center justify-end text-right text-sm text-muted-foreground"
        >
          {note && (
            <p
              key={note.at}
              className={cn(
                "animate-in transition-opacity duration-300 fade-in-0 slide-in-from-bottom-1",
                note.going && "opacity-0"
              )}
            >
              {note.text}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
