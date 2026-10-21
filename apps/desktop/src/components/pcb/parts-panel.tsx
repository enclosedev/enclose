import * as React from "react"
import { cn } from "cn"

import type { BoardSummary } from "@shared/api"
import { useStore } from "@/lib/store"
import type { Circuit } from "./boards"
import { usePartPictures } from "./part-pictures"
import { countSaid, partsOf } from "./parts"

const FOCUS = "focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * What is on the board in PCB mode, as the list of boards has the boards: a small square
 * for each kind of part, with the part in 3D in the middle of it and, under that, what
 * it is and how many of it there are, with their names on the board. Picking one brings
 * the camera to them, in 3D. Put away by its button, P or Esc.
 */
export function BoardPartsPanel({
  projectId,
  board,
  circuit,
  className,
}: {
  projectId: string
  board: BoardSummary
  circuit: Circuit | null
  className?: string
}) {
  const parts = React.useMemo(
    () => (circuit ? partsOf(circuit) : []),
    [circuit]
  )
  const pictures = usePartPictures(projectId, board, parts)
  const focus = useStore((state) => state.focusBoardParts)
  const hover = useStore((state) => state.hoverBoardParts)
  // (and none, once the list is put away with the pointer still over one)
  React.useEffect(() => () => hover(null), [hover])
  return (
    <div
      role="group"
      aria-label="Parts on the board"
      data-board-parts=""
      // a press here picks, and takes the keys from nowhere: they go on being the view's
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        // as the list of boards is, which has the same place
        "pointer-events-auto flex w-72.5 flex-col overflow-hidden rounded-2xl bg-background shadow-lg ring-1 ring-foreground/10 select-none dark:bg-[color-mix(in_srgb,var(--sidebar),var(--foreground)_2.6%)]",
        className
      )}
    >
      <h2 className="px-5 pt-4.25 pb-3.75 text-[17px]/6 font-medium">Parts</h2>
      {parts.length === 0 && (
        <p className="px-5 pb-5 text-sm text-balance text-muted-foreground">
          {circuit
            ? "There is nothing on this board yet."
            : "The parts show here once the board is built."}
        </p>
      )}
      {/* (the squares in a grid of their own, which the list scrolls: a grid that is
          itself kept short squeezes them) */}
      <div className="min-h-0 scroll-fade [scrollbar-width:none] overflow-y-auto px-5 pb-5 empty:hidden">
        <div className="grid grid-cols-2 gap-3 empty:hidden">
          {parts.map((part) => {
            const url = pictures[part.key]
            return (
              <button
                key={part.key}
                type="button"
                title={part.names.join(", ")}
                onClick={() => focus(part.names)}
                onPointerEnter={() => hover(part.names)}
                onPointerLeave={() => hover(null)}
                className={cn(
                  // the square a board is pictured on in its list, smaller
                  "relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border bg-foreground/9 outline-none hover:border-foreground/40",
                  FOCUS
                )}
              >
                {url && (
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="absolute top-1 left-1/2 size-[72%] -translate-x-1/2"
                  />
                )}
                <span className="absolute inset-x-2 bottom-1.75 flex flex-col items-center text-center text-[11px] leading-4">
                  <span className="max-w-full truncate font-medium">
                    {part.title}
                  </span>
                  <span className="max-w-full truncate text-foreground/45">
                    {countSaid(part)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
