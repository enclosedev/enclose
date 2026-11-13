// What is shown with a part that is picked out, and on a part something has been said
// of. All of it is drawn over the view and keeps to the part as the view is turned: the
// part's name to one side of it, what can be done with it to the other, and a mark on
// every part that has something waiting to be sent about it.
import * as React from "react"
import * as THREE from "three"
import { Html } from "@react-three/drei"
import { cn } from "cn"
import { DownloadIcon, MessageSquareIcon } from "lucide-react"

import type { Vec3 } from "@shared/api"
import { materialOf } from "@shared/materials"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Writing } from "@/components/writing"
import type { Model } from "@/lib/model"
import { usePreferences } from "@/lib/preferences"
import { savingParts } from "@/lib/saved"
import { goesBy, useStore, type Note, type Selection } from "@/lib/store"
import type { LoadedPart } from "./load"
import { LookPanel, MaterialBall } from "./look-panel"
import { ownMaterial } from "./materials"
import { skinColour } from "./paint"

/** Over the view, under whatever of the window floats over it. */
const OVER: [number, number] = [30, 0]
/** How near the edges of the view these may be drawn: the window has things there. */
const ROOM = { left: 290, right: 76, top: 60, bottom: 90 }
/** How far what is shown at a place on a part reaches from it, each way, about. */
const BUTTONS = { left: 250, right: 70, up: 24, down: 24 }
const WRITING = { left: 150, right: 150, up: 60, down: 130 }
/** How far above the place the box that is written in starts, px. */
const WRITING_ABOVE = 24
/** What every button floating over the view is: a frosted circle of its own. */
const ROUND =
  "glass size-9 rounded-full bg-background/60 px-0 shadow-sm ring-1 ring-foreground/10"

// A press on any of these is not a press on the view under it: the view is not turned
// by it. (Each is drawn by a root of its own inside the view, so this is where a press
// stops before the view hears of it.)
const held = (event: React.PointerEvent) => event.stopPropagation()

const between = (value: number, least: number, most: number) =>
  Math.min(Math.max(value, least), Math.max(least, most))

type Size = { width: number; height: number }

/** A round button over the view, named by what it does. */
function Does({
  label,
  children,
  ...props
}: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" className={ROUND} {...props} />
        }
      >
        {children}
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** How long a part stays in the colour it was just given before the selection's is back, ms. */
const SEEN_FOR_MS = 1400

/** A place on a part, kept where the part really sits, in the part's own frame. */
const placeOn = (loaded: LoadedPart, point: Vec3 | null) =>
  point
    ? new THREE.Vector3(...point).applyMatrix4(loaded.home.clone().invert())
    : loaded.box.getCenter(new THREE.Vector3())

/**
 * With the part that is picked out, at the very place on it that was clicked: what can
 * be done with it, and its name beside that - or, once something is being said of it,
 * where that is written. They are fixed to that place on the part, and go where it goes
 * as the view is turned; only the edges of the view hold them back, so that they can
 * always be reached.
 *
 * Where it is the piece the part is of that is picked out, they are the piece's: its
 * name, a colour for all of it, and what is said is said of it. There is no file of a
 * piece to hand out.
 */
export function PartMarks({
  loaded,
  model,
  projectId,
  onPick,
}: {
  loaded: LoadedPart
  model: Model
  projectId: string
  /** a click that fell on these was one on the part under them (see the view's own) */
  onPick: (selection: Selection | null, add: boolean, alone: boolean) => void
}) {
  const { part } = loaded
  const writing = useStore((state) => state.writing)
  const write = useStore((state) => state.write)
  const point = useStore((state) => state.selection?.part.point ?? null)
  const piece = useStore((state) => state.selection?.part.piece)
  const label = piece?.label ?? part.label
  const partIds = React.useMemo(() => piece?.parts ?? [part.id], [piece, part])
  const note = useStore((state) =>
    writing && writing !== "new"
      ? (state.notes[projectId]?.find((one) => one.id === writing) ?? null)
      : null
  )
  const format = usePreferences((state) => state.format)
  const download = piece
    ? null
    : savingParts(projectId, model.downloads, format, [part], part.label, {
        model,
        parts: [loaded],
      })
  const written = writing !== null
  const at = React.useMemo(() => placeOn(loaded, point), [loaded, point])
  // a colour or a material is being chosen, here: clicking anywhere else on the part is
  // done with that
  const [choosingAt, setChoosingAt] = React.useState<THREE.Vector3 | null>(null)
  const choosing = !written && choosingAt === at
  // what it is made of, as its ball shows it: as given, or as its model has it
  const given = useStore((state) =>
    state.activeId
      ? (state.materials[state.activeId]?.[partIds[0]] ?? null)
      : null
  )
  const made = materialOf(given?.material) ?? ownMaterial(part)
  // and its own colour, whatever it is made of: the one given it, or its model's. That is
  // what a material that takes a colour is in, where `shown` is a wood's own brown.
  const colourGiven = useStore((state) =>
    state.activeId
      ? (state.colours[state.activeId]?.[partIds[0]] ?? null)
      : null
  )
  const own = React.useMemo(
    () =>
      `#${skinColour(
        loaded,
        loaded.skins[0],
        document.documentElement.classList.contains("dark"),
        colourGiven
      ).getHexString()}`,
    [loaded, colourGiven]
  )
  // While a colour is chosen for the part it is seen in its own, not the selection's;
  // and for a moment after one has been given, so that it is seen to have taken.
  const showPlain = useStore((state) => state.showPlain)
  const gave = React.useRef(false)
  // the panel itself takes the focus as it opens, not its first tab, which would show lit
  const panel = React.useRef<HTMLDivElement>(null)
  const chosen = React.useCallback((given: boolean) => {
    gave.current = given
    setChoosingAt(null)
  }, [])
  React.useEffect(() => {
    if (choosing) {
      gave.current = false
      showPlain(true)
      return
    }
    if (!gave.current) {
      showPlain(false)
      return
    }
    const timer = setTimeout(() => showPlain(false), SEEN_FOR_MS)
    return () => clearTimeout(timer)
  }, [choosing, showPlain])
  React.useEffect(() => () => showPlain(false), [showPlain])
  // Esc puts the colours and materials away, and is not taken for leaving anything else
  // by whoever else listens for it: the part stays picked out
  React.useEffect(() => {
    if (!choosing) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // a field in the panel that is put away with Esc, while it is out
      if ((event.target as Element | null)?.closest?.("[data-keeps-escape]"))
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      chosen(gave.current)
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [choosing, chosen])

  const kept = React.useMemo(() => {
    const seen = new THREE.Vector3()
    const fits = written ? WRITING : BUTTONS
    return (el: THREE.Object3D, camera: THREE.Camera, size: Size) => {
      seen.setFromMatrixPosition(el.matrixWorld).project(camera)
      return [
        between(
          ((seen.x + 1) / 2) * size.width,
          ROOM.left + fits.left,
          size.width - ROOM.right - fits.right
        ),
        between(
          ((1 - seen.y) / 2) * size.height,
          ROOM.top + fits.up,
          size.height - ROOM.bottom - fits.down
        ),
      ]
    }
  }, [written])

  return (
    <Html position={at} calculatePosition={kept} zIndexRange={OVER}>
      {writing !== null ? (
        <div
          onPointerDown={held}
          className="-translate-x-1/2"
          style={{ marginTop: -WRITING_ABOVE }}
        >
          <Writing
            key={writing}
            label={<span className="truncate">{label}</span>}
            from={note?.text}
            placeholder="What should change here?"
            // (one already made, left with nothing in it, is taken back)
            bare={note !== null}
            onKeep={(text, now) => {
              const { keepNote, send, setThreadOpen } = useStore.getState()
              if (!keepNote(text)) return
              // where it has gone is on show
              setThreadOpen(true)
              if (now) send()
            }}
            onCancel={() => write(null)}
          />
        </div>
      ) : (
        <div
          onPointerDown={held}
          // The second click of two on a part falls here, on what the first put under
          // the pointer. It is not a press of any of these: it is for the part by
          // itself, where the first picked out the piece it is of; or, with Shift
          // held, for all of the piece, where the first picked out the part.
          onClickCapture={(event) => {
            if (event.detail < 2) return
            event.stopPropagation()
            const { selection } = useStore.getState()
            if (!selection || (!event.shiftKey && !selection.part.piece)) return
            onPick(
              { ...selection, part: { ...selection.part, piece: undefined } },
              event.shiftKey,
              !event.shiftKey
            )
          }}
          className="relative flex -translate-1/2 gap-1.5"
        >
          <span className="pointer-events-none absolute top-1/2 right-full mr-1.5 flex h-9 max-w-44 -translate-y-1/2 items-center rounded-full bg-foreground px-3.5 text-xs font-medium text-background shadow-sm ring-1 ring-background/25">
            <span className="truncate">{label}</span>
          </span>
          <Popover
            open={choosing}
            onOpenChange={(open) => {
              if (open) setChoosingAt(at)
              else chosen(gave.current)
            }}
          >
            <Tooltip disableHoverablePopup>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(ROUND, "overflow-hidden")}
                      />
                    }
                  />
                }
              >
                <MaterialBall
                  material={made}
                  chosen={given}
                  colour={own}
                  className="size-6"
                />
                <span className="sr-only">Color and material</span>
              </TooltipTrigger>
              <TooltipContent>Color and material</TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              collisionPadding={12}
              // (a press here is not one on the view under it)
              onPointerDown={held}
              ref={panel}
              initialFocus={panel}
              className="w-72 gap-0 overflow-hidden p-0"
            >
              <LookPanel
                partIds={partIds}
                shown={own}
                onGave={() => {
                  gave.current = true
                }}
              />
            </PopoverContent>
          </Popover>
          {download && (
            <Does label="Download part" onClick={() => void download.save()}>
              <DownloadIcon />
            </Does>
          )}
          <Does
            label={piece ? "Edit object" : "Edit part"}
            onClick={() => write("new")}
          >
            <MessageSquareIcon />
          </Does>
        </div>
      )}
    </Html>
  )
}

/**
 * On a part that something has been said of and not yet sent: a mark at the place it was
 * said of, which goes where the part goes. Pressed, it opens what was said again.
 */
export function NoteMark({ loaded, note }: { loaded: LoadedPart; note: Note }) {
  const at = React.useMemo(
    () => placeOn(loaded, note.part.point),
    [loaded, note.part.point]
  )
  return (
    <Html position={at} center zIndexRange={OVER}>
      <button
        type="button"
        title={note.text}
        onPointerDown={held}
        onClick={() => useStore.getState().write(note.id)}
        className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-md ring-1 ring-black/15 outline-none"
      >
        <MessageSquareIcon className="size-3.5 fill-current" />
        <span className="sr-only">What was said of {goesBy(note.part)}</span>
      </button>
    </Html>
  )
}
