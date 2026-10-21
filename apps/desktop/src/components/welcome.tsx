// What the window shows with no projects in it: how one is started, and beside that the
// app's examples, to start from one. It is a row, and goes on past the window's edge:
// it is scrolled along.
import * as React from "react"
import { ArrowRightIcon, DownloadIcon, Loader2Icon } from "lucide-react"

import { EXAMPLES, type Example } from "@shared/examples"
import arm from "@/assets/examples/arm.webp"
import clock from "@/assets/examples/clock.webp"
import lamp from "@/assets/examples/lamp.webp"
import stool from "@/assets/examples/stool.webp"
import { Logo } from "@/components/mark"
import { Button } from "@/components/ui/button"
import { RESTING_WIDTH } from "@/lib/mark"
import { sizeOf } from "@/lib/model"
import { MAC } from "@/lib/platform"
import { usePreferences } from "@/lib/preferences"
import { scrollSource } from "@/lib/scroll"
import { useStore } from "@/lib/store"

/** How big the mark stands over the words of welcome, px. */
const MARK_SIZE = 64
/**
 * How far the mark stops short of the side of its square, px. It is moved over by as
 * much, so that it starts where the words under it do.
 */
const MARK_INSET = (MARK_SIZE * (1 - RESTING_WIDTH)) / 2

/** The picture of each example, by example: its model, on nothing. */
const PICTURES: Record<string, string> = { arm, clock, lamp, stool }

/** The button that makes something new: filled to its edge, where the others have a line. */
const MAKES =
  "w-full bg-foreground bg-clip-border text-background hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_15%)]"
/** One that only opens something: a line round it and nothing in it, and a little lower. */
const OPENS = "h-9.5 w-full border-input bg-transparent hover:bg-input/30"

/** How a project is started: the words of welcome, and the buttons under them. */
function Start() {
  const addProject = useStore((s) => s.addProject)
  const createProject = useStore((s) => s.createProject)
  return (
    <div className="mt-[7px] flex w-60 shrink-0 flex-col items-start">
      <div style={{ marginLeft: -MARK_INSET }}>
        <Logo size={MARK_SIZE} />
      </div>
      <div className="mt-6 text-xl/[1.35]">
        <h1 className="font-bold">Welcome to Enclose</h1>
        <p className="text-foreground/45">Drop a file or folder here</p>
      </div>
      <div className="mt-5 flex w-53 flex-col gap-2.5">
        <Button
          size="lg"
          className={MAKES}
          onClick={() => void createProject()}
        >
          Create something new
          <ArrowRightIcon size={18} absoluteStrokeWidth strokeWidth={1} />
        </Button>
        {/* a Mac's picker takes files and folders alike; no other system's does */}
        {MAC ? (
          <Button
            variant="outline"
            size="lg"
            className={OPENS}
            onClick={() => void addProject()}
          >
            Open file or folder
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              size="lg"
              className={`${OPENS} px-0`}
              onClick={() => void addProject("file")}
            >
              Open file
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={`${OPENS} px-0`}
              onClick={() => void addProject("folder")}
            >
              Open folder
            </Button>
          </div>
        )}
      </div>
      <p className="mt-5.5 text-[11px]/4 whitespace-nowrap text-foreground/80">
        Opens STEP, STL and OBJ files
      </p>
    </div>
  )
}

/** An example to start from: its picture, and under that its name and what it is to fetch. */
function ExampleCard({ example }: { example: Example }) {
  const startExample = useStore((s) => s.startExample)
  const received = useStore((s) => s.starting[example.id])
  const starting = received !== undefined
  const picture = PICTURES[example.id]
  return (
    <button
      type="button"
      aria-busy={starting}
      onClick={() => void startExample(example.id)}
      className="relative flex size-87.5 shrink-0 cursor-pointer flex-col justify-end overflow-hidden rounded-2xl border bg-foreground/11 text-left transition-colors outline-none hover:bg-foreground/14 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-busy:cursor-default aria-busy:hover:bg-foreground/11"
    >
      {picture && (
        <img
          src={picture}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      <span className="relative flex items-center justify-between gap-3 px-[19px] pb-[15px]">
        <span className="flex min-w-0 flex-col text-xs">
          <span className="truncate font-medium">{example.name}</span>
          <span className="truncate text-foreground/45">
            {!starting
              ? "Download example"
              : received > 0
                ? "Downloading…"
                : "Opening…"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-[13px]">
          {starting && received > 0
            ? `${Math.floor((received / example.bytes) * 100)}%`
            : sizeOf(example.bytes)}
          {starting ? (
            <Loader2Icon
              size={16}
              absoluteStrokeWidth
              strokeWidth={1}
              className="animate-spin"
            />
          ) : (
            <DownloadIcon size={16} absoluteStrokeWidth strokeWidth={1} />
          )}
        </span>
      </span>
    </button>
  )
}

/** No projects at all: how one is started, and the examples there are to start from. */
export function Welcome() {
  const source = React.useMemo(() => scrollSource(), [])
  return (
    <div
      // A wheel turns one way only, and this goes the other: its turning is taken along
      // the row. Fingers go whichever way they like, and are left to.
      onWheel={(event) => {
        if (event.deltaX !== 0 || event.deltaMode !== 0) return
        const { scrolling } = usePreferences.getState()
        const from =
          scrolling === "auto"
            ? source(event.nativeEvent, event.timeStamp)
            : scrolling === "trackpad"
              ? "fingers"
              : "wheel"
        if (from === "wheel") event.currentTarget.scrollLeft += event.deltaY
      }}
      className="flex h-full [scrollbar-width:none] items-center gap-[8.1vw] overflow-x-auto overscroll-x-contain px-[11.7vw] select-none"
    >
      <Start />
      {/* (a little under the middle, where the words beside them are in it) */}
      <div className="mt-8.5 flex shrink-0 gap-5">
        {EXAMPLES.map((example) => (
          <ExampleCard key={example.id} example={example} />
        ))}
      </div>
    </div>
  )
}
