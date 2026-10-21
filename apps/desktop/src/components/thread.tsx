import * as React from "react"
import { cn } from "cn"
import {
  ArrowUpIcon,
  BoxesIcon,
  BoxIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  GitBranchPlusIcon,
  PanelRightCloseIcon,
  PlusIcon,
  QuoteIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import type {
  ConversationSummary,
  Doing,
  Project,
  Said,
  ThreadItem,
} from "@shared/api"
import { Composer } from "@/components/composer"
import { BoardIcon, ReferenceIcon } from "@/components/icons"
import { StepsInLine } from "@/components/pcb/board-steps"
import { Thumb } from "@/components/picture"
import { QuestionCard } from "@/components/question"
import { QUOTABLE, Quoting } from "@/components/quoting"
import { Reply } from "@/components/reply"
import { LINE, LIVE, Meanwhile, REACH, Steps } from "@/components/steps"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { stretches } from "@/lib/mentions"
import { inLine } from "@/lib/quotes"
import { answering, PROVIDER_WORDS, usable } from "@/lib/providers"
import {
  inBlocks,
  spelledOut,
  type Block,
  type Steps as Stretch,
} from "@/lib/steps"
import {
  fitThread,
  goesBy,
  THREAD_WIDTH,
  useStack,
  useStore,
  VIEW_MIN,
} from "@/lib/store"
import { duration, useNow } from "@/lib/time"
import { atPictures, pictureName, pictureUrl } from "@shared/pictures"

type Of<Kind extends ThreadItem["kind"]> = Extract<ThreadItem, { kind: Kind }>

/**
 * Something the user said, in its bubble. Lines made about as long as each other leave
 * the box they were set in wider than they are, so the bubble is drawn in to the longest
 * of them. One that waits to be said is only outlined.
 */
function Bubble({
  of,
  waiting,
  className,
  children,
}: {
  /** what is said in it: it is fitted again when that changes */
  of: string
  waiting?: boolean
  className?: string
  children: React.ReactNode
}) {
  const box = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const at = box.current
    const within = at?.parentElement
    if (!at || !within) return
    const fit = () => {
      at.style.width = ""
      const range = document.createRange()
      range.selectNodeContents(at)
      const lines = [...range.getClientRects()].filter((line) => line.width > 0)
      if (lines.length === 0) return
      const style = getComputedStyle(at)
      const around =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth)
      const wide =
        Math.max(...lines.map((line) => line.right)) -
        Math.min(...lines.map((line) => line.left))
      at.style.width = `${Math.ceil(wide + around)}px`
    }
    // (looked at once to begin with, and again whenever there is more or less room)
    const watching = new ResizeObserver(fit)
    watching.observe(within)
    // the letters may not have been in their own font yet
    void document.fonts.ready.then(fit)
    return () => watching.disconnect()
  }, [of])
  return (
    <div
      ref={box}
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
        waiting
          ? "border border-dashed border-foreground/25 text-muted-foreground"
          : "bg-user-message",
        className
      )}
    >
      {children}
    </div>
  )
}

const UserMessage = React.memo(function UserMessage({
  item,
  project,
  waiting,
}: {
  item: Of<"user">
  project: Project
  /** it is yet to be said: it waits for the turn under way to be over */
  waiting?: boolean
}) {
  const pictures = item.pictures ?? []
  const numbers = pictures.map((picture) => picture.number)
  // asked by the app itself, and so not shown as something the user said
  if (item.lookOver)
    return (
      <div className="text-center text-xs text-muted-foreground">
        Enclose asked for the files you opened to be looked over
      </div>
    )
  return (
    <div className="flex flex-col items-end gap-1.5">
      {item.part && (
        <Badge variant="outline">
          <BoxIcon data-icon="inline-start" />
          {goesBy(item.part)}
        </Badge>
      )}
      {item.reference && (
        <Badge variant="outline" title={item.reference}>
          <ReferenceIcon data-icon="inline-start" />
          Reference scene
        </Badge>
      )}
      {item.board && (
        <Badge variant="outline" title={item.board}>
          <BoardIcon data-icon="inline-start" />
          {item.board}
        </Badge>
      )}
      {item.version && (
        <Badge
          variant="outline"
          title="What you asked for in another conversation, summed up by the agent"
        >
          <GitBranchPlusIcon data-icon="inline-start" />
          New version
        </Badge>
      )}
      {item.objects && item.objects.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {item.objects.map((one, index) => (
            <Badge
              key={index}
              variant="outline"
              title={`The whole of it: ${one.parts.length} parts`}
            >
              <BoxesIcon data-icon="inline-start" />
              {one.label}
            </Badge>
          ))}
        </div>
      )}
      {pictures.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {pictures.map((picture) => (
            <Thumb
              key={picture.id}
              projectId={project.id}
              picture={picture}
              className="block size-24 rounded-xl ring-1 ring-foreground/10"
            />
          ))}
        </div>
      )}
      {item.quotes?.map((one, index) => (
        <Bubble
          key={index}
          of={one.quote + one.text}
          waiting={waiting}
          className="flex flex-col items-start gap-1.5"
        >
          <Badge variant="outline" title={one.quote} className="max-w-full">
            <QuoteIcon data-icon="inline-start" className="shrink-0" />
            <span className="min-w-0 truncate">{inLine(one.quote)}</span>
          </Badge>
          {one.text}
        </Bubble>
      ))}
      {item.notes?.map((note, index) => (
        <Bubble
          key={index}
          of={note.text}
          waiting={waiting}
          className="flex flex-col items-start gap-1"
        >
          <Badge variant="outline">
            <BoxIcon data-icon="inline-start" />
            {goesBy(note.part)}
          </Badge>
          {note.text}
        </Bubble>
      ))}
      {item.text && (
        <Bubble of={item.text} waiting={waiting}>
          {stretches(item.text).map((stretch, index) =>
            stretch.kind ? (
              <span
                key={index}
                className="rounded-md bg-foreground/10 px-1 py-0.5 font-medium whitespace-nowrap"
              >
                {stretch.text}
              </span>
            ) : (
              atPictures(stretch.text, numbers).map((piece) => {
                const picture = pictures.find(
                  (one) => one.number === piece.picture
                )
                return picture ? (
                  <span
                    key={`${index}:${piece.from}`}
                    className="rounded-md bg-foreground/10 px-1 py-0.5 font-medium whitespace-nowrap"
                  >
                    <img
                      src={pictureUrl(project.id, picture.id)}
                      alt=""
                      draggable={false}
                      className="mr-1 inline-block size-4 rounded-[0.2rem] object-cover align-[-0.2em]"
                    />
                    {pictureName(picture.number)}
                  </span>
                ) : (
                  piece.text
                )
              })
            )
          )}
        </Bubble>
      )}
    </div>
  )
})

/**
 * Something said while the conversation was being answered, which waits its turn: as it
 * will be said, with a way to say it at once, and one to take it back.
 */
const Queued = React.memo(function Queued({
  item,
  project,
  elsewhere,
}: {
  item: Said
  project: Project
  /** another of the project's conversations is being answered: this cannot be said yet */
  elsewhere: boolean
}) {
  return (
    // (as wide as the conversation, as anything said in it is: a bubble is sized by that)
    <div className="flex flex-col gap-1">
      <UserMessage item={item} project={project} waiting />
      {/* the cross ends where the bubble does, and not the room round it */}
      <div className="-mr-1.5 flex items-center gap-1 self-end text-xs text-muted-foreground">
        <ClockIcon
          size={12}
          absoluteStrokeWidth
          strokeWidth={1}
          className="shrink-0"
        />
        <span className="mr-1">Queued</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="hover:text-foreground"
                disabled={elsewhere}
                onClick={() =>
                  void window.cad.thread.sendNow(project.id, item.id)
                }
              />
            }
          >
            <ArrowUpIcon />
            <span className="sr-only">Send now</span>
          </TooltipTrigger>
          <TooltipContent>Send now</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="hover:text-foreground"
                onClick={() =>
                  void window.cad.thread.unqueue(project.id, item.id)
                }
              />
            }
          >
            <XIcon />
            <span className="sr-only">Remove</span>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})

function PermissionCard({
  item,
  project,
}: {
  item: Of<"permission">
  project: Project
}) {
  const answer = (choice: "allow" | "always" | "deny") =>
    void window.cad.thread.answer(project.id, item.id, choice)
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl bg-card py-3.5 ring-1 ring-foreground/10",
        REACH
      )}
    >
      <div className="text-sm font-medium">{item.title}</div>
      {item.detail && (
        <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap">
          {item.detail}
        </pre>
      )}
      {item.state === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => answer("allow")}>
            Allow
          </Button>
          {item.canAlways && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => answer("always")}
            >
              Always allow
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => answer("deny")}>
            Deny
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {item.state === "allowed" ? "Allowed" : "Denied"}
        </div>
      )}
    </div>
  )
}

/**
 * A stretch of steps of the turn Claude is on, while it is on it: what it has said on
 * the way, in the conversation as it said it, with the steps between each a line of
 * their own; the last of them the one it is at, where it is the latest thing in the
 * conversation (`live`). When the turn is over the stretch goes back into one line.
 */
function AtWork({
  stretch,
  live,
  doing,
}: {
  stretch: Stretch
  live: boolean
  /** what Claude is at where nothing shows it, which the last of it says while live */
  doing: Doing | null
}) {
  const pieces = spelledOut(stretch)
  const last = pieces.at(-1)
  return pieces.map((piece) =>
    piece.kind === "steps" ? (
      <Steps
        key={piece.id}
        steps={piece.steps}
        took={piece.took}
        working={live && piece === last}
        doing={doing}
      />
    ) : (
      <Reply key={piece.id} item={piece} />
    )
  )
}

/**
 * One thing in the conversation that is not a stretch of steps. Each keeps its object
 * until it changes (see withItem in lib/store.ts), and is drawn again only then: not for
 * every word of the answer that is coming in under it.
 */
const Item = React.memo(function Item({
  item,
  project,
}: {
  item: Exclude<Block, { kind: "steps" }>
  project: Project
}) {
  switch (item.kind) {
    case "user":
      return <UserMessage item={item} project={project} />
    case "assistant":
      return (
        <div {...{ [QUOTABLE]: "" }}>
          <Reply item={item} />
        </div>
      )
    case "permission":
      return <PermissionCard item={item} project={project} />
    case "question":
      return <QuestionCard item={item} project={project} />
    case "job":
      return <JobCard item={item} project={project} />
    case "notice":
      return item.tone === "error" ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription className="whitespace-pre-wrap md:text-balance">
            {item.text}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="text-center text-xs text-muted-foreground">
          {item.text}
        </div>
      )
  }
})

/**
 * A circuit board made in detail in the background, beside the conversation: all of it in
 * one card. At its top, what it is at and how long it has been, with what stops it and
 * what shows the board in PCB mode. Under that, only what is going on now: while it is
 * being made, the last thing the agent said and the step it is on; once it is over, what
 * came of it. "See all" opens the whole of what was done and said in making it, spelled
 * out as a turn is while Claude is at it, and "See less" folds it away again.
 */
function JobCard({
  item,
  project,
}: {
  item: Extract<ThreadItem, { kind: "job" }>
  project: Project
}) {
  const now = useNow(1000)
  const setView = useStore((state) => state.setView)
  const working = item.state === "working"
  // how far it has got, as PCB mode has it at its foot, while it is being made
  const job = working
    ? (project.conversations.find(
        (conversation) => conversation.job?.board === item.board
      )?.job ?? null)
    : null
  const blocks = React.useMemo(() => inBlocks(item.items), [item.items])
  const last = blocks.at(-1)
  const said = !working && last?.kind === "assistant" ? last : null
  const took = (item.ended ?? now) - item.at
  // what was done and said, as it is spelled out while it is under way: the last thing
  // said, and the steps after it, which is the one it is on
  const pieces = React.useMemo(
    () =>
      blocks.flatMap((block): Block[] =>
        block.kind === "steps" ? spelledOut(block) : [block]
      ),
    [blocks]
  )
  const lastSaid = pieces.findLast((piece) => piece.kind === "assistant")
  const onNow = pieces.at(-1)?.kind === "steps" ? pieces.at(-1) : undefined
  const shown = working
    ? [lastSaid, onNow].filter((piece) => piece !== undefined)
    : said
      ? [said]
      : pieces.slice(-1)
  const hidden = pieces.length > shown.length
  // Once it is over it is kept to a square, which what came of it is often longer than:
  // the foot of it fades out where there is more, and a click on it shows the rest. A
  // click on what it is called puts it back.
  const [open, setOpen] = React.useState(false)
  const kept = !working && !open
  const body = React.useRef<HTMLDivElement>(null)
  const [more, setMore] = React.useState(false)
  React.useLayoutEffect(() => {
    const within = body.current
    if (!within || !kept) return setMore(false)
    const measure = () => setMore(within.scrollHeight > within.clientHeight + 1)
    measure()
    const sized = new ResizeObserver(measure)
    sized.observe(within)
    for (const child of within.children) sized.observe(child)
    return () => sized.disconnect()
  }, [kept, blocks])
  const title = working
    ? `Making ${item.name} in detail`
    : item.state === "done"
      ? `Made ${item.name} in detail`
      : item.state === "stopped"
        ? `Stopped making ${item.name}`
        : `${item.name} could not be made`
  return (
    // (as wide as the conversation, which is what the square is counted from)
    <div className={cn("@container", REACH, "px-0")}>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border bg-foreground/[0.025] px-4.5 py-3 transition-colors duration-150 hover:border-foreground/18",
          kept && "max-h-[100cqw]"
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <BoardIcon className="size-4 shrink-0" />
          {working ? (
            <span className={cn("min-w-0 truncate font-medium", LIVE)}>
              {title}
            </span>
          ) : (
            <button
              type="button"
              aria-expanded={open || !more}
              onClick={() => setOpen(!open)}
              className="min-w-0 cursor-pointer truncate text-left font-medium outline-none focus-visible:underline"
            >
              {title}
            </button>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {duration(took)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setView({ board: item.board })}
                  />
                }
              >
                <EyeIcon />
                <span className="sr-only">Show the board</span>
              </TooltipTrigger>
              <TooltipContent>Show the board</TooltipContent>
            </Tooltip>
            {working && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      className="bg-destructive text-white hover:bg-destructive/80"
                      onClick={() => void window.cad.thread.stopJob(project.id)}
                    />
                  }
                >
                  <SquareIcon className="size-3 fill-current" />
                  <span className="sr-only">Stop making the board</span>
                </TooltipTrigger>
                <TooltipContent>Stop making the board</TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
        {job && <StepsInLine job={job} />}
        <div
          ref={body}
          className={cn(
            "relative -mx-4.5 -mb-3 flex min-h-0 flex-col gap-3 px-4.5 pb-3",
            kept && "overflow-hidden",
            more && "mask-b-from-[calc(100%-5rem)] mask-b-to-100%"
          )}
        >
          {open
            ? [
                ...blocks.filter((block) => block !== said),
                ...(said ? [said] : []),
              ].map((block) =>
                block.kind === "steps" ? (
                  working ? (
                    <AtWork
                      key={block.id}
                      stretch={block}
                      live={block === last}
                      doing={null}
                    />
                  ) : (
                    <Steps
                      key={block.id}
                      steps={block.steps}
                      took={block.took}
                      working={false}
                    />
                  )
                ) : (
                  <JobPiece
                    key={block.id}
                    piece={block}
                    final={block === said}
                  />
                )
              )
            : shown.map((piece) =>
                piece.kind === "steps" ? (
                  <Steps
                    key={piece.id}
                    steps={piece.steps}
                    took={piece.took}
                    working={working}
                  />
                ) : (
                  <JobPiece
                    key={piece.id}
                    piece={piece}
                    final={piece === said}
                  />
                )
              )}
          {more && (
            <button
              type="button"
              aria-label="Show all of it"
              onClick={() => setOpen(true)}
              className="absolute inset-0 cursor-pointer outline-none"
            />
          )}
        </div>
        {(hidden || open) && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn(
              LINE,
              "w-fit cursor-pointer rounded-md outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
          >
            {open ? "See less" : "See all"}
            <ChevronDownIcon
              className={cn(
                "size-3.5 opacity-60 transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * One thing in a board's card that is not a step: something the agent said, the last of
 * which is what came of it (`final`), whose words can be picked out; or a notice.
 */
function JobPiece({
  piece,
  final,
}: {
  piece: Exclude<Block, { kind: "steps" }>
  final: boolean
}) {
  if (piece.kind === "assistant")
    return final ? (
      <div {...{ [QUOTABLE]: "" }}>
        <Reply item={piece} />
      </div>
    ) : (
      <Reply item={piece} />
    )
  if (piece.kind === "notice")
    return (
      <div
        className={cn(
          "text-xs",
          piece.tone === "error" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {piece.text}
      </div>
    )
  return null
}

/**
 * A model made of a mesh can be cut into and added to, but what was a size of it is
 * gone: offered here, the agent builds it again as code, with the mesh to measure. Or
 * the mesh is kept as it is, and this is not offered again.
 */
function RebuildOffer({ project }: { project: Project }) {
  const offered = useStore(
    (state) =>
      state.meshes[project.id] === true &&
      !state.keptMeshes.includes(project.id)
  )
  const rebuild = useStore((state) => state.rebuild)
  const keepMesh = useStore((state) => state.keepMesh)
  if (!offered) return null
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">Made from a mesh</span>
        <span className="text-balance text-muted-foreground">
          It can be cut into and added to, but its sizes can’t be changed until
          it is rebuilt as code.
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => rebuild(project.id)}>
          Rebuild as editable design
        </Button>
        <Button size="sm" variant="ghost" onClick={() => keepMesh(project.id)}>
          Keep the mesh
        </Button>
      </div>
    </div>
  )
}

/**
 * What the conversation goes by, at the top of it: the name it was given, or else which
 * version of the project it is. Clicked, it is written over: Enter, or clicking away,
 * keeps what is written, and Esc leaves it as it was. Left empty, the conversation goes
 * back to going by its version.
 */
function Name({
  projectId,
  conversation,
}: {
  projectId: string
  /** the one the panel shows; null is a new one, which has no name to change yet */
  conversation: ConversationSummary | null
}) {
  const [written, setWritten] = React.useState<string | null>(null)
  const left = React.useRef(false)
  const NAME = "truncate text-sm font-medium"
  if (!conversation) return <h2 className={NAME}>New conversation</h2>
  const shown = conversation.name ?? `Version ${conversation.version}`
  if (written === null)
    return (
      <h2 className="no-drag -ml-1.5 flex min-w-0">
        <button
          type="button"
          title="Rename"
          onClick={() => {
            left.current = false
            setWritten(shown)
          }}
          className={cn(
            NAME,
            "h-7 cursor-text rounded-md px-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
          )}
        >
          {shown}
        </button>
      </h2>
    )
  // done with once, however it is left: Enter and Esc are both followed by the box
  // losing the caret, which on its own would be clicking away
  const leave = (keep: boolean) => {
    if (left.current) return
    left.current = true
    setWritten(null)
    if (keep && written.trim() !== shown)
      void window.cad.thread.rename(projectId, conversation.id, written)
  }
  return (
    <input
      autoFocus
      aria-label="The conversation's name"
      value={written}
      onChange={(event) => setWritten(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") leave(true)
        if (event.key !== "Escape") return
        // not kept, and not taken for leaving anything else
        event.stopPropagation()
        leave(false)
      }}
      onBlur={() => leave(true)}
      className={cn(
        NAME,
        "no-drag -ml-1.5 h-7 min-w-0 flex-1 rounded-md bg-muted px-1.5 outline-none"
      )}
    />
  )
}

/** Stable when a conversation has nothing waiting to be said. */
const NOTHING_QUEUED: Said[] = []

/** How far an arrow key moves the conversation's edge, px. */
const NUDGE = 16

/** How near its end a conversation is scrolled to be at it, and followed, px. */
const AT_END = 32

/**
 * Keeps a conversation at its very end as it grows, whatever makes it taller: a message,
 * words as they come, a step taking the place of another, a picture come in, words laid
 * out late. For as long as its end is in view: scrolled up to read, it is left there
 * until it is scrolled back down to the end. What the user says (`said`, whenever it
 * changes) is always gone to, from wherever they were. The ref is for what is in it,
 * inside where it scrolls; `there` is whether that is there yet.
 */
function useFollowed<Inside extends HTMLElement>(
  there: boolean,
  said: unknown
) {
  const inside = React.useRef<Inside>(null)
  const following = React.useRef(true)
  const viewOf = (content: HTMLElement | null) =>
    content?.closest<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null

  React.useEffect(() => {
    const content = inside.current
    const view = viewOf(content)
    if (!content || !view) return
    const toEnd = () => {
      if (following.current) view.scrollTop = view.scrollHeight
    }
    // only going up leaves the end: going down to it comes back (what it does itself
    // goes down, and by the time that is told it may have grown again)
    let was = view.scrollTop
    const scrolled = () => {
      const at =
        view.scrollHeight - view.scrollTop - view.clientHeight <= AT_END
      if (at || view.scrollTop < was) following.current = at
      was = view.scrollTop
    }
    // (it growing, and the room for it shrinking, as the window does)
    const watch = new ResizeObserver(toEnd)
    watch.observe(content)
    watch.observe(view)
    view.addEventListener("scroll", scrolled, { passive: true })
    return () => {
      watch.disconnect()
      view.removeEventListener("scroll", scrolled)
    }
  }, [there])

  React.useEffect(() => {
    following.current = true
    const view = viewOf(inside.current)
    if (view) view.scrollTop = view.scrollHeight
  }, [said])

  return inside
}

/**
 * The edge between the view and the conversation: dragged, it makes the conversation
 * wider or narrower. Double-clicked, it goes back to where it started. The panel it is
 * the edge of is the one it is put in.
 */
function Edge() {
  const width = useStore((state) => state.threadWidth)
  const setWidth = useStore((state) => state.setThreadWidth)
  const [dragging, setDragging] = React.useState(false)
  /** where the drag took hold, how wide the panel was then, and how wide it is now */
  const drag = React.useRef<{ x: number; from: number; to: number } | null>(
    null
  )

  const end = () => {
    const done = drag.current
    drag.current = null
    setDragging(false)
    // a press that went nowhere changes nothing: a narrow window may be showing the
    // panel narrower than it was dragged to, and that is not what was asked for
    if (done && done.to !== done.from) setWidth(done.to)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Width of the conversation"
      aria-valuenow={width}
      aria-valuemin={THREAD_WIDTH.min}
      aria-valuemax={fitThread(Infinity, window.innerWidth)}
      tabIndex={0}
      data-dragging={dragging || undefined}
      // astride the panel's border, and a few pixels either side of it to catch
      className="group/edge no-drag absolute inset-y-0 -left-[5px] z-10 w-[9px] cursor-col-resize touch-none outline-none select-none"
      onPointerDown={(event) => {
        const panel = event.currentTarget.parentElement
        if (event.button !== 0 || !panel) return
        // nothing under the pointer is to be selected on the way
        event.preventDefault()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // not a live pointer
        }
        const from = panel.offsetWidth
        drag.current = { x: event.clientX, from, to: from }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const held = drag.current
        const panel = event.currentTarget.parentElement
        if (!held || !panel) return
        held.to = fitThread(
          held.from + held.x - event.clientX,
          window.innerWidth
        )
        // set on the panel itself, and kept only once let go: drawing the whole
        // conversation again at every pixel on the way would drag behind the hand
        panel.style.width = `${held.to}px`
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setWidth(THREAD_WIDTH.initial)}
      onKeyDown={(event) => {
        // the edge goes the way the arrow points: to the left is wider
        const by =
          event.key === "ArrowLeft"
            ? NUDGE
            : event.key === "ArrowRight"
              ? -NUDGE
              : 0
        const panel = event.currentTarget.parentElement
        if (!by || !panel) return
        event.preventDefault()
        setWidth(fitThread(panel.offsetWidth + by, window.innerWidth))
      }}
    >
      <div className="mx-auto h-full w-px transition-colors group-hover/edge:bg-foreground/30 group-focus-visible/edge:bg-ring group-data-dragging/edge:bg-foreground/50" />
    </div>
  )
}

/**
 * The conversation with Claude about the open project: the one turned to, of however
 * many it has had, or a new one with nothing said in it yet.
 */
export function Thread({ project }: { project: Project }) {
  // a conversation settles in days: once a minute is often enough to notice
  const { open } = useStack(project, useNow(60_000))
  const items = useStore((state) => (open ? state.items[open.id] : undefined))
  const load = useStore((state) => state.load)
  const openConversation = useStore((state) => state.openConversation)
  const providers = useStore((state) => state.providers)
  const answers = answering(
    providers,
    useStore((state) => state.provider),
    open
  )
  const agent = providers.find((one) => one.id === answers)
  const { cli } = PROVIDER_WORDS[answers]
  const setThreadOpen = useStore((state) => state.setThreadOpen)
  const width = useStore((state) => state.threadWidth)
  const panel = React.useRef<HTMLElement>(null)

  const openId = open?.id
  React.useEffect(() => {
    if (openId) load(project.id, openId)
  }, [project.id, openId, load])

  const queued = open?.queued ?? NOTHING_QUEUED

  const blocks = React.useMemo(() => inBlocks(items ?? []), [items])
  const working = open?.status === "working"
  // its turn ends in a new version of the project, which the app is about to begin
  const versioning = working && open?.versioning === true
  // one thing at a time is done in a project's folder
  const elsewhere = project.conversations.some(
    (c) => c.status !== "idle" && c.id !== openId
  )
  const doing = working ? (open?.doing ?? null) : null
  // A stretch of steps says for itself that there is more to come, and what Claude is
  // at after them. So do words as they come; words that have come say it no more.
  const latest = blocks.at(-1)
  const asked = blocks.findLastIndex((block) => block.kind === "user")
  const quiet =
    versioning ||
    (working &&
      latest?.kind !== "steps" &&
      (latest?.kind !== "assistant" || doing !== null))

  // follow the conversation as it grows, to the very end of it: past the room left under
  // the last thing said, and the word that it is being worked on, which comes a moment
  // after what was said to set it going. What was said last, and what waits to be, is
  // gone to, and so is another conversation turned to.
  const asking = items?.findLast((item) => item.kind === "user")?.id
  const inside = useFollowed<HTMLDivElement>(
    !!items?.length,
    `${open?.id}:${asking}:${queued.length}`
  )

  return (
    <aside
      ref={panel}
      // (a ground of its own, for the light that goes across it to go behind the rest;
      // and its icons in the lines of the buttons over the view)
      className="thin-icons relative isolate flex shrink-0 flex-col border-l bg-chat"
      // however wide it was dragged, the view keeps its share of a narrower window
      style={{
        width,
        minWidth: THREAD_WIDTH.min,
        maxWidth: `calc(100vw - ${VIEW_MIN}px)`,
      }}
    >
      <Edge />
      {/* (what is being quoted is this conversation's: it is let go of with it) */}
      <Quoting key={open?.id ?? "new"} panel={panel} />
      {versioning && <div aria-hidden className="version-coming" />}
      <header className="drag flex h-12 shrink-0 items-center justify-between gap-2 pr-3 pl-8">
        <Name key={open?.id} projectId={project.id} conversation={open} />
        <div className="no-drag flex items-center text-muted-foreground">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-foreground"
                  // from a new one there is nowhere newer to go
                  disabled={!open}
                  onClick={() => openConversation(project.id, null)}
                />
              }
            >
              <PlusIcon />
              <span className="sr-only">New conversation</span>
            </TooltipTrigger>
            <TooltipContent>New conversation</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-foreground"
                  onClick={() => setThreadOpen(false)}
                />
              }
            >
              <PanelRightCloseIcon />
              <span className="sr-only">Hide the conversation</span>
            </TooltipTrigger>
            <TooltipContent>Hide</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {items?.length ? (
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={inside}
            className="flex flex-col gap-4 px-8 pt-2 pb-6 text-balance"
          >
            {blocks.map((block, index) =>
              block.kind !== "steps" ? (
                <Item key={block.id} item={block} project={project} />
              ) : working && !versioning && index > asked ? (
                // a stretch of the turn Claude is on, spelled out: what it says on the
                // way is how it is followed, and stays where it was said as it goes on
                <AtWork
                  key={block.id}
                  stretch={block}
                  live={block === latest}
                  doing={doing}
                />
              ) : (
                <Steps
                  key={block.id}
                  steps={block.steps}
                  took={block.took}
                  working={false}
                />
              )
            )}
            {quiet && (
              <div className={LINE}>
                {doing && !versioning ? (
                  <Meanwhile doing={doing} />
                ) : (
                  <span className={LIVE}>
                    {versioning ? "Creating a new version" : "Working"}
                  </span>
                )}
              </div>
            )}
            {queued.map((item) => (
              <Queued
                key={item.id}
                item={item}
                project={project}
                elsewhere={elsewhere}
              />
            ))}
          </div>
        </ScrollArea>
      ) : open ? (
        // what was said in it is on its way
        <div className="flex-1" />
      ) : (
        <Empty className="flex-1">
          {/* files being made a model of are as good as one: it is seconds away */}
          {project.manifest || project.bringingIn?.state === "working" ? (
            <EmptyHeader className="gap-0.5">
              <EmptyTitle>Ask the agent about this model</EmptyTitle>
              <EmptyDescription>
                Describe a change, or click a part in the view and say what it
                should become.
              </EmptyDescription>
            </EmptyHeader>
          ) : project.bringingIn ? (
            <EmptyHeader className="gap-0.5">
              <EmptyTitle>No model of the files yet</EmptyTitle>
              <EmptyDescription>
                They are in the project, where the agent can get at them. Ask it
                to set the project up, and it goes on from there.
              </EmptyDescription>
            </EmptyHeader>
          ) : (
            <EmptyHeader className="gap-0.5">
              <EmptyTitle>What do you want to make?</EmptyTitle>
              <EmptyDescription>
                Describe it and the agent builds it in this folder. It takes the
                place of the cube.
              </EmptyDescription>
            </EmptyHeader>
          )}
        </Empty>
      )}

      <div className="flex flex-col gap-2 p-3.5 pt-0">
        {/* (not while anything is being done here, which it would only be in the way of) */}
        {!working && !elsewhere && project.lookOver === null && (
          <RebuildOffer project={project} />
        )}
        <Composer
          placeholder={
            project.manifest
              ? agent && agent.id !== "claude"
                ? "Ask anything, or @tag parts"
                : "Ask anything, @tag parts, $use skills or / for commands"
              : project.bringingIn?.state === "failed"
                ? "Set this project up, so the files show…"
                : "A case for a Raspberry Pi Zero, with a lid that screws on…"
          }
          // opened to be written in: by its button, or by Cmd+B
          autoFocus
        />
        {(elsewhere || (agent && !agent.checking && !usable(agent))) && (
          <p className="px-1.5 text-xs text-balance text-muted-foreground">
            {elsewhere
              ? "Another of this project's conversations is still being answered."
              : agent?.status?.path
                ? `${cli} is switched off. Switch it on in Settings.`
                : `${cli} was not found on this machine. Install it and sign in there.`}
          </p>
        )}
      </div>
    </aside>
  )
}
