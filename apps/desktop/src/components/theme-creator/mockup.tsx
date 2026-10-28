// The window in a theme being made, for its colours to be seen as they are picked: the
// projects' cards in each of the ways a card can be, a part in each of the palette's
// colours in the view, the project's tools, and a conversation with what the user says in
// it in each of its bubbles. Or, for a circuit board's colours, the view in PCB mode,
// with a board in it, and the cards put away for it; or, for the settings', the window
// with them open over it. It is drawn as the window is, in the same classes and tokens, but
// of nothing real: none of it does anything but show a colour, apart from the parts,
// which pick their colour to be changed, and PCB mode's buttons for the ways a board is
// looked at, which change it.
import * as React from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { cn } from "cn"
import {
  ArrowUpIcon,
  BookOpenIcon,
  BoxesIcon,
  ChevronDownIcon,
  ClockIcon,
  CpuIcon,
  DownloadIcon,
  Grid3x3Icon,
  HammerIcon,
  LayersIcon,
  MessageSquareIcon,
  MoveVerticalIcon,
  PlusIcon,
  Rotate3dIcon,
  SearchIcon,
  SettingsIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"

import { PALETTE_NAMES, type PaletteName } from "@shared/palette"
import type { Mode, PcbColours, ThemeColours } from "@shared/theme-format"
import { Logo } from "@/components/mark"
import { Group, Row } from "@/components/setting"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EDGE } from "@/components/viewport/paint"
import { BOARD_AS, type BoardAs } from "@/lib/store"
import { propertiesOf } from "@/lib/themes"
import { CORNER, LIGHTS, LOOKING_FROM, PLACES, shapeOf } from "./parts"
import {
  SAMPLE_NAME,
  SAMPLE_LAYERS,
  SampleBoard,
  sampleSize,
  useSampleCircuit,
} from "./sample-board"

/** How big the window is drawn, before it is made to fit where it is shown. */
export const MOCKUP = { width: 1280, height: 800 }

// as the sidebar draws a card (sidebar.tsx)
const CARD =
  "glass relative flex w-full flex-col rounded-xl px-3 py-2.5 text-left ring-1"
const LIT = "bg-sidebar-accent/90 shadow-sm ring-card-outline"
const UNLIT = "bg-sidebar-accent/45 ring-card-outline/35"
const SMALL = "text-[12px] leading-[1.4]"

/** The cards down the side: one in each of the ways a card can be. */
const CARDS: {
  name: string
  said: string
  lit?: boolean
  when?: string
  news?: { label: string; className: string; going?: string }
}[] = [
  {
    name: "Split-flap cube",
    said: "Rebuilding the plate board with the new connector",
    lit: true,
    news: {
      label: "Working",
      className: "text-attention shimmer shimmer-color-attention-shimmer",
      going: "2m 14s",
    },
  },
  {
    name: "Table clock",
    said: "Which movement should the hands fit?",
    news: { label: "Needs you", className: "text-attention" },
  },
  {
    name: "Desk lamp",
    said: "Making the switch board",
    news: {
      label: "Making a board",
      className: "text-attention shimmer shimmer-color-attention-shimmer",
      going: "48s",
    },
  },
  {
    name: "Cloque",
    said: "Box ends built; solder wires first",
    news: { label: "Done", className: "text-foreground" },
  },
  {
    name: "IEC power connectors",
    said: "Start a new session",
    when: "1d",
  },
  {
    name: "meedee-device",
    said: "The case could not be built",
    news: { label: "Failed", className: "text-destructive" },
  },
]

function Cards() {
  return (
    <div className="absolute top-12 left-4.5 flex w-56 flex-col items-start gap-1.5">
      {CARDS.map((card) => (
        <div key={card.name} className={cn(CARD, card.lit ? LIT : UNLIT)}>
          <span
            className={cn(
              "flex flex-col gap-0.5",
              card.news &&
                "[mask-image:linear-gradient(to_right,black_calc(100%-6.75rem),rgb(0_0_0/0.04)_calc(100%-4.375rem))]"
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn(SMALL, "truncate font-medium")}>
                {card.name}
              </span>
              {card.when && (
                <span className={cn(SMALL, "text-muted-foreground/60")}>
                  {card.when}
                </span>
              )}
            </span>
            <span
              className={cn(
                SMALL,
                "line-clamp-2 min-h-[2lh] text-muted-foreground"
              )}
            >
              {card.said}
            </span>
          </span>
          {card.news && (
            <span
              className={cn(
                SMALL,
                "absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-end font-medium",
                card.news.className
              )}
            >
              {card.news.label}
              {card.news.going && (
                <span className="font-normal tabular-nums">
                  {card.news.going}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
      <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-background/60 ring-1 ring-foreground/10">
        <PlusIcon className="size-4.5" strokeWidth={1.5} />
      </span>
    </div>
  )
}

/** One of them, in its colour, with its edges drawn where it has corners. */
function Part({
  name,
  colour,
  picked,
  position,
  onPick,
}: {
  name: PaletteName
  colour: string
  picked: boolean
  position: [number, number, number]
  onPick: () => void
}) {
  const geometry = React.useMemo(() => shapeOf(name), [name])
  const edges = React.useMemo(
    () => new THREE.EdgesGeometry(geometry, CORNER),
    [geometry]
  )
  React.useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges]
  )
  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation()
        onPick()
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial color={colour} metalness={0.1} roughness={0.62} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={picked ? "#ffffff" : EDGE} />
      </lineSegments>
    </group>
  )
}

/** A part in each of the palette's colours, in rows, lit as the view lights a model. */
function Parts({
  palette,
  picked,
  onPick,
}: {
  palette: Record<PaletteName, string>
  picked: PaletteName | null
  onPick: (name: PaletteName) => void
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: LOOKING_FROM, zoom: 52 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      // (it is drawn scaled down to fit: sized by its own box, not as it is seen)
      resize={{ offsetSize: true }}
    >
      <ambientLight intensity={LIGHTS.ambient} />
      <hemisphereLight args={LIGHTS.sky} />
      <directionalLight {...LIGHTS.key} />
      <directionalLight {...LIGHTS.fill} />
      {PALETTE_NAMES.map((name) => (
        <Part
          key={name}
          name={name}
          colour={palette[name]}
          picked={picked === name}
          position={PLACES[name]}
          onPick={() => onPick(name)}
        />
      ))}
    </Canvas>
  )
}

// as the buttons down the view's right-hand edge are drawn (tools.tsx)
const ROUND =
  "flex size-9 items-center justify-center rounded-full bg-background/60 ring-1 ring-foreground/10"
const LIT_ROUND = "bg-primary text-primary-foreground ring-primary"

/** Down the view's right-hand edge: how it is looked at, and the project's own tools, open. */
function Rail() {
  const round = ROUND
  return (
    <>
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <span className={cn(round, "bg-primary text-primary-foreground")}>
          <MessageSquareIcon className="size-4" strokeWidth={1.5} />
        </span>
        <span className={round}>
          <DownloadIcon className="size-4" strokeWidth={1.5} />
        </span>
      </div>
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-2">
        {[
          BoxesIcon,
          Grid3x3Icon,
          MoveVerticalIcon,
          CpuIcon,
          BookOpenIcon,
          SearchIcon,
        ].map((Icon, index) => (
          <span key={index} className={round}>
            <Icon className="size-4" strokeWidth={1.5} />
          </span>
        ))}
        <span className={cn(round, "bg-tool text-white ring-2 ring-white")}>
          <HammerIcon className="size-4" strokeWidth={1.5} />
        </span>
      </div>
      {/* the tools' panel, as one of them opens it */}
      <div className="absolute right-15 bottom-6 flex w-72 flex-col overflow-hidden rounded-2xl bg-tool-panel text-white shadow-lg ring-1 ring-tool-line">
        <div className="flex gap-5 border-b border-white/15 px-4 pt-3 text-sm">
          <span className="pb-2.5 text-white/60">Flaps</span>
          <span className="border-b-2 border-white pb-2.5">Grid</span>
          <span className="pb-2.5 text-white/60">Housing</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-white/15 px-4 py-3">
          <span className="flex flex-col text-[13px]">
            Grid
            <span className="text-white/60">Copies round the cube</span>
          </span>
          <span className="relative h-5 w-9 rounded-full bg-white">
            <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-tool" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-[13px]">Across</span>
          <span className="relative h-5 w-36 rounded-full bg-white/25">
            <span className="absolute top-0.5 left-12 size-4 rounded-full bg-white" />
          </span>
        </div>
      </div>
    </>
  )
}

/** The ways a board is looked at in PCB mode, as the buttons for them have it (tools.tsx). */
const BOARD_WAYS: Record<BoardAs, { label: string; Icon: typeof LayersIcon }> =
  {
    pcb: { label: "Technical view", Icon: LayersIcon },
    "3d": { label: "3D view", Icon: Rotate3dIcon },
    schematic: { label: "Schematic", Icon: WorkflowIcon },
  }

/**
 * Down the view's right-hand edge in PCB mode: the conversation at the top, and in the
 * middle the ways the board is looked at, which change it here as they do there, with
 * the board's layers under the technical view's while it is up, what is on it, and what
 * leaves PCB mode, in red.
 */
function BoardRail({
  as,
  onAs,
  layer,
  onLayer,
}: Pick<BoardShown, "as" | "onAs" | "layer" | "onLayer">) {
  return (
    <>
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <span className={cn(ROUND, LIT_ROUND)}>
          <MessageSquareIcon className="size-4" strokeWidth={1.5} />
        </span>
      </div>
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-2">
        {BOARD_AS.flatMap((way) => {
          const { label, Icon } = BOARD_WAYS[way]
          return [
            <button
              key={way}
              type="button"
              title={label}
              aria-pressed={as === way}
              onClick={() => onAs(way)}
              className={cn(
                ROUND,
                "cursor-pointer",
                as === way ? LIT_ROUND : "hover:bg-background"
              )}
            >
              <Icon className="size-4" strokeWidth={1.5} />
              <span className="sr-only">{label}</span>
            </button>,
            // (as tools.tsx has them: a little in, the one drawn in grey)
            ...(way === "pcb" && as === "pcb"
              ? Array.from({ length: SAMPLE_LAYERS }, (_, at) => (
                  <button
                    key={`layer-${at + 1}`}
                    type="button"
                    title={`Layer ${at + 1}`}
                    aria-pressed={layer === at + 1}
                    onClick={() => onLayer(at + 1)}
                    className={cn(
                      ROUND,
                      "relative right-2 cursor-pointer text-sm tabular-nums",
                      layer === at + 1
                        ? "bg-foreground/15"
                        : "hover:bg-background"
                    )}
                  >
                    {at + 1}
                  </button>
                ))
              : []),
          ]
        })}
        <span className={ROUND}>
          <BoxesIcon className="size-4" strokeWidth={1.5} />
        </span>
        <span
          className={cn(ROUND, "bg-destructive text-white ring-destructive")}
        >
          <XIcon className="size-4" strokeWidth={1.5} />
        </span>
      </div>
    </>
  )
}

/** What the board is, over it at the top: what it is called, and how big it is. */
function BoardTitle() {
  const size = sampleSize(useSampleCircuit())
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{SAMPLE_NAME}</span>
        {size && (
          <span className="text-foreground/45 tabular-nums">{size}</span>
        )}
      </div>
    </div>
  )
}

/** A board in PCB mode, as the window is shown with one (see `Mockup`). */
export type BoardShown = {
  /** the way it is looked at, and what changes that */
  as: BoardAs
  onAs: (as: BoardAs) => void
  /** which of its layers of copper is drawn in the technical view, the top's 1, and what changes that */
  layer: number
  onLayer: (layer: number) => void
  /** its colours, as they are picked, over what they are over */
  colours: PcbColours
  /** the view's ground, likewise */
  ground: string
}

/** The sections of the settings, down the side of their panel (settings.tsx). */
const SETTINGS_SECTIONS = [
  "General",
  "Navigation",
  "Shortcuts",
  "Providers",
  "Connections",
  "Appearance",
  "About",
]

/**
 * The settings, open over the window at their first section, as the settings draw them
 * (settings.tsx), with their own parts: in their own colours, and doing nothing.
 */
function SettingsOver() {
  return (
    <div inert className="settings absolute inset-0 text-foreground">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
      <div className="absolute inset-y-0 left-0 flex w-205 flex-col overflow-hidden rounded-r-xl bg-background shadow-2xl ring-1 ring-foreground/10">
        <div className="h-12 shrink-0" />
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-41.25 shrink-0 flex-col items-start pt-2.75 pl-7.5">
            <div className="mb-7.75 -ml-1.5 flex h-8 items-center">
              <Logo size={28} />
            </div>
            {SETTINGS_SECTIONS.map((section, index) => (
              <span
                key={section}
                className={cn(
                  "flex h-5.75 items-center text-[13px]",
                  index === 0 ? "text-foreground" : "text-muted-foreground/75"
                )}
              >
                {section}
              </span>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-8 pt-2.75 pr-12 pb-10">
            <h1 className="px-0.5 text-2xl font-medium">General</h1>
            <Group title="New projects">
              <Row
                title="Projects folder"
                detail={
                  <>
                    Where new projects are saved.
                    <span className="mt-1 block font-mono text-[13px]">
                      ~/Documents/Enclose · 1.9 GB
                    </span>
                  </>
                }
              >
                <Button variant="ghost" size="sm">
                  Show
                </Button>
                <Button variant="outline" size="sm">
                  Change…
                </Button>
              </Row>
              <Row
                title="Opened files"
                detail="Names and groups the parts of CAD files you open."
              >
                <Switch checked />
              </Row>
            </Group>
            <Group title="Conversations">
              <Row title="Permissions" detail="Never asks.">
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={["full"]}
                >
                  {["Supervised", "Edits", "Auto", "Full"].map((label) => (
                    <ToggleGroupItem
                      key={label}
                      value={label.toLowerCase()}
                      className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    >
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Row>
              <Row
                title="Versions"
                detail="Each conversation keeps its own version of the project. Off, they all change the same one."
              >
                <Switch checked />
              </Row>
              <Row
                title="Token usage"
                detail="While Claude thinks, shows about how many tokens it has used."
              >
                <Switch checked={false} />
              </Row>
            </Group>
            <Group title="Blueprints">
              <Row title="Units" detail="The unit dimensions are shown in.">
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={["mm"]}
                >
                  {["mm", "in"].map((label) => (
                    <ToggleGroupItem
                      key={label}
                      value={label}
                      className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    >
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Row>
            </Group>
          </div>
        </div>
        <span className="absolute bottom-3 left-4 flex size-9 items-center justify-center rounded-full bg-muted">
          <XIcon className="size-5.5" strokeWidth={1.25} />
        </span>
      </div>
    </div>
  )
}

/** What the user says, in its bubble: as the conversation draws it (thread.tsx). */
function Said({
  children,
  waiting,
}: {
  children: React.ReactNode
  waiting?: boolean
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] self-end rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
        waiting
          ? "border border-dashed border-foreground/25 text-muted-foreground"
          : "bg-user-message"
      )}
    >
      {children}
    </div>
  )
}

const Worked = ({ took }: { took: string }) => (
  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
    Worked for {took}
    <ChevronDownIcon className="size-3.5 opacity-60" />
  </span>
)

/** The conversation beside the view, with what the user says in each of its bubbles. */
function Conversation() {
  return (
    <aside className="flex w-95 shrink-0 flex-col border-l bg-chat">
      <div className="flex h-12 shrink-0 items-center px-5 text-[13px] font-medium">
        Rework the split-flap cube
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pt-2 text-sm leading-relaxed">
        <Said>Make the wall plate take two cubes side by side</Said>
        <Worked took="1m 48s" />
        <p>
          The plate is 200 mm wide now, with two cells on it and the main board
          under the right-hand one. Its power lead comes down at the right edge.
        </p>
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            <CpuIcon className="size-3" strokeWidth={1.5} />
            Main plate board
          </span>
          <Said>Build this board again: its Gerbers are outdated.</Said>
        </div>
        <Worked took="1m 11s" />
        <p>
          I rebuilt the main plate board, and its Gerbers now match the board as
          it is. All five ordering checks pass.
        </p>
        <Said>
          Can the cube come apart for the flaps to be changed? Screws are fine,
          as long as none show from the front.
        </Said>
        <div className="flex flex-col items-end gap-1">
          <Said waiting>And round the housing&apos;s front edge a little</Said>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3" strokeWidth={1.5} />
            Queued
          </span>
        </div>
      </div>
      <div className="m-3 mt-2 flex flex-col gap-3 rounded-2xl border border-input bg-input/30 px-3.5 py-3">
        <span className="text-sm text-muted-foreground">
          Ask anything, @tag parts, $use skills or / for commands
        </span>
        <span className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#d97757]" />
            Opus 5.5, High, Full access
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ArrowUpIcon className="size-3.5" />
          </span>
        </span>
      </div>
    </aside>
  )
}

/**
 * The window drawn in a theme's colours for one look, at its own size (MOCKUP). It shows
 * that theme whatever the window it is in is drawn in.
 */
export function Mockup({
  mode,
  colours,
  base,
  palette,
  board,
  settings = false,
  picked,
  onPick,
}: {
  mode: Mode
  colours: ThemeColours
  /** the colours are of the app's own look, over it as src/index.css has it */
  base: boolean
  /** the palette as the colours have it, over what they are over */
  palette: Record<PaletteName, string>
  /** the view is in PCB mode, with this board: null for the model's parts */
  board: BoardShown | null
  /** the settings are open over the window */
  settings?: boolean
  /** the part colour being changed, if one is */
  picked: PaletteName | null
  onPick: (name: PaletteName) => void
}) {
  return (
    <div
      data-theme-preview=""
      data-theme-base={base ? "" : undefined}
      className={cn(
        mode,
        "thin-icons relative flex overflow-hidden rounded-xl bg-sidebar text-foreground shadow-2xl ring-1 ring-foreground/15"
      )}
      style={{ ...propertiesOf(colours), ...MOCKUP }}
    >
      <div className="relative min-w-0 flex-1">
        {board ? (
          <div className="absolute inset-0">
            <SampleBoard
              as={board.as}
              layer={board.layer}
              colours={board.colours}
              dark={mode === "dark"}
              ground={board.ground}
            />
            <BoardTitle />
          </div>
        ) : (
          // between the cards and the buttons down the right
          <div className="absolute inset-y-0 right-16 left-62">
            <Parts palette={palette} picked={picked} onPick={onPick} />
          </div>
        )}
        {/* the window's own buttons, in its corner */}
        <div className="absolute top-4 left-4.5 flex gap-2">
          {["#ff5f57", "#febc2e", "#28c840"].map((colour) => (
            <span
              key={colour}
              className="size-3 rounded-full"
              style={{ background: colour }}
            />
          ))}
        </div>
        {!board && <Cards />}
        <span className="absolute bottom-4 left-4.5 flex size-9 items-center justify-center rounded-full bg-background/60 ring-1 ring-foreground/10">
          <SettingsIcon className="size-4" strokeWidth={1.5} />
        </span>
        {board ? <BoardRail {...board} /> : <Rail />}
      </div>
      <Conversation />
      {settings && <SettingsOver />}
    </div>
  )
}
