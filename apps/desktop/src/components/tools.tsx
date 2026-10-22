import * as React from "react"
import { cn } from "cn"
import {
  FlipHorizontal2Icon,
  BookOpenIcon,
  BoxesIcon,
  DownloadIcon,
  DraftingCompassIcon,
  ExpandIcon,
  Grid3x3Icon,
  HammerIcon,
  ImagesIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LetterTextIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  Rotate3dIcon,
  RotateCcwIcon,
  SearchIcon,
  UnfoldVerticalIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"

import { BoardIcon, ReferenceIcon, SectionIcon } from "@/components/icons"
import { BoardAtWorkRing } from "@/components/pcb/at-work"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useInspiration } from "@/lib/inspiration"
import { oneFile, sizeOf } from "@/lib/model"
import { MAC } from "@/lib/platform"
import { usePreferences, type Format } from "@/lib/preferences"
import { savedAs } from "@/lib/saved"
import { BOARD_AS, SPREAD, useStore, type BoardAs } from "@/lib/store"
import type { BoardSummary } from "@shared/api"
import type { Box3 } from "three"
import type { LoadedModel } from "./viewport/load"
import { cutOpenThrough, sectionFacing } from "./viewport/section-planes"

/**
 * What every button floating over the view is: a frosted circle of its own. And it
 * fades out where all of them are put away (see `Tools`), each by itself and not all as
 * one: glass inside something that is fading has nothing behind it to be glass over.
 * Its icon is drawn in thinner lines than an icon's own (see .thin-icons).
 */
const ROUND =
  "glass size-9 bg-background/60 px-0 shadow-sm ring-1 ring-foreground/10 transition-[color,background-color,border-color,opacity] duration-200 group-data-[away]/tools:opacity-0! thin-icons"

/** The edge of the view the buttons are down. */
const EDGE = "group/tools pointer-events-none absolute inset-y-0 right-0 w-15"

/**
 * How far the two buttons that stand beside the Section's while the model is cut open
 * reach from it, in px: each as wide as a button, with the room kept between buttons,
 * and a little more for a name to stand clear of them.
 */
const BESIDE = 2 * 36 + 2 * 6 + 4

/** Buttons that belong together, one under the other. */
function Stack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("pointer-events-auto flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

type Side = React.ComponentProps<typeof TooltipContent>["side"]

// The tooltips here are names, with nothing in them to reach for: they go as soon as the
// pointer leaves their button, so one never lies over the button beside it.

/** A button that does one thing, named by its tooltip. */
function Press({
  label,
  detail,
  shortcut,
  side = "left",
  onClick,
  className,
  children,
}: {
  label: string
  /** something more about it, said more quietly beside the name */
  detail?: string
  /** the key that does the same, shown beside the name */
  shortcut?: string
  /** where the tooltip goes, when something else has the left */
  side?: Side
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn(ROUND, className)}
            onClick={onClick}
          />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side={side} className="has-data-[slot=kbd]:pr-2.5">
        {label}
        {detail && <span className="tabular-nums opacity-60">{detail}</span>}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

/** A button that is either on or off, named by its tooltip. */
export function Switch({
  label,
  opens,
  shortcut,
  side = "left",
  away,
  on,
  onChange,
  disabled,
  className,
  children,
}: {
  label: string
  className?: string
  /** there is nothing for it to do, as things are: it is there, and is not to be pressed */
  disabled?: boolean
  /** what the button brings up, for that thing to know its own button by */
  opens?: string
  /** the key that does the same, shown beside the name */
  shortcut?: string
  /** where the tooltip goes, when something else has the left */
  side?: Side
  /** how far from the button it goes, in px, when something stands between */
  away?: number
  on: boolean
  onChange: (on: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <Toggle
            pressed={on}
            onPressedChange={onChange}
            disabled={disabled}
            data-opens={opens}
            aria-keyshortcuts={shortcut
              ?.replace("⌘", "Meta+")
              .replace("Ctrl ", "Control+")
              .replace(/⇧|Shift /, "Shift+")}
            className={cn(
              ROUND,
              "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground",
              className
            )}
          />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      {/* a little room on the right, or the arrow bites into the key */}
      <TooltipContent
        side={side}
        sideOffset={away}
        className="has-data-[slot=kbd]:pr-2.5"
      >
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

/** What the model's files can be saved as, in the order they are offered. */
const FORMATS: { value: Format; label: string }[] = [
  { value: "step", label: "STEP" },
  { value: "stl", label: "STL" },
  { value: "obj", label: "OBJ" },
]

/**
 * The model as files, to take elsewhere: a button that brings up the ways there are to
 * have it. All of it in one file, every part in its place; or its parts, each in a file
 * of its own, in one archive. One part of it, or the parts of one group, are had from
 * the list of parts. Each is had as STEP, for CAD, as the build wrote it; or as a mesh,
 * STL for a slicer or OBJ for a 3D program, made of what the view draws. What is chosen
 * here is what the list of parts saves, too.
 */
function Downloads({
  loaded,
  projectId,
}: {
  loaded: LoadedModel
  projectId: string
}) {
  const [open, setOpen] = React.useState(false)
  const say = useStore((state) => state.say)
  const format = usePreferences((state) => state.format)
  const change = usePreferences((state) => state.change)
  const { downloads, title, parts: every } = loaded.model
  if (loaded.standIn || every.length === 0) return null
  const step = oneFile(downloads)
  // (a model of one part is all there in that part's file: there is nothing to archive)
  const parts = downloads.filter((file) => file.kind === "part")
  const apart = parts.length > 1 ? parts : []
  const called =
    step?.name.replace(/\.[^.]+$/, "") ||
    (title ?? "model").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
  const kind = FORMATS.find((one) => one.value === format)!.label
  const zipped = (count: number) => (saved: boolean) => {
    if (saved) say(`Saved ${count} parts as a zip`)
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverablePopup>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className={ROUND} />}
            />
          }
        >
          <DownloadIcon />
          <span className="sr-only">Download</span>
        </TooltipTrigger>
        {!open && <TooltipContent side="left">Download</TooltipContent>}
      </Tooltip>
      {/* (wide enough for a name and a size on one line) */}
      <DropdownMenuContent side="left" align="start" className="w-60">
        <ToggleGroup
          aria-label="Format"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full p-1"
          value={[format]}
          // one is always chosen: pressing the chosen one again changes nothing
          onValueChange={(chosen) => {
            const next = chosen.find((one) => one !== format) as
              Format | undefined
            if (next) change({ format: next })
          }}
        >
          {FORMATS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="flex-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85 aria-pressed:hover:text-primary-foreground"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {format === "step" ? (
          step || apart.length > 0 ? (
            <DropdownMenuGroup>
              {step && (
                <DropdownMenuItem
                  onClick={() =>
                    void window.cad.model.saveCopy(
                      projectId,
                      step.file,
                      savedAs(step.name)
                    )
                  }
                >
                  Full model
                  <Size kind={kind} bytes={step.bytes} />
                </DropdownMenuItem>
              )}
              {apart.length > 0 && (
                <DropdownMenuItem
                  onClick={() =>
                    void window.cad.model
                      .saveArchive(
                        projectId,
                        apart.map(({ file, name }) => ({ file, name })),
                        savedAs(`${called}-parts.zip`)
                      )
                      .then(zipped(apart.length))
                  }
                >
                  Zip with parts
                  {/* (what the files in it come to: the archive itself is smaller) */}
                  <Size
                    kind={kind}
                    bytes={apart.reduce((all, file) => all + file.bytes, 0)}
                  />
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          ) : (
            // a model made of a mesh, or built without them
            <p className="px-2 py-1.5 text-xs text-balance text-muted-foreground">
              This model has no STEP files. It can be saved as STL or OBJ.
            </p>
          )
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() =>
                void window.cad.model.saveMeshes(
                  projectId,
                  format,
                  [
                    {
                      name: `${called}.${format}`,
                      parts: every.map((part) => part.id),
                    },
                  ],
                  "file",
                  savedAs(`${called}.${format}`)
                )
              }
            >
              Full model
              <Size kind={kind} />
            </DropdownMenuItem>
            {every.length > 1 && (
              <DropdownMenuItem
                onClick={() =>
                  void window.cad.model
                    .saveMeshes(
                      projectId,
                      format,
                      every.map((part) => ({
                        name: `${part.id}.${format}`,
                        parts: [part.id],
                      })),
                      "zip",
                      savedAs(`${called}-parts.zip`)
                    )
                    .then(zipped(every.length))
                }
              >
                Zip with parts
                <Size kind={kind} />
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A name as a file of it is called: "Clock board" is clock-board. */
const fileNamed = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "board"

/**
 * In PCB mode, the board as files, to take elsewhere: what a board house makes it from,
 * its Gerbers, with the drill files, what goes on it and where each part goes, all in
 * one zip; or the board in 3D, as a STEP file, for CAD. A board only roughed out so far
 * can be had too, and says that it is not one to order yet.
 */
function BoardDownloads({
  board,
  projectId,
}: {
  board: BoardSummary
  projectId: string
}) {
  const [open, setOpen] = React.useState(false)
  const say = useStore((state) => state.say)
  const rebuildBoard = useStore((state) => state.rebuildBoard)
  const called = fileNamed(board.name)
  const save = (what: "gerbers" | "step", name: string) =>
    void window.cad.boards
      .save(projectId, board.id, what, savedAs(name))
      .then((saved) => {
        if (saved && what === "gerbers")
          say(`Saved the Gerbers of ${board.name}`)
      })
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverablePopup>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className={ROUND} />}
            />
          }
        >
          <DownloadIcon />
          <span className="sr-only">Download</span>
        </TooltipTrigger>
        {!open && <TooltipContent side="left">Download</TooltipContent>}
      </Tooltip>
      <DropdownMenuContent side="left" align="start" className="w-60">
        {board.gerbers || board.step ? (
          <DropdownMenuGroup>
            {board.gerbers && (
              <DropdownMenuItem
                onClick={() => save("gerbers", `${called}-gerbers.zip`)}
              >
                Manufacturing files
                <Size kind="GERBERS" />
              </DropdownMenuItem>
            )}
            {board.step && (
              <DropdownMenuItem onClick={() => save("step", `${called}.step`)}>
                3D board
                <Size kind="STEP" />
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-xs text-balance text-muted-foreground">
            There is nothing of this board to save until it is built.
          </p>
        )}
        {/* changed since it was built: the agent is asked to build it again, in the
            conversation, which comes up to show it */}
        {board.gerbers && board.outdated && (
          <div className="flex flex-col items-start gap-2 px-2 pt-1 pb-1.5">
            <p className="text-xs text-balance text-muted-foreground">
              These Gerbers are outdated.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setOpen(false)
                rebuildBoard(projectId, board.id)
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Refresh Gerbers
            </Button>
          </div>
        )}
        {!board.finished && board.gerbers && (
          <p className="px-2 pt-1 pb-1.5 text-xs text-balance text-muted-foreground">
            This board is unfinished: its Gerbers are for looking at, not for
            ordering yet.
          </p>
        )}
        {board.finished && board.gerbers && board.unsourced.length > 0 && (
          <p className="px-2 pt-1 pb-1.5 text-xs text-balance text-muted-foreground">
            JLCPCB can’t assemble {partsSaid(board.unsourced)} from these
            Gerbers: the BOM has no JLCPCB part number for{" "}
            {board.unsourced.length === 1 ? "it" : "them"}. Ask your agent to
            find {board.unsourced.length === 1 ? "one" : "them some"}.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * On the inspiration board, its pictures as files, to take elsewhere: all of them in one
 * zip, each by what it was called where it came from.
 */
function InspirationDownloads({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false)
  const say = useStore((state) => state.say)
  const count = useInspiration(
    (state) => state.boards[projectId]?.images.length ?? 0
  )
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverablePopup>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className={ROUND} />}
            />
          }
        >
          <DownloadIcon />
          <span className="sr-only">Download</span>
        </TooltipTrigger>
        {!open && <TooltipContent side="left">Download</TooltipContent>}
      </Tooltip>
      <DropdownMenuContent side="left" align="start" className="w-60">
        {count > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() =>
                void window.cad.inspiration
                  .saveArchive(projectId)
                  .then((saved) => {
                    if (saved)
                      say(
                        `Saved ${count === 1 ? "the image" : `${count} images`} as a zip`
                      )
                  })
              }
            >
              All images
              <Size kind="ZIP" />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-xs text-balance text-muted-foreground">
            There are no images on the board yet.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The parts on a board, by name, as a sentence has them: "U1, U2 and L1", "U1, U2 and 6 more". */
function partsSaid(parts: string[]): string {
  const shown = parts.length > 4 ? parts.slice(0, 3) : parts.slice(0, -1)
  const last =
    parts.length > 4 ? `${parts.length - 3} more` : parts[parts.length - 1]
  return shown.length ? `${shown.join(", ")} and ${last}` : last
}

/**
 * What kind of file a way of having the model is, and how big where that is known: at
 * the end of its row. (A mesh is made as it is saved, so how big is not known before.)
 */
function Size({ kind, bytes }: { kind: string; bytes?: number }) {
  return (
    <span className="ml-auto shrink-0 pl-4 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {kind} {bytes !== undefined && sizeOf(bytes)}
    </span>
  )
}

/** How long a button takes to go off the edge, or to come back, ms; and between one and the next. */
const SHIFT_MS = 160
const STAGGER_MS = 22

/** Whoever has asked for less to move has the buttons changed at once. */
const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * A button that goes off the edge of the view to the right, `away`, and comes back: after
 * `delay` ms, either way.
 */
function Geared({
  away,
  delay,
  children,
}: {
  away: boolean
  delay: number
  children: React.ReactNode
}) {
  const now = still()
  return (
    <div
      inert={away}
      className={cn(
        "transition-[translate,opacity] ease-out",
        away && "translate-x-[calc(100%+0.75rem)] opacity-0"
      )}
      style={{
        transitionDuration: now ? "0ms" : `${SHIFT_MS}ms`,
        transitionDelay: now ? "0ms" : `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The stack in the middle of the edge, of one set of buttons or another: the model's,
 * in PCB mode the board's, or the inspiration board's. Going from one to another is a
 * change of gear: the buttons there go off the edge to the right, one after another
 * from the top, and once they are gone the others come in, the same way. All of them
 * are there all the while, but one out of sight and not to be pressed.
 */
function Gears({
  shown,
  ...given
}: {
  shown: Gear
} & Record<Gear, React.ReactElement<{ children?: React.ReactNode }>>) {
  const names = Object.keys(given) as Gear[]
  const sets = Object.fromEntries(
    names.map((name) => [
      name,
      React.Children.toArray(given[name].props.children),
    ])
  ) as Record<Gear, React.ReactNode[]>
  // the set that was shown before this one: these come in once the last of its buttons
  // is on its way out
  const [was, setWas] = React.useState({ shown, before: shown })
  if (was.shown !== shown) setWas({ shown, before: was.shown })
  const leaving = sets[was.before]?.length ?? 0
  const coming = leaving * STAGGER_MS + SHIFT_MS * 0.5
  const stack = (buttons: React.ReactNode[], away: boolean) => (
    // (the set that is away is still where it stands, over the other: nothing in it is
    // to be found by the pointer, or the buttons under it could not be pressed)
    <Stack
      inert={away}
      style={away ? { pointerEvents: "none" } : undefined}
      className="absolute top-1/2 right-3 -translate-y-1/2"
    >
      {buttons.map((button, index) => (
        <Geared
          key={React.isValidElement(button) ? button.key : index}
          away={away}
          delay={(away ? 0 : coming) + index * STAGGER_MS}
        >
          {button}
        </Geared>
      ))}
    </Stack>
  )
  return (
    <>
      {names.map((name) => (
        <React.Fragment key={name}>
          {stack(sets[name], name !== shown)}
        </React.Fragment>
      ))}
    </>
  )
}

/**
 * Whose buttons the stack in the middle of the edge has: the model's, a board's in PCB
 * mode, or the inspiration board's.
 */
type Gear = "model" | "board" | "inspiration"

/** The ways a circuit board is looked at in PCB mode, as the buttons for them have it. */
const BOARD_WAYS: Record<BoardAs, { label: string; icon: React.ReactNode }> = {
  pcb: { label: "Technical view", icon: <LayersIcon /> },
  "3d": { label: "3D view", icon: <Rotate3dIcon /> },
  schematic: { label: "Schematic", icon: <WorkflowIcon /> },
}

/**
 * The buttons down the right-hand edge. At the top, what leaves the view: the
 * conversation, and the model as a file. In the middle, how the model is looked at.
 *
 * While it is the model's blueprint that is looked at, the ones that are only for the
 * view of the model itself, the cut, the ground and what the model is set in, are there
 * and not to be pressed. While it is its assembly guides, none of them is but the
 * blueprint's and the guides' own: a guide is of the model as it is built, whatever of
 * it is on show.
 *
 * In PCB mode, with one of the project's circuit boards where the model was, the ones
 * in the middle are the board's instead: the ways it is looked at, one of them lit. And
 * on the inspiration board they are its own: whether the notes on its pictures are
 * shown, looking through it, and what leaves it. At the top, what is saved is the board
 * or the pictures, in place of the model.
 *
 * And while the view has the window to itself (Cmd+.) they are all put away: there
 * still, for whatever they bring up to know its button by, and not to be seen or
 * pressed. Their keys do what they did.
 */
export function Tools({
  loaded,
  through,
  projectId,
  locked = false,
  hasTools = false,
  board = null,
  boards = null,
}: {
  loaded: LoadedModel | null
  /**
   * What a cut chosen afresh goes through the middle of: what is on show of the model,
   * where it stands. Null with no model.
   */
  through: Box3 | null
  projectId: string
  /** the view is not the hand's to change for now: how it is looked at is put away */
  locked?: boolean
  /** the project has tools of its own, made for its model */
  hasTools?: boolean
  /** the circuit board PCB mode has, while it is in PCB mode */
  board?: BoardSummary | null
  /** the project's boards, while an agent is at work in it: for the PCB button to say
   * when it is at one */
  boards?: readonly BoardSummary[] | null
}) {
  const view = useStore((state) => state.view)
  const { blueprint, assembly } = view
  /** it is not the model itself that is looked at: what is only for that waits */
  const away = blueprint || assembly
  // a blueprint is of the model whole: the cut is the view's, and comes back with it
  const section = away ? null : view.section
  const setView = useStore((state) => state.setView)
  const threadOpen = useStore((state) => state.threadOpen)
  const setThreadOpen = useStore((state) => state.setThreadOpen)
  const partsOpen = useStore((state) => state.partsOpen)
  const setPartsOpen = useStore((state) => state.setPartsOpen)
  const referenceOpen = useStore((state) => state.referenceOpen)
  const setReferenceOpen = useStore((state) => state.setReferenceOpen)
  const toolsOpen = useStore((state) => state.toolsOpen)
  const setToolsOpen = useStore((state) => state.setToolsOpen)
  const boardsOpen = useStore((state) => state.boardsOpen)
  const setBoardsOpen = useStore((state) => state.setBoardsOpen)
  const boardPartsOpen = useStore((state) => state.boardPartsOpen)
  const setBoardPartsOpen = useStore((state) => state.setBoardPartsOpen)
  const finding = useStore((state) => state.finding !== null)
  const find = useStore((state) => state.find)
  const notesShown = useInspiration((state) => state.notesShown)
  const setNotesShown = useInspiration((state) => state.setNotesShown)
  const expanded = useInspiration((state) => state.expanded)
  // (put away only at the last of Cmd+.'s steps: the first is of the cards alone)
  const bare = useStore((state) => state.cleared === "all")
  // While one sheet of the blueprint has the view to itself there is none of them:
  // only, at the top, what puts the sheet back among the others.
  if (view.sheet !== null)
    return (
      <div className={EDGE} inert={bare} data-away={bare || undefined}>
        <Stack className="absolute top-3 right-3">
          <Press
            label="Back to the sheets"
            shortcut="Esc"
            onClick={() => setView({ sheet: null })}
          >
            <XIcon />
          </Press>
        </Stack>
      </div>
    )

  const conversation = (
    <Switch
      label="Conversation"
      shortcut={MAC ? "⌘B" : "Ctrl B"}
      on={threadOpen}
      onChange={setThreadOpen}
    >
      <MessageSquareIcon />
    </Switch>
  )

  const onBoard = view.board !== null
  const inspiring = view.inspiration
  const inspirationButtons = (
    <>
      <Switch
        label="Notes"
        shortcut="N"
        on={notesShown}
        onChange={setNotesShown}
      >
        <LetterTextIcon />
      </Switch>
      <Press
        label="Organize"
        shortcut="O"
        onClick={() => useInspiration.getState().organizing?.()}
      >
        <LayoutDashboardIcon />
      </Press>
      <Switch
        label="Expand all"
        shortcut="E"
        on={expanded}
        onChange={(on) => useInspiration.getState().expanding?.(on)}
      >
        <ExpandIcon />
      </Switch>
      <Switch
        label="Search"
        shortcut={MAC ? "⌘F" : "Ctrl F"}
        on={finding}
        onChange={(on) => find(on ? "" : null)}
      >
        <SearchIcon />
      </Switch>
      <Press
        label="Exit Inspiration Board"
        shortcut="Esc"
        onClick={() => setView({ inspiration: false })}
        className="bg-destructive text-white ring-destructive hover:bg-destructive/85 hover:text-white"
      >
        <XIcon />
      </Press>
    </>
  )
  const boardButtons = (
    <>
      {BOARD_AS.map((as, index) => (
        <div key={as} className="relative">
          {as === "pcb" && view.boardAs === "pcb" && (
            <div className="absolute top-0 right-full mr-1.5 flex">
              <Switch
                label="Bottom side"
                shortcut="S"
                side="top"
                on={view.boardSide === "bottom"}
                onChange={(bottom) =>
                  setView({ boardSide: bottom ? "bottom" : "top" })
                }
              >
                <FlipHorizontal2Icon />
              </Switch>
            </div>
          )}
          <Switch
            label={BOARD_WAYS[as].label}
            shortcut={String(index + 1)}
            on={view.boardAs === as}
            onChange={() => setView({ boardAs: as })}
          >
            {BOARD_WAYS[as].icon}
          </Switch>
        </div>
      ))}
      <Switch
        label="Parts"
        shortcut="P"
        opens="board-parts"
        on={boardPartsOpen}
        onChange={() => setBoardPartsOpen(!boardPartsOpen)}
      >
        <BoxesIcon />
      </Switch>
      <Press
        key="exit"
        label="Exit PCB mode"
        shortcut="Esc"
        onClick={() => setView({ board: null })}
        className="bg-destructive text-white ring-destructive hover:bg-destructive/85 hover:text-white"
      >
        <XIcon />
      </Press>
    </>
  )

  return (
    <div className={EDGE} inert={bare} data-away={bare || undefined}>
      <Stack className="absolute top-3 right-3">
        {conversation}
        {/* the model as files, or in PCB mode the board: the one changes over to the
            other as the buttons in the middle do */}
        {loaded && (
          <div className="relative">
            <Geared away={onBoard || inspiring} delay={0}>
              <Downloads loaded={loaded} projectId={projectId} />
            </Geared>
            {board && (
              <div className="absolute inset-0">
                <Geared away={!onBoard} delay={SHIFT_MS}>
                  <BoardDownloads board={board} projectId={projectId} />
                </Geared>
              </div>
            )}
            <div className="absolute inset-0">
              <Geared away={!inspiring} delay={SHIFT_MS}>
                <InspirationDownloads projectId={projectId} />
              </Geared>
            </div>
          </div>
        )}
      </Stack>

      {loaded && !locked && (
        <Gears
          shown={onBoard ? "board" : inspiring ? "inspiration" : "model"}
          board={boardButtons}
          inspiration={inspirationButtons}
          model={
            <>
              {/* lit while the list is up, and while not all of the model is showing:
          something picked in the list is all that is, or parts are out of sight.
          Pressing it brings the list back, to pick again or to bring them back */}
              <Switch
                label="Parts"
                shortcut="P"
                opens="parts"
                on={partsOpen || view.only !== null || view.hidden.length > 0}
                disabled={assembly}
                onChange={() => setPartsOpen(!partsOpen)}
              >
                <BoxesIcon />
              </Switch>
              <Switch
                label="Grid"
                shortcut={MAC ? "⇧G" : "Shift G"}
                on={view.grid}
                disabled={away}
                onChange={(grid) => setView({ grid })}
              >
                <Grid3x3Icon />
              </Switch>
              <div className="relative">
                {section && (
                  <div className="absolute top-0 right-full mr-1.5 flex gap-1.5">
                    <Press
                      label="Reset cut"
                      side="top"
                      onClick={() =>
                        setView({
                          section: sectionFacing(through ?? loaded.box),
                        })
                      }
                    >
                      <RotateCcwIcon />
                    </Press>
                    <Press
                      label="Invert side"
                      side="top"
                      onClick={() =>
                        setView({
                          section: { ...section, flipped: !section.flipped },
                        })
                      }
                    >
                      <FlipHorizontal2Icon />
                    </Press>
                  </div>
                )}
                <Switch
                  label="Section"
                  shortcut="S"
                  // its neighbours have the left: its name is on the far side of them
                  away={section ? BESIDE : undefined}
                  on={section !== null}
                  disabled={away}
                  // cut open again, it is as it was left
                  onChange={(on) =>
                    on
                      ? cutOpenThrough(through ?? loaded.box)
                      : setView({ section: null })
                  }
                >
                  <SectionIcon />
                </Switch>
              </div>
              <Switch
                label="Explode"
                shortcut="E"
                on={view.exploded}
                disabled={assembly}
                // (pulled apart afresh, it is into its pieces, by the model's own distances)
                onChange={(exploded) =>
                  setView({
                    exploded,
                    spread: SPREAD.min,
                    ...(exploded && { alone: false }),
                  })
                }
              >
                <UnfoldVerticalIcon />
              </Switch>
              {!loaded.standIn && (
                <Switch
                  label="Reference"
                  shortcut={MAC ? "⌘/" : "Ctrl /"}
                  opens="reference"
                  on={referenceOpen || (view.reference !== null && !away)}
                  disabled={away}
                  onChange={() => setReferenceOpen(!referenceOpen)}
                >
                  <ReferenceIcon />
                </Switch>
              )}
              <div className="relative">
                <Switch
                  label="PCB"
                  shortcut={MAC ? "⇧P" : "Shift P"}
                  opens="boards"
                  on={boardsOpen}
                  onChange={() => setBoardsOpen(!boardsOpen)}
                >
                  <BoardIcon />
                </Switch>
                {boards && (
                  <BoardAtWorkRing projectId={projectId} boards={boards} />
                )}
              </div>
              {!loaded.standIn && (
                <Switch
                  label="Blueprint"
                  shortcut="B"
                  on={blueprint}
                  onChange={(blueprint) => setView({ blueprint })}
                >
                  <DraftingCompassIcon />
                </Switch>
              )}
              {!loaded.standIn && (
                <Switch
                  label="Assembly"
                  shortcut="A"
                  on={assembly}
                  onChange={(assembly) => setView({ assembly })}
                >
                  <BookOpenIcon />
                </Switch>
              )}
              {/* It is there before there is any model, when they are most wanted */}
              <Switch
                label="Inspiration Board"
                shortcut={MAC ? "⇧I" : "Shift I"}
                on={view.inspiration}
                onChange={(inspiration) => setView({ inspiration })}
              >
                <ImagesIcon />
              </Switch>
              {!loaded.standIn && (
                <Switch
                  label="Search"
                  shortcut={MAC ? "⌘F" : "Ctrl F"}
                  on={finding}
                  disabled={assembly}
                  onChange={(on) => find(on ? "" : null)}
                >
                  <SearchIcon />
                </Switch>
              )}
              {/* The project's own tools, made for its model and not the app's: so it is
          the one button here that is painted, blue, off as on, and is there only
          where the project has some. On, it has a white line round it, which is
          while the tools are up: put away, they may be at work on the model
          still, and the button says nothing of that. */}
              {!loaded.standIn && hasTools && (
                <Switch
                  label="Tools"
                  shortcut="T"
                  opens="tools"
                  on={toolsOpen && !away}
                  disabled={away}
                  onChange={() => setToolsOpen(!toolsOpen)}
                  className="bg-tool text-white ring-tool hover:bg-tool/85 hover:text-white aria-pressed:bg-tool aria-pressed:text-white aria-pressed:ring-2 aria-pressed:ring-white aria-pressed:hover:bg-tool/85 aria-pressed:hover:text-white"
                >
                  <HammerIcon />
                </Switch>
              )}
            </>
          }
        />
      )}
    </div>
  )
}
