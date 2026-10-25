// A picture on the inspiration board, as it lies there, with what was noted on it: see
// inspiration-mode.tsx.
import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"

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
 * One picture on the board, as it lies: in a pile, by itself, or gone up to. And on it
 * the user's notes, each a dot at its place: what it says is shown beside it while the
 * pointer is over it, or always where the notes are to be shown.
 */
export const Card = React.memo(function Card({
  projectId,
  shown,
  picked,
  focused,
  dim,
  moving,
  going = false,
  intro,
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
  /** being dragged, and held over a group it is to go into */
  going?: boolean
  /** how long after the board opened it comes up, ms: none for one put on it since */
  intro?: number
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
  const notes = pile === null && (image.notes.length > 0 || writing !== null)
  // where it lies and how it moves there, for the picture and for its notes alike
  const motion = cn(
    !moving &&
      "transition-[translate,rotate,width,height,opacity] duration-450 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
    moving &&
      "transition-[scale,opacity] duration-200 ease-out motion-reduce:transition-none",
    going && "scale-75 opacity-80",
    dim && "opacity-15",
    intro !== undefined && "inspiration-intro"
  )
  const place: React.CSSProperties = {
    width: box.w,
    height: box.h,
    translate: `${box.x - box.w / 2}px ${box.y - box.h / 2}px`,
    rotate: `${turn}deg`,
    animationDelay: intro !== undefined ? `${intro}ms` : undefined,
  }
  return (
    <>
      <div
        data-key={key}
        data-image={image.id}
        className={cn(
          // (and no will-change: a layer of its own is drawn at the zoom it was first
          // seen at, and only stretched as the board is zoomed into, the picture blurred)
          "absolute top-0 left-0 bg-foreground/5 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.45)]",
          motion,
          focused ? "cursor-crosshair" : "cursor-pointer",
          // (over its neighbours while the pointer is on it)
          "hover:z-450!"
        )}
        style={{
          ...place,
          zIndex: Math.round(z * 100),
          outline: picked
            ? "calc(2px / var(--zoom)) solid var(--color-primary)"
            : undefined,
          outlineOffset: "calc(3px / var(--zoom))",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
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
        </div>
        {analysing && (
          <Spinner className="pointer-events-none absolute top-0 right-full mr-[calc(8px/var(--zoom))] size-[calc(20px/var(--zoom))] text-foreground/80" />
        )}
      </div>
      {/* its notes, lying over it but over every other picture too, for their words to
          be read where they reach across the next one: those of a picture the pointer
          is on, or being written, over the rest */}
      {notes && (
        <div
          data-notes
          className={cn(
            "pointer-events-none absolute top-0 left-0",
            motion,
            "hover:z-1450!"
          )}
          style={{
            ...place,
            zIndex: writing ? 1500 : 1000 + Math.round(z * 100),
          }}
        >
          {image.notes.map((note) =>
            writing?.note === note.id ? null : (
              <NoteMark
                key={note.id}
                note={note}
                shown={notesShown}
                onOpen={() => onNote(note)}
              />
            )
          )}
          {writing && (
            <NoteWriting
              writing={writing}
              onText={onText}
              onWritten={() => onWritten(writing)}
              onDrop={writing.note ? () => onDropNote(writing.note!) : null}
              onCancel={onStopWriting}
            />
          )}
        </div>
      )}
    </>
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
        className="pointer-events-auto absolute size-4 -translate-1/2 cursor-pointer rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] ring-1 ring-black/25 transition-transform hover:scale-125"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
      />
      <div
        className={cn(
          "pointer-events-none absolute top-0 left-3.5 w-max max-w-60 -translate-y-1/2 rounded-xl bg-background/85 px-3.5 py-2.5 text-xs/snug font-medium text-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-sm",
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
      className="pointer-events-auto absolute"
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
      <div className="absolute top-0 left-5 flex w-72 -translate-y-1/2 animate-in flex-col gap-3 rounded-2xl bg-background/90 p-3.5 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md duration-150 zoom-in-95 fade-in">
        {onDrop && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete note"
            title="Delete note"
            className="absolute top-2 right-2 text-muted-foreground transition-[color,background-color] hover:bg-red-600 hover:text-white dark:hover:bg-red-600"
            onClick={onDrop}
          >
            <XIcon />
          </Button>
        )}
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
          className={cn(
            "w-full resize-none bg-transparent px-1 text-sm/relaxed outline-none placeholder:text-muted-foreground",
            // (clear of the cross in the corner)
            onDrop && "pr-6"
          )}
        />
        <div className="flex justify-end">
          <Button size="xs" onClick={onWritten}>
            {writing.note ? "Save" : "Pin"}
          </Button>
        </div>
      </div>
    </div>
  )
}
