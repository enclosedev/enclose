// What is shown with a part of a circuit board that is clicked in 3D, as a part of the
// model has its own (viewport/part-marks.tsx): its name on the board and what it is, to
// one side of the place clicked, and to the other what can be done with it, which is to
// say something of it for the next message. Drawn over the view, it keeps to the part as
// the view is turned.
import * as React from "react"
import * as THREE from "three"
import { Html } from "@react-three/drei"
import { MessageSquareIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Writing } from "@/components/writing"
import { useStore } from "@/lib/store"
import type { Circuit } from "./boards"
import { partsOf } from "./parts"

/** Over the view, under whatever of the window floats over it. */
const OVER: [number, number] = [30, 0]
/** How far above the place the box that is written in starts, px. */
const WRITING_ABOVE = 24
/** A round button over the view, as the model's part has. */
const ROUND =
  "glass size-9 rounded-full bg-background/60 px-0 shadow-sm ring-1 ring-foreground/10"

// a press on any of this is not one on the view under it
const held = (event: React.PointerEvent) => event.stopPropagation()

/** A place in the board's own frame, as the view has it (see `partsBox`). */
export const inView = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y)
/** And a place in the view, in the board's own frame. */
export const onBoard = (at: THREE.Vector3): [number, number, number] => [
  at.x,
  -at.z,
  at.y,
]

/**
 * The part of the board picked out, with its name and what it is beside the place it
 * was clicked at; and, where something is being said of it, the box that is written in.
 */
export function BoardPartMark({ circuit }: { circuit: Circuit | null }) {
  const picked = useStore((state) => state.boardPicked)
  const writing = useStore((state) => state.boardWriting)
  const writeBoard = useStore((state) => state.writeBoard)
  const note = useStore((state) =>
    writing && writing !== "new" && state.activeId
      ? (state.notes[state.activeId]?.find((one) => one.id === writing) ?? null)
      : null
  )
  const title = React.useMemo(() => {
    if (!picked || !circuit) return null
    return (
      partsOf(circuit).find((part) => part.names.includes(picked.name))
        ?.title ?? null
    )
  }, [picked, circuit])
  const at = React.useMemo(() => (picked ? inView(picked.at) : null), [picked])
  if (!picked || !at) return null
  const label = title ? `${picked.name} · ${title}` : picked.name
  return (
    <Html position={at} zIndexRange={OVER}>
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
            bare={note !== null}
            onKeep={(text, now) => {
              const { keepBoardNote, send, setThreadOpen } = useStore.getState()
              if (!keepBoardNote(text, label)) return
              setThreadOpen(true)
              if (now) send()
            }}
            onCancel={() => writeBoard(null)}
          />
        </div>
      ) : (
        <div onPointerDown={held} className="relative flex -translate-1/2">
          <span className="pointer-events-none absolute top-1/2 right-full mr-1.5 flex h-9 max-w-56 -translate-y-1/2 items-center rounded-full bg-foreground px-3.5 text-xs font-medium whitespace-nowrap text-background shadow-sm ring-1 ring-background/25">
            <span className="truncate">{label}</span>
          </span>
          <Tooltip disableHoverablePopup>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={ROUND}
                  onClick={() => writeBoard("new")}
                />
              }
            >
              <MessageSquareIcon />
              <span className="sr-only">Edit part</span>
            </TooltipTrigger>
            <TooltipContent>Edit part</TooltipContent>
          </Tooltip>
        </div>
      )}
    </Html>
  )
}
