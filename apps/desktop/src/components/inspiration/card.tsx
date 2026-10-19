// A picture on the inspiration board, as it lies there, with what was noted on it: see
// inspiration-mode.tsx.
import * as React from "react"
import { cn } from "cn"
import { Trash2Icon } from "lucide-react"

import {
  inspirationUrl,
  type InspirationImage,
  type InspirationNote,
} from "@shared/inspiration-format"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { Box } from "./layout"

/**
 * What is picked out, or pressed, on the board: a picture by itself (`i:` and its id),
 * or a group lying in its pile (`g:` and the group's). A group that is spread out is
 * its pictures, each by itself.
 */
export type Key = `i:${string}` | `g:${string}`

/** A picture as the board shows it now: where, how big, how far turned, and over what. */
export type Shown = {
  image: InspirationImage
  key: Key
  box: Box
  turn: number
  z: number
  /** the group whose pile it lies in, if it does */
  pile: string | null
  /** it is on top of its pile, or in none: what is picked out is drawn round it */
  top: boolean
}

/**
 * Something being written of a place on a picture: a new note, or one there is, and
 * what has been written of it so far.
 */
export type Writing = {
  image: string
  note: string | null
  at: [number, number]
  text: string
}

/**
 * One picture on the board, as it lies: in a pile, by itself, or gone up to. Over it at
 * its top left, while the agent looks at it, a small turning ring, on a shade that fades
 * out from the corner so that it shows on a white picture. And on it the user's notes,
 * each a dot at its place: what it says is shown beside it while the pointer is over it,
 * or always where the notes are to be shown.
 */
export const Card = React.memo(function Card({
  projectId,
  shown,
  picked,
  focused,
  dim,
  moving,
  analysing,
  notesShown,
  writing,
  onNote,
  onText,
  onWritten,
  onDropNote,
  onStopWriting,
}: {
  projectId: string
  shown: Shown
  picked: boolean
  focused: boolean
  dim: boolean
  moving: boolean
  analysing: boolean
  notesShown: boolean
  writing: Writing | null
  onNote: (note: InspirationNote) => void
  onText: (text: string) => void
  onWritten: (writing: Writing) => void
  onDropNote: (note: string) => void
  onStopWriting: () => void
}) {
  const { image, box, turn, z, pile, key } = shown
  const [gone, setGone] = React.useState(false)
  const notes = pile === null
  return (
    <div
      data-key={key}
      data-image={image.id}
      className={cn(
        "absolute top-0 left-0 rounded-[calc(10px/max(var(--zoom),0.6))] bg-foreground/5 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.45)] will-change-transform",
        !moving &&
          "transition-[translate,rotate,width,height,opacity] duration-450 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        focused ? "cursor-crosshair" : "cursor-pointer",
        // (over its neighbours while the pointer is on it, its notes' words with it)
        "hover:z-450!",
        dim && "opacity-15"
      )}
      style={{
        width: box.w,
        height: box.h,
        translate: `${box.x - box.w / 2}px ${box.y - box.h / 2}px`,
        rotate: `${turn}deg`,
        zIndex: Math.round(z * 100),
        outline: picked
          ? "calc(2px / var(--zoom)) solid var(--color-primary)"
          : undefined,
        outlineOffset: "calc(3px / var(--zoom))",
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {gone ? (
          <div className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {image.name}
          </div>
        ) : (
          <img
            src={inspirationUrl(projectId, image.file)}
            alt={image.name}
            draggable={false}
            decoding="async"
            onError={() => setGone(true)}
            className="pointer-events-none size-full object-cover select-none"
          />
        )}
        {analysing && (
          <div
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{ scale: "calc(1 / var(--zoom))" }}
          >
            <div className="absolute top-0 left-0 size-24 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.5),transparent_70%)]" />
            <Spinner className="relative m-2.5 size-3.5 text-white" />
          </div>
        )}
      </div>
      {notes &&
        image.notes.map((note) =>
          writing?.note === note.id ? null : (
            <NoteMark
              key={note.id}
              note={note}
              shown={notesShown}
              onOpen={() => onNote(note)}
            />
          )
        )}
      {notes && writing && (
        <NoteWriting
          writing={writing}
          onText={onText}
          onWritten={() => onWritten(writing)}
          onDrop={writing.note ? () => onDropNote(writing.note!) : null}
          onCancel={onStopWriting}
        />
      )}
    </div>
  )
})

/** A note on a picture: a dot at its place, at the size it is read at whatever the zoom. */
function NoteMark({
  note,
  shown,
  onOpen,
}: {
  note: InspirationNote
  shown: boolean
  onOpen: () => void
}) {
  return (
    <div
      className="group/note absolute"
      style={{
        left: `${note.at[0] * 100}%`,
        top: `${note.at[1] * 100}%`,
        scale: "calc(1 / var(--zoom))",
        zIndex: 2,
      }}
    >
      <button
        type="button"
        aria-label={note.text}
        className="absolute size-4 -translate-1/2 cursor-pointer rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] ring-1 ring-black/25 transition-transform hover:scale-125"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
      />
      <div
        className={cn(
          "pointer-events-none absolute top-0 left-3 w-max max-w-56 -translate-y-1/2 rounded-xl bg-background/85 px-2.5 py-1.5 text-xs/snug text-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-sm",
          shown
            ? "line-clamp-3"
            : "hidden group-hover/note:block group-hover/note:animate-in group-hover/note:fade-in"
        )}
      >
        {note.text}
      </div>
    </div>
  )
}

/** What is written of a place on a picture: a box at its dot, Enter to keep it, Esc to leave it. */
function NoteWriting({
  writing,
  onText,
  onWritten,
  onDrop,
  onCancel,
}: {
  writing: Writing
  onText: (text: string) => void
  onWritten: () => void
  onDrop: (() => void) | null
  onCancel: () => void
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${writing.at[0] * 100}%`,
        top: `${writing.at[1] * 100}%`,
        scale: "calc(1 / var(--zoom))",
        zIndex: 3,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="absolute size-4 -translate-1/2 rounded-full bg-primary shadow-[0_1px_4px_rgba(0,0,0,0.5)] ring-2 ring-white" />
      <div className="absolute top-0 left-4 flex w-64 -translate-y-1/2 animate-in flex-col gap-1.5 rounded-2xl bg-background/90 p-2 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md duration-150 zoom-in-95 fade-in">
        <textarea
          autoFocus
          rows={3}
          value={writing.text}
          placeholder="What matters here?"
          aria-label="Note"
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              onWritten()
            }
          }}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2 pl-1.5">
          <span className="text-xs text-muted-foreground">
            Enter to pin, Esc to leave
          </span>
          <div className="flex items-center gap-1">
            {onDrop && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete note"
                className="text-muted-foreground hover:text-destructive"
                onClick={onDrop}
              >
                <Trash2Icon />
              </Button>
            )}
            <Button size="xs" onClick={onWritten}>
              Pin
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
