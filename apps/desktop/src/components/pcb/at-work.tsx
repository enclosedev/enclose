// What says that an agent is at one of the project's boards while the view is not in
// PCB mode: a length of ring going round the PCB button, and a pill at the foot of the
// view. The view stays where it is: the board is checked on the way to the model, and
// it is the model that was asked about. (See boardAtWork.) A board made in detail in
// the background has the ring too, but no pill: its card in the conversation is that.
import { BoardIcon } from "@/components/icons"
import { Floating } from "@/components/floating"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"
import { useNow } from "@/lib/time"
import type { BoardSummary, ConversationSummary } from "@shared/api"
import { boardAtWork } from "./boards"

/** Stable while there are none. */
const NONE: ConversationSummary[] = []

/** How far across the ring round the PCB button is, px: the button, and its own ring. */
const RING_SIZE = 38
/** How thick its line is, px: a little more than the ring it goes round. */
const RING_WEIGHT = 1.5
/** How much of the way round the length that goes round it is. */
const RING_ARC = 0.15

/** The board an agent is at just now, of a project's, looked at again every second. */
function useBoardAtWork(
  projectId: string,
  boards: readonly BoardSummary[]
): BoardSummary | null {
  const conversations = useStore(
    (state) =>
      state.projects.find((project) => project.id === projectId)
        ?.conversations ?? NONE
  )
  const now = useNow(1000)
  return boardAtWork(boards, conversations, now)
}

/** Whether an agent is making one of a project's boards in detail in the background. */
function useMadeInDetail(projectId: string): boolean {
  return useStore(
    (state) =>
      state.projects
        .find((project) => project.id === projectId)
        ?.conversations.some((conversation) => conversation.job !== null) ??
      false
  )
}

/**
 * Round the PCB button, while an agent is at one of the boards, or making one in detail:
 * a short length of ring going round it, over and over, as round what is waited for in
 * the middle of the view. It goes with the buttons where they are put away.
 */
export function BoardAtWorkRing({
  projectId,
  boards,
}: {
  projectId: string
  boards: readonly BoardSummary[]
}) {
  const atWork = useBoardAtWork(projectId, boards) !== null
  const inDetail = useMadeInDetail(projectId)
  if (!atWork && !inDetail) return null
  return (
    <svg
      className="pointer-events-none absolute -inset-px animate-[passing_0.9s_linear_infinite] fill-none transition-opacity duration-200 group-data-[away]/tools:opacity-0 motion-reduce:animate-none"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      strokeWidth={RING_WEIGHT}
      aria-hidden
    >
      <circle
        className="stroke-foreground"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={(RING_SIZE - RING_WEIGHT) / 2}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - RING_ARC}
      />
    </svg>
  )
}

/**
 * At the foot of the view, while an agent is at one of the boards: what it is at, and
 * a way to go and watch, in PCB mode. A board it has not built yet it is making; one
 * built before, it is checking, or changing as the model changes.
 */
export function BoardAtWork({
  projectId,
  boards,
}: {
  projectId: string
  boards: readonly BoardSummary[]
}) {
  const board = useBoardAtWork(projectId, boards)
  const setView = useStore((state) => state.setView)
  if (!board) return null
  const doing = board.built === null ? "Making the PCB" : "Checking the PCB"
  return (
    <Floating
      role="status"
      className="pointer-events-auto flex items-center gap-2.5 py-1.5 pr-1.5 pl-4"
    >
      <BoardIcon className="size-4 shrink-0" />
      <span
        className="mr-1 shimmer truncate font-medium text-muted-foreground shimmer-color-foreground"
        title={board.name}
      >
        {doing}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="rounded-full px-3.5"
        onClick={() => setView({ board: board.id })}
      >
        Show
      </Button>
    </Floating>
  )
}
