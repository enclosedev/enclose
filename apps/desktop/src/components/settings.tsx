import * as React from "react"
import { cn } from "cn"
import {
  ChevronDownIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PencilIcon,
  SunIcon,
  XIcon,
} from "lucide-react"

import type { Settings as AppSettings } from "@shared/api"
import { DEFAULT_THEME, type Theme } from "@shared/theme-format"
import { ConnectGitHub } from "@/components/connect-github"
import { GitHubIcon } from "@/components/icons"
import { Logo } from "@/components/mark"
import { Miniature } from "@/components/miniature"
import { PillSlider } from "@/components/pill-slider"
import { CheckAgain, Providers } from "@/components/providers"
import { Group, Row } from "@/components/setting"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SETTLE_DAYS } from "@/lib/conversations"
import { ACCESS_WORDS } from "@/lib/manner"
import { RESTING_WIDTH } from "@/lib/mark"
import {
  PRESET_WORDS,
  PRESETS,
  presetOf,
  waysOf,
  type Drag,
  type Preset,
  type Way,
} from "@/lib/navigation"
import { MAC } from "@/lib/platform"
import { TURN_SPEED, usePreferences, ZOOM_SPEED } from "@/lib/preferences"
import { dated } from "@/lib/saved"
import { useStore } from "@/lib/store"
import { paletteOf, previewOf, useThemes } from "@/lib/themes"

/** The sections, in the order they are listed: what is turned to most comes first. */
const SECTIONS = [
  { id: "general", label: "General" },
  { id: "navigation", label: "Navigation" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "providers", label: "Providers" },
  { id: "connections", label: "Connections" },
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
] as const satisfies { id: string; label: string }[]

type SectionId = (typeof SECTIONS)[number]["id"]

/** How big the mark stands over the sections, px. */
const LOGO_SIZE = 28
/**
 * How far the mark stops short of the side of its square, px. It is moved over by as
 * much, so that it starts where the sections under it do.
 */
const LOGO_INSET = (LOGO_SIZE * (1 - RESTING_WIDTH)) / 2

/**
 * A choice of one out of a few, all of them in view. One that is to `fill` is as wide as
 * what holds it, and its options as wide as each other.
 */
function Choice<Value extends string>({
  value,
  onChange,
  options,
  label,
  fill,
}: {
  value: Value
  onChange: (value: Value) => void
  options: { value: Value; label: string }[]
  label: string
  fill?: boolean
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={0}
      className={cn(fill && "w-full")}
      value={[value]}
      // one is always chosen: pressing the chosen one again changes nothing
      onValueChange={(chosen) => {
        const next = chosen.find((item) => item !== value) as Value | undefined
        if (next) onChange(next)
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground",
            fill && "flex-1"
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A whole number of days, typed in. What is typed counts as soon as it is one. */
function Days({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (days: number) => void
  label: string
}) {
  const [typed, setTyped] = React.useState(String(value))
  return (
    <>
      <Input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={SETTLE_DAYS.min}
        max={SETTLE_DAYS.max}
        step={1}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value)
          const days = Number(event.target.value)
          if (
            Number.isInteger(days) &&
            days >= SETTLE_DAYS.min &&
            days <= SETTLE_DAYS.max
          )
            onChange(days)
        }}
        onBlur={() => setTyped(String(value))}
        className="h-8 w-16 text-center tabular-nums"
      />
      <span className="text-sm text-muted-foreground">
        {value === 1 ? "day" : "days"}
      </span>
    </>
  )
}

/** How much room a folder takes, as it is said to someone: "294 MB", "1.2 GB". */
function roomOf(bytes: number): string {
  if (!bytes) return "Empty"
  if (bytes < 999_500) return `${Math.max(1, Math.round(bytes / 1000))} KB`
  if (bytes < 999_500_000) return `${Math.round(bytes / 1_000_000)} MB`
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}

function General() {
  const access = useStore((state) => state.access)
  const setAccess = useStore((state) => state.setAccess)
  const settleDays = usePreferences((state) => state.settleDays)
  const thinkingTokens = usePreferences((state) => state.thinkingTokens)
  const units = usePreferences((state) => state.units)
  const datedFiles = usePreferences((state) => state.datedFiles)
  const change = usePreferences((state) => state.change)
  const [settings, setSettings] = React.useState<AppSettings | null>(null)
  React.useEffect(() => {
    void window.cad.settings.get().then(setSettings)
  }, [])
  // the room the projects folder takes, and which folder that was measured for
  const [measured, setMeasured] = React.useState<{
    folder: string
    bytes: number
  } | null>(null)
  const folder = settings?.projectsFolder
  React.useEffect(() => {
    if (!folder) return
    let stale = false
    void window.cad.settings.projectsFolderSize().then((bytes) => {
      if (!stale) setMeasured({ folder, bytes })
    })
    return () => {
      stale = true
    }
  }, [folder])
  const size = measured && measured.folder === folder ? measured.bytes : null

  return (
    <>
      <Group title="New projects">
        <Row
          title="Projects folder"
          detail={
            <>
              Where new projects are saved.
              <span className="mt-1 block text-xs">
                <span className="font-mono text-[13px] break-all">
                  {folder ?? " "}
                </span>
                {size !== null && ` · ${roomOf(size)}`}
              </span>
            </>
          }
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void window.cad.settings.revealProjectsFolder()}
          >
            Show
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void window.cad.settings.chooseProjectsFolder().then(setSettings)
            }
          >
            Change…
          </Button>
        </Row>
        <Row
          title="Opened files"
          detail="Names and groups the parts of CAD files you open."
        >
          <Switch
            aria-label="Look over opened files"
            checked={settings?.lookOver !== false}
            onCheckedChange={(on) =>
              void window.cad.settings.setLookOver(on).then(setSettings)
            }
          />
        </Row>
      </Group>
      <Group title="Conversations">
        <Row
          title="Permissions"
          // the one that is chosen, in the words the message box has for it
          detail={`${ACCESS_WORDS[access].detail}.`}
        >
          <Choice
            label="Permissions"
            value={access}
            onChange={setAccess}
            options={[
              { value: "supervised", label: "Supervised" },
              { value: "edits", label: "Edits" },
              { value: "auto", label: "Auto" },
              { value: "full", label: "Full" },
            ]}
          />
        </Row>
        <Row
          title="Versions"
          detail="Each conversation keeps its own version of the project. Off, they all change the same one."
        >
          <Switch
            aria-label="Keep a version of the project for each conversation"
            checked={settings?.versions !== false}
            onCheckedChange={(on) =>
              void window.cad.settings.setVersions(on).then(setSettings)
            }
          />
        </Row>
        <Row
          title="Earlier conversations"
          detail="Conversations idle this long are tucked under their project's card."
        >
          <Days
            label="Days before a conversation settles"
            value={settleDays}
            onChange={(days) => change({ settleDays: days })}
          />
        </Row>
        <Row
          title="Token usage"
          detail="While Claude thinks, shows about how many tokens it has used."
        >
          <Switch
            aria-label="Show token usage while Claude thinks"
            checked={thinkingTokens}
            onCheckedChange={(on) => change({ thinkingTokens: on })}
          />
        </Row>
      </Group>
      <Group title="Blueprints">
        <Row title="Units" detail="The unit dimensions are shown in.">
          <Choice
            label="Units"
            value={units}
            onChange={(value) => change({ units: value })}
            options={[
              { value: "mm", label: "mm" },
              { value: "in", label: "in" },
            ]}
          />
        </Row>
      </Group>
      <Group title="Downloads">
        <Row
          title="Date in file names"
          detail={`Starts the name of what you download with the day, as in ${dated("table-clock.step")}.`}
        >
          <Switch
            aria-label="Start the names of downloaded files with the date"
            checked={datedFiles}
            onCheckedChange={(on) => change({ datedFiles: on })}
          />
        </Row>
      </Group>
      <Group title="Privacy">
        <Row
          title="Usage data"
          detail={
            <>
              Sends which features you use, and nothing from your projects or
              messages.{" "}
              <a
                href="https://github.com/enclosedev/enclose/blob/main/docs/usage-data.md"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                What is sent
              </a>
            </>
          }
        >
          <Switch
            aria-label="Send usage data"
            checked={settings?.analytics !== false}
            onCheckedChange={(on) =>
              void window.cad.settings.setAnalytics(on).then(setSettings)
            }
          />
        </Row>
      </Group>
    </>
  )
}

/** The looks the window can be drawn in, in the order they are offered. */
const MODES = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const

/** What a card of the settings that is chosen by its picture is drawn as. */
const PICTURED =
  "group flex w-full flex-col gap-2 rounded-2xl bg-card p-1.5 pb-2.5 ring-1 ring-foreground/10 outline-none hover:ring-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary"

/**
 * What is done to a theme from a button on its card's corner, shown with the pointer on
 * it: side by side, where there is more than one.
 */
const CORNER =
  "flex size-6 cursor-pointer items-center justify-center rounded-full bg-background/85 opacity-0 ring-1 ring-foreground/10 transition-[opacity,color,background-color] outline-none group-hover/theme:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * A theme, as the window would be drawn in it in the look chosen beside the section's
 * name: light and dark side by side, for the system's. Where no theme is given, it is the
 * app's own. As the app is worked on, each has a pencil on its corner, to change it, and
 * one that can be taken away a cross beside that.
 */
function ThemeCard({
  theme,
  chosen,
  onChoose,
  onRemove,
  onEdit,
}: {
  theme: Theme | null
  chosen: boolean
  onChoose: () => void
  onRemove?: () => void
  onEdit?: () => void
}) {
  const { theme: mode } = useTheme()
  const defaults = useThemes((state) => state.defaults)
  const name = theme?.name ?? defaults.name
  const palettes = React.useMemo(
    () => ({
      light: paletteOf(theme?.light, defaults.light),
      dark: paletteOf(theme?.dark, defaults.dark),
    }),
    [theme, defaults]
  )
  return (
    <div className="group/theme relative">
      <button
        type="button"
        aria-pressed={chosen}
        onClick={onChoose}
        className={PICTURED}
      >
        <span className="block overflow-hidden rounded-[0.75rem] ring-1 ring-foreground/10">
          <Miniature
            theme={mode}
            colours={previewOf(theme)}
            palettes={palettes}
          />
        </span>
        <span className="truncate px-1 text-sm text-muted-foreground group-aria-pressed:text-foreground">
          {name}
        </span>
      </button>
      <div className="absolute top-3 right-3 flex gap-1.5">
        {onEdit && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onEdit}
                  className={cn(
                    CORNER,
                    "hover:bg-foreground hover:text-background"
                  )}
                />
              }
            >
              <PencilIcon className="size-3" />
              <span className="sr-only">Change {name}</span>
            </TooltipTrigger>
            <TooltipContent>Change</TooltipContent>
          </Tooltip>
        )}
        {onRemove && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onRemove}
                  className={cn(CORNER, "hover:bg-red-600 hover:text-white")}
                />
              }
            >
              <XIcon className="size-3.5" />
              <span className="sr-only">Remove {name}</span>
            </TooltipTrigger>
            <TooltipContent>Remove</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function Appearance() {
  const { theme: mode } = useTheme()
  const themes = useThemes((state) => state.themes)
  const chosen = useThemes((state) => state.chosen)
  const choose = useThemes((state) => state.choose)
  const remove = useThemes((state) => state.remove)
  const load = useThemes((state) => state.load)
  const setCreating = useThemes((state) => state.setCreating)
  const close = useStore((state) => state.setSettingsOpen)
  // (as they are now: one may have been written or taken away since)
  React.useEffect(() => void load(), [load])
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm text-muted-foreground">Theme</h2>
      <div className="grid grid-cols-3 gap-3">
        <ThemeCard
          theme={null}
          chosen={!chosen}
          onChoose={() => choose(DEFAULT_THEME)}
          onEdit={
            import.meta.env.DEV
              ? () => {
                  close(false)
                  setCreating("defaults", mode === "system" ? undefined : mode)
                }
              : undefined
          }
        />
        {themes.map((one) => (
          <ThemeCard
            key={one.id}
            theme={one}
            chosen={chosen?.id === one.id}
            onChoose={() => choose(one.id)}
            onRemove={
              import.meta.env.DEV ? () => void remove(one.id) : undefined
            }
            onEdit={
              import.meta.env.DEV
                ? () => {
                    close(false)
                    setCreating(
                      "theme",
                      mode === "system" ? undefined : mode,
                      one
                    )
                  }
                : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Beside the section's name: the look the window is drawn in, the system's, light or
 * dark; and, as the app is worked on, the theme creator, which the settings give way to,
 * over the whole window.
 */
function Looks() {
  const { theme, setTheme } = useTheme()
  const close = useStore((state) => state.setSettingsOpen)
  const setCreating = useThemes((state) => state.setCreating)
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        aria-label="Mode"
        variant="outline"
        size="sm"
        spacing={2}
        value={[theme]}
        // one is always chosen: pressing the chosen one again changes nothing
        onValueChange={(picked) => {
          const next = MODES.find(
            ({ value }) => value !== theme && picked.includes(value)
          )
          if (next) setTheme(next.value)
        }}
      >
        {MODES.map(({ value, label, Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={value}
                  aria-label={label}
                  // a circle, as the palette beside it is
                  className="size-8 min-w-0 rounded-full border-border bg-input/30 px-0 hover:bg-input/50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground"
                />
              }
            >
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      {import.meta.env.DEV && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => {
                  close(false)
                  setCreating("theme")
                }}
              />
            }
          >
            <PaletteIcon />
            <span className="sr-only">Create a theme</span>
          </TooltipTrigger>
          <TooltipContent>Create</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * How fast, against the speed it comes with: said as a share of that, and set by a
 * slider that takes up what room there is beside it.
 */
function Speed({
  label,
  value,
  range,
  onChange,
}: {
  label: string
  value: number
  range: { min: number; max: number }
  onChange: (value: number) => void
}) {
  return (
    <>
      <span className="w-10 font-mono text-sm text-muted-foreground tabular-nums">
        {Math.round(value * 100)}%
      </span>
      <PillSlider
        label={label}
        min={range.min}
        max={range.max}
        step={0.05}
        value={value}
        onChange={onChange}
        className="w-auto min-w-0 flex-1"
      />
    </>
  )
}

const DRAGS: { value: Drag; label: string }[] = [
  { value: "turn", label: "Turn" },
  { value: "pan", label: "Pan" },
  { value: "zoom", label: "Zoom" },
]

/**
 * Whose buttons a mouse's are set as, in a list that opens: there are more programs than
 * stand side by side in half a row. With a button set by hand they are nobody's.
 */
function Like({
  value,
  onChange,
}: {
  value: Preset | null
  onChange: (name: Preset) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Mouse buttons set up like"
            // drawn as the choices under it are, and as wide
            className="w-full justify-between border-input bg-transparent hover:bg-muted"
          />
        }
      >
        {value ? PRESET_WORDS[value] : "Your own"}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(name) => onChange(name as Preset)}
        >
          {(Object.keys(PRESET_WORDS) as Preset[]).map((name) => (
            <DropdownMenuRadioItem key={name} value={name} closeOnClick>
              {PRESET_WORDS[name]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Each row is in halves, what it is said in few words: there are many of them, and they
// are read down the page, the words on one side and what is chosen on the other.
function Navigation() {
  const scrolling = usePreferences((state) => state.scrolling)
  const turnSpeed = usePreferences((state) => state.turnSpeed)
  const zoomSpeed = usePreferences((state) => state.zoomSpeed)
  const wheelReversed = usePreferences((state) => state.wheelReversed)
  const pivot = usePreferences((state) => state.pivot)
  const upright = usePreferences((state) => state.upright)
  const middle = usePreferences((state) => state.middle)
  const right = usePreferences((state) => state.right)
  const shift = usePreferences((state) => state.shift)
  const ctrl = usePreferences((state) => state.ctrl)
  const change = usePreferences((state) => state.change)
  return (
    <>
      <Group title="Moving around the model">
        <Row
          halves
          title="Scrolling"
          detail="Turns on a trackpad, zooms with a wheel."
        >
          <Choice
            fill
            label="Scrolling"
            value={scrolling}
            onChange={(value) => change({ scrolling: value })}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "trackpad", label: "Trackpad" },
              { value: "wheel", label: "Mouse" },
            ]}
          />
        </Row>
        <Row halves title="Turning speed" detail="How fast the view turns.">
          <Speed
            label="Turning speed"
            value={turnSpeed}
            range={TURN_SPEED}
            onChange={(value) => change({ turnSpeed: value })}
          />
        </Row>
        <Row halves title="Zoom speed" detail="How fast the view zooms.">
          <Speed
            label="Zoom speed"
            value={zoomSpeed}
            range={ZOOM_SPEED}
            onChange={(value) => change({ zoomSpeed: value })}
          />
        </Row>
        <Row
          halves
          title="Reverse the wheel"
          detail="The wheel zooms the other way."
        >
          <Switch
            aria-label="Reverse the wheel"
            checked={wheelReversed}
            onCheckedChange={(on) => change({ wheelReversed: on })}
            className="ml-auto"
          />
        </Row>
      </Group>
      <Group title="Turning">
        <Row
          halves
          title="Turn about"
          detail="What stays still as the view turns."
        >
          <Choice
            fill
            label="Turn about"
            value={pivot}
            onChange={(value) => change({ pivot: value })}
            options={[
              { value: "view", label: "View" },
              { value: "selection", label: "Selection" },
              { value: "pointer", label: "Pointer" },
            ]}
          />
        </Row>
        <Row
          halves
          title="Keep the model upright"
          detail="Turning stops straight above and below."
        >
          <Switch
            aria-label="Keep the model upright"
            checked={upright}
            onCheckedChange={(on) => change({ upright: on })}
            className="ml-auto"
          />
        </Row>
      </Group>
      <Group title="Mouse buttons">
        <Row halves title="Set up like" detail="Sets the four below to match.">
          <Like
            value={presetOf({ middle, right, shift, ctrl })}
            onChange={(name) => change(PRESETS[name])}
          />
        </Row>
        <Row
          halves
          title="Middle button"
          detail="Press the wheel and move the mouse."
        >
          <Choice
            fill
            label="Middle button"
            value={middle}
            onChange={(value) => change({ middle: value })}
            options={DRAGS}
          />
        </Row>
        <Row
          halves
          title="Right button"
          detail="Hold it down and move the mouse."
        >
          <Choice
            fill
            label="Right button"
            value={right}
            onChange={(value) => change({ right: value })}
            options={[
              { value: "turn", label: "Turn" },
              { value: "pan", label: "Pan" },
            ]}
          />
        </Row>
        <Row
          halves
          title="With Shift held"
          detail="Either button, while Shift is down."
        >
          <Choice
            fill
            label="Either button with Shift held"
            value={shift}
            onChange={(value) => change({ shift: value })}
            options={DRAGS}
          />
        </Row>
        <Row
          halves
          title="With Ctrl held"
          detail="Either button. Both keys together zoom."
        >
          <Choice
            fill
            label="Either button with Ctrl held"
            value={ctrl}
            onChange={(value) => change({ ctrl: value })}
            options={DRAGS}
          />
        </Row>
      </Group>
    </>
  )
}

const CMD = MAC ? "⌘" : "Ctrl"
const SHIFT = MAC ? "⇧" : "Shift"
/** Stands between two ways of doing the same thing: a word, where the rest are keys. */
const OR = "or"
/**
 * Opening something as a project. A Mac's picker takes files and folders alike; no other
 * system's does.
 */
const OPENS: [string, string[]][] = MAC
  ? [["Open file or folder", [CMD, "O"]]]
  : [
      ["Open file", [CMD, "O"]],
      ["Open folder", [SHIFT, CMD, "O"]],
    ]
/**
 * What is done, and with what. A third thing on a row says that there are drags with a
 * mouse's buttons that do it too: whichever have been set to, in the settings for those.
 */
const KEYS: { title: string; rows: [string, string[], Drag?][] }[] = [
  {
    title: "Views",
    rows: [
      ["Home", [CMD, "1"]],
      ["Front, back", [CMD, "2", "3"]],
      ["Top, bottom", [CMD, "4", "5"]],
      ["Right, left", [CMD, "6", "7"]],
      ["Focus on the selection", ["Space"]],
    ],
  },
  {
    title: "The model",
    rows: [
      ["Shading", ["Z"]],
      ["Parts", ["P"]],
      ["Group the selection", [CMD, "G"]],
      ["Ungroup", [SHIFT, CMD, "G"]],
      ["Grid", [SHIFT, "G"]],
      ["Section", ["S"]],
      ["Section axis", ["X", "Y", "Z"]],
      ["Explode", ["E"]],
      ["Reference", [CMD, "/"]],
      ["Isolate the selection", ["I"]],
      ["Hide the selection, or show everything", ["H"]],
      ["Blueprint", ["B"]],
      ["PCB", [SHIFT, "P"]],
      ["Assembly", ["A"]],
      ["Inspiration Board", [SHIFT, "I"]],
      ["Search", [CMD, "F"]],
      ["Tools", ["T"]],
      ["Undo", [CMD, "Z"]],
      ["Redo", [SHIFT, CMD, "Z"]],
      ["Close, or step back", ["Esc"]],
    ],
  },
  {
    title: "PCB mode",
    rows: [
      ["Technical view", ["1"]],
      ["3D view", ["2"]],
      ["Schematic", ["3"]],
      ["Bottom side of the board", ["S"]],
      ["Parts on the board", ["P"]],
      ["Set views, in 3D", [CMD, "1–7"]],
      ["Exit PCB mode", ["Esc"]],
    ],
  },
  {
    title: "Inspiration Board",
    rows: [
      ["Go up to an image, or spread a group out", ["Click"]],
      ["Pin a note, on an image gone up to", ["Click"]],
      ["Add or remove an image", [SHIFT, "Click"]],
      ["Group what is selected", [CMD, "G"]],
      ["Ungroup", [SHIFT, CMD, "G"]],
      ["Delete what is selected", ["Delete"]],
      ["Delete without asking", [CMD, "Delete"]],
      ["Select everything", [CMD, "A"]],
      ["Show every note", ["N"]],
      ["Search", [CMD, "F"]],
      ["All of the board", [CMD, "1"]],
      ["Step back, or exit", ["Esc"]],
    ],
  },
  {
    title: "The app",
    rows: [
      ["New project", [CMD, "N"]],
      ...OPENS,
      ["Conversation", [CMD, "B"]],
      ["Clear the view", [CMD, "."]],
      ["Settings", [CMD, ","]],
    ],
  },
  {
    title: "Trackpad",
    rows: [
      ["Turn", ["Two fingers"]],
      ["Zoom", ["Pinch"]],
      ["Pan", [SHIFT, "Two fingers"]],
    ],
  },
  {
    title: "Mouse",
    rows: [
      ["Turn", [], "turn"],
      ["Zoom", ["Wheel"], "zoom"],
      ["Pan", [], "pan"],
    ],
  },
  {
    title: "Selecting",
    rows: [
      ["Select a part, or the object it belongs to", ["Click"]],
      ["Select a single part", ["Double click", OR, CMD, "Click"]],
      ["Add or remove a part", [SHIFT, "Click"]],
      ["Add a whole object", [SHIFT, "Double click"]],
      ["Select everything inside a box", ["Drag right"]],
      ["Select everything a box touches", ["Drag left"]],
      ["Add to the selection", [SHIFT, "Drag"]],
    ],
  },
]

/** A drag with a mouse's button, as the keys it is done with. */
const dragKeys = ({ button, held }: Way) => [
  ...(held === "shift" ? [SHIFT] : held === "ctrl" ? ["Ctrl"] : []),
  button === "right" ? "Right drag" : "Middle drag",
]

function Shortcuts() {
  const middle = usePreferences((state) => state.middle)
  const right = usePreferences((state) => state.right)
  const shift = usePreferences((state) => state.shift)
  const ctrl = usePreferences((state) => state.ctrl)
  const ways = waysOf({ middle, right, shift, ctrl })
  return (
    <>
      {KEYS.map((group) => (
        <Group key={group.title} title={group.title}>
          {group.rows.map(([what, keys, drag]) => {
            const all = [
              ...(keys.length > 0 ? [keys] : []),
              ...(drag ? ways[drag].map(dragKeys) : []),
            ].flatMap((way, index) => (index > 0 ? [OR, ...way] : way))
            // (a mouse may have been left with no way to do one of these)
            if (all.length === 0) return null
            return (
              <Row key={what} title={what}>
                {all.map((key, index) =>
                  key === OR ? (
                    <span key={index} className="text-xs text-muted-foreground">
                      {key}
                    </span>
                  ) : (
                    <Kbd key={index}>{key}</Kbd>
                  )
                )}
              </Row>
            )
          })}
        </Group>
      ))}
    </>
  )
}

/**
 * The services the app keeps the user's work with, each with the button that connects
 * it. GitHub first: every project backed up to a private repository of its own on the
 * user's account, after every change, with nothing more asked of them.
 */
function Connections() {
  const { connection, backingUp, failures } = useStore((state) => state.github)
  const { github } = window.cad
  // a project whose history could not be kept, or pushed, the last time: the latest
  const [failed] = failures
  const failing =
    failed &&
    `${failures.length > 1 ? `${failures.length} projects failed to back up. ` : ""}${failed.name}: ${failed.why}`
  const said =
    connection.state === "unavailable"
      ? "Not available in this version of Enclose."
      : connection.state === "off"
        ? (connection.trouble ??
          failing ??
          "Back up your projects to private repositories.")
        : connection.state === "code" || connection.state === "install"
          ? "Connecting…"
          : backingUp
            ? `Backing up to @${connection.login}: ${backingUp.done} of ${backingUp.total}`
            : (failing ?? `Backed up to @${connection.login}.`)
  const troubled =
    (connection.state === "off" && connection.trouble !== null) ||
    ((connection.state === "off" || connection.state === "on") &&
      !backingUp &&
      Boolean(failing))
  return (
    // laid out as the agents are, each with its mark
    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      <div className="flex min-h-24.5 items-center gap-5 pr-7 pl-8">
        <span className="flex min-w-0 flex-1 items-center gap-6">
          <GitHubIcon className="size-6.5 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">GitHub</span>
            <span
              // (the whole of it on the pointer, where it is cut short)
              title={failing ? said : undefined}
              className={cn(
                "truncate text-sm text-muted-foreground",
                troubled && "text-destructive"
              )}
            >
              {said}
            </span>
          </span>
        </span>
        {connection.state === "off" && (
          <Button size="sm" onClick={() => void github.connect()}>
            Connect
          </Button>
        )}
        {connection.state === "on" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void github.disconnect()}
          >
            Disconnect
          </Button>
        )}
      </div>
      <ConnectGitHub connection={connection} />
    </div>
  )
}

/**
 * What of other people's code goes out with the app, and under what terms: opened in the
 * system's own reader. The app as it is worked on has it only once it has been built.
 */
function Licenses() {
  const [none, setNone] = React.useState(false)
  return (
    <Row
      title="Third-party licenses"
      detail={
        none ? "Written when the app is built (npm run build)" : undefined
      }
    >
      <button
        type="button"
        onClick={() =>
          void window.cad.settings
            .openLicenses()
            .then((opened) => setNone(!opened))
        }
        className="cursor-pointer text-sm underline underline-offset-4"
      >
        Open
      </button>
    </Row>
  )
}

function About() {
  return (
    <Group title="Enclose">
      <Row title="Version" detail={__APP_VERSION__} />
      <Row title="Website">
        <a
          href="https://enclose.dev"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline underline-offset-4"
        >
          enclose.dev
        </a>
      </Row>
      <Licenses />
      <Row title="Fork it and collaborate">
        <a
          href="https://github.com/enclosedev/enclose"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline underline-offset-4"
        >
          github.com/enclosedev/enclose
        </a>
      </Row>
    </Group>
  )
}

const PAGES: Record<SectionId, () => React.ReactNode> = {
  general: General,
  appearance: Appearance,
  navigation: Navigation,
  shortcuts: Shortcuts,
  providers: Providers,
  connections: Connections,
  about: About,
}

/** What is done to all of a section, for the ones that have it: beside its name. */
const BESIDE: Partial<Record<SectionId, () => React.ReactNode>> = {
  providers: CheckAgain,
  appearance: Looks,
}

/**
 * The settings, in a panel that floats over the window from its left side: the sections
 * down the left of it, and beside them the one that is open, under its name. The app is
 * still to be seen past the panel, dimmed. Esc, the cross, or a click on the app puts
 * the settings away.
 */
export function Settings() {
  const close = useStore((state) => state.setSettingsOpen)
  const [open, setOpen] = React.useState<SectionId>("general")
  const Page = PAGES[open]
  const Beside = BESIDE[open]
  const section = SECTIONS.find((item) => item.id === open)

  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // a dialog over the settings is put away first, by itself
      if (document.querySelector('[data-slot="connect-github"]')) return
      // before anything under the settings hears it
      event.stopPropagation()
      event.preventDefault()
      close(false)
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [close])

  // what is typed is the settings' from the moment they open, not the message box's
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => panel.current?.focus(), [])

  return (
    <div className="settings fixed inset-0 z-40 text-foreground">
      <div
        aria-hidden
        className="no-drag absolute inset-0 animate-in bg-black/30 duration-200 fade-in-0 dark:bg-black/50"
        onClick={() => close(false)}
      />
      {/* (the window's own corners are the panel's on the left, where it meets its edge) */}
      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-label="Settings"
        tabIndex={-1}
        className="no-drag absolute inset-y-0 left-0 flex w-205 max-w-full animate-in flex-col rounded-r-xl bg-background shadow-2xl ring-1 ring-foreground/10 duration-200 fade-in-0 outline-none slide-in-from-left-3"
      >
        {/* room for the window's traffic lights, and something to drag it by */}
        <div className="drag h-12 shrink-0" />
        <div className="flex min-h-0 flex-1">
          {/* the mark level with the open section's name, and the sections level with
              what is under it: the first of them on a line with its first words */}
          <nav className="flex w-41.25 shrink-0 flex-col items-start pt-2.75 pl-7.5">
            <div
              className="mb-7.75 flex h-8 items-center"
              style={{ marginLeft: -LOGO_INSET }}
            >
              <Logo size={LOGO_SIZE} />
            </div>
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-current={open === id ? "page" : undefined}
                onClick={() => setOpen(id)}
                className={cn(
                  "flex h-5.75 items-center rounded-sm text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  open === id
                    ? "text-foreground"
                    : "text-muted-foreground/75 hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          {/* each section is read from its top, and goes up out of sight softly; it is
              let out to the left by as much as it is padded there, so the rings round its
              cards and controls aren't cut off at their left edge */}
          <main
            key={open}
            className="-ml-1 min-w-0 flex-1 overflow-y-auto mask-t-from-[calc(100%-0.625rem)] pr-12 pl-1"
          >
            <div className="flex flex-col gap-8 pt-2.75 pb-10">
              <div className="flex items-center justify-between gap-4">
                <h1 className="px-0.5 text-2xl font-medium">
                  {section?.label}
                </h1>
                {Beside && <Beside />}
              </div>
              <Page />
            </div>
          </main>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => close(false)}
                className="absolute bottom-3 left-4 flex size-9 items-center justify-center rounded-full bg-muted outline-none hover:bg-foreground/15 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            }
          >
            <XIcon
              className="size-5.5"
              absoluteStrokeWidth
              strokeWidth={1.25}
            />
            <span className="sr-only">Close settings</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="has-data-[slot=kbd]:pr-2.5">
            Close
            <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
