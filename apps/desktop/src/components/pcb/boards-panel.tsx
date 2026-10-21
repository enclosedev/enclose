import * as React from "react"
import { cn } from "cn"

import type { BoardSummary } from "@shared/api"
import { useStore } from "@/lib/store"
import { UnfinishedBadge, WorkingBadge } from "./board-steps"
import { sizeSaid, useBeingMade } from "./boards"
import { useBoardPictures } from "./pictures"
import { TurningBoard } from "./turning-board"

const FOCUS = "focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * The circuit boards the project has, as the list of reference scenes has those: a card
 * for each, with a picture of the board in 3D, what it is called and, under that, how
 * big it is. A board only roughed out so far says so, at the top of its card.
 *
 * Picking one takes the view into PCB mode, with that board in it in place of the model.
 * Esc or a press anywhere else puts the list away, and leaves the view as it is. Where
 * the project has no board yet, the list says how one comes: it is asked for.
 */
export function BoardsPanel({
  projectId,
  boards,
  className,
}: {
  projectId: string
  boards: BoardSummary[]
  className?: string
}) {
  const setBoardsOpen = useStore((state) => state.setBoardsOpen)
  const pictures = useBoardPictures(projectId, boards)
  const panel = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const away = (event: PointerEvent) => {
      const on = event.target as Element | null
      if (!on || panel.current?.contains(on)) return
      // the button that brought the list up also puts it away: that press is its own
      if (on.closest("[data-opens=boards]")) return
      setBoardsOpen(false)
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [setBoardsOpen])

  return (
    <div
      ref={panel}
      role="group"
      aria-label="Circuit boards"
      // a press here picks, and takes the keys from nowhere: they go on being the view's
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        // as the list of reference scenes is, which has the same place
        "pointer-events-auto flex w-72.5 flex-col overflow-hidden rounded-2xl bg-background shadow-lg ring-1 ring-foreground/10 select-none dark:bg-[color-mix(in_srgb,var(--sidebar),var(--foreground)_2.6%)]",
        className
      )}
    >
      <h2 className="px-5 pt-4.25 pb-3.75 text-[17px]/6 font-medium">
        Circuit boards
      </h2>
      {boards.length === 0 && (
        <p className="px-5 pb-5 text-sm text-balance text-muted-foreground">
          Ask your agent to create a PCB
        </p>
      )}
      <div className="flex min-h-0 scroll-fade [scrollbar-width:none] flex-col gap-5 overflow-y-auto px-5 pb-5 empty:hidden">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            projectId={projectId}
            board={board}
            picture={pictures[board.id]}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * A board in the list: its picture, what it is called and, under that, how big it is or
 * how its build is going. While it is being made, a light goes across it, over and over;
 * and where there is no picture of it yet, a board turns round in the room for one.
 */
function BoardCard({
  projectId,
  board,
  picture,
}: {
  projectId: string
  board: BoardSummary
  picture: string | undefined
}) {
  const setView = useStore((state) => state.setView)
  const making = useBeingMade(projectId, board)
  return (
    <button
      type="button"
      data-board={board.id}
      onClick={() => setView({ board: board.id })}
      className={cn(
        // the square a reference scene is pictured on, lines and all
        "relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-foreground/9 text-left outline-none hover:border-foreground/40",
        making && "being-made",
        FOCUS
      )}
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          draggable={false}
          className="absolute top-2 left-1/2 size-50 -translate-x-1/2"
        />
      ) : (
        making && (
          <TurningBoard className="absolute top-14 left-1/2 w-24 -translate-x-1/2" />
        )
      )}
      {making ? (
        <WorkingBadge className="absolute top-2.5 left-2.5" />
      ) : (
        !board.finished && (
          <UnfinishedBadge className="absolute top-2.5 left-2.5" />
        )
      )}
      <span className="absolute inset-x-3 bottom-2.25 flex flex-col text-[11px] leading-4">
        <span className="truncate font-medium">{board.name}</span>
        <span className="truncate text-foreground/45">
          {board.building
            ? board.building.stage === "routing" &&
              board.building.progress !== null
              ? `Routing · ${Math.round(board.building.progress * 100)}%`
              : "Building"
            : making
              ? "Being made"
              : board.built === null
                ? "Not built yet"
                : (sizeSaid(board) ?? " ")}
        </span>
      </span>
    </button>
  )
}
