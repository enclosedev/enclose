// What is said of the inspiration board at the foot of the view: see inspiration-mode.tsx.
import { SquareIcon } from "lucide-react"

import { Floating } from "@/components/floating"
import { Button } from "@/components/ui/button"
import { useInspiration } from "@/lib/inspiration"
import { duration, useNow } from "@/lib/time"

const NONE: string[] = []

/**
 * At the foot of the view while the agent looks at the pictures just put on the board:
 * how long it has been at it, how many it has to look at, and a way to have it leave
 * off, as when it looks over the model of files just opened.
 */
export function LookingAtPictures({ projectId }: { projectId: string }) {
  const analysing = useInspiration((s) => s.analysing[projectId] ?? NONE)
  const since = useInspiration((s) => s.since[projectId])
  const waiting = useInspiration(
    (s) =>
      s.boards[projectId]?.images.filter((image) => image.overview === null)
        .length ?? 0
  )
  const now = useNow(1000)
  if (analysing.length === 0) return null
  const many = Math.max(analysing.length, waiting)
  const doing = `Understanding ${many === 1 ? "the image" : `${many} images`}`
  return (
    <Floating className="pointer-events-auto flex items-center gap-3 py-2.5 pr-2.5 pl-6">
      <span className="min-w-[3ch] text-foreground/45">
        {duration(now - (since ?? now))}
      </span>
      <span
        className="mr-2 w-52 shimmer truncate font-medium text-muted-foreground shimmer-color-foreground"
        title={doing}
      >
        {doing}
      </span>
      <Button
        size="icon-sm"
        className="shrink-0 bg-destructive text-white hover:bg-destructive/80"
        onClick={() => void window.cad.inspiration.stop(projectId)}
      >
        <SquareIcon className="size-3 fill-current" />
        <span className="sr-only">Stop</span>
      </Button>
    </Floating>
  )
}

/** At the foot of the view, with a picture gone up to that has nothing noted on it: how to. */
export function NotingHint({ projectId }: { projectId: string }) {
  const focused = useInspiration((s) => s.focused)
  const bare = useInspiration(
    (s) =>
      focused !== null &&
      (s.boards[projectId]?.images.find((image) => image.id === focused)?.notes
        .length ?? 1) === 0
  )
  if (!bare) return null
  return (
    <Floating className="px-5 py-2.5 text-muted-foreground">
      Click anywhere on the image to pin a note
    </Floating>
  )
}
