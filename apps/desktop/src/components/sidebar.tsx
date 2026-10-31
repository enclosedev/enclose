import * as React from "react"
import { cn } from "cn"
import {
  ChevronDownIcon,
  CornerLeftUpIcon,
  GitBranchIcon,
  PinIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import type { ConversationSummary, Project } from "@shared/api"
import { EXAMPLES, type Example } from "@shared/examples"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useControlHeld } from "@/lib/keys"
import { sizeOf } from "@/lib/model"
import { MAC } from "@/lib/platform"
import { useStack, useStore } from "@/lib/store"
import { ago, elapsed, useNow } from "@/lib/time"

/**
 * What fades out of anything that is put away (see Tucked), and back in. It is each thing
 * that fades, and not all of them as one: a card is glass, and glass inside something
 * that is fading has nothing behind it to be glass over.
 */
const FADES = "group-data-[away]/tuck:opacity-0"

/** What a card is, whether it is a project's or one of its earlier conversations'. */
const CARD = `glass pointer-events-auto relative flex w-full flex-col rounded-xl px-3 py-2.5 text-left ring-1 transition-[color,background-color,border-color,opacity] duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${FADES}`
/** The card of what is open, and the others. */
const LIT = "bg-sidebar-accent/90 shadow-sm ring-card-outline"
const UNLIT =
  "bg-sidebar-accent/45 ring-card-outline/35 hover:bg-sidebar-accent/65"

/** What is kept at the foot of the sidebar: one thing over another. */
const FOOT = "flex shrink-0 flex-col gap-2"

/** What a card is written in, and its name: the same size, and heavier. */
const SMALL = "text-[12px] leading-[1.4]"
const NAME = `truncate ${SMALL} font-medium`

/**
 * What there is to say of a conversation besides what was last said in it: that Claude is
 * in the middle of it, or has got to the end of it and it has not been looked at since.
 */
type News = "working" | "asking" | "board" | "done" | "failed"

function newsOf(
  conversation: ConversationSummary | null,
  finished: string[]
): News | null {
  if (!conversation) return null
  if (conversation.status !== "idle") return conversation.status
  if (conversation.job) return "board"
  if (!finished.includes(conversation.id)) return null
  return conversation.failed ? "failed" : "done"
}

/** How each is said on the card it is the news of, and under a card it is under. */
const NEWS: Record<News, { label: string; under: string; className: string }> =
  {
    working: {
      label: "Working",
      under: "Working in an earlier chat",
      className: "text-attention shimmer shimmer-color-attention-shimmer",
    },
    board: {
      label: "Making a board",
      under: "Making a board in an earlier chat",
      className: "text-attention shimmer shimmer-color-attention-shimmer",
    },
    asking: {
      label: "Needs you",
      under: "An earlier chat needs you",
      className: "text-attention",
    },
    done: {
      label: "Done",
      under: "An earlier chat is done",
      className: "text-foreground",
    },
    failed: {
      label: "Failed",
      under: "An earlier chat failed",
      className: "text-destructive",
    },
  }

/** Top right of a card: when the conversation on it was last carried on. */
function When({
  conversation,
  now,
}: {
  conversation: ConversationSummary
  now: number
}) {
  const finished = useStore((state) => state.finished)
  // one there is news of says that instead, across the end of the card
  if (newsOf(conversation, finished)) return null
  return (
    <span
      className={cn(SMALL, "shrink-0 text-muted-foreground/60 tabular-nums")}
    >
      {ago(conversation.updatedAt, now)}
    </span>
  )
}

/**
 * Top right of the card of a project pinned to the top, in place of when its conversation
 * was last carried on: pinned, it is kept to hand whenever that was.
 */
function Pinned({
  conversation,
}: {
  conversation: ConversationSummary | null
}) {
  const finished = useStore((state) => state.finished)
  // (as there, news of its conversation says that instead)
  if (newsOf(conversation, finished)) return null
  return (
    <span className="self-center text-muted-foreground/60">
      <PinIcon aria-label="Pinned" className="size-3" fill="currentColor" />
    </span>
  )
}

/**
 * What a card says under its name: the last of its conversation, in the two lines there
 * is room for. It has the room of two lines whether it fills them or not, so that one
 * card is as tall as the next.
 */
function Said({
  conversation,
  otherwise,
}: {
  conversation: ConversationSummary | null
  /** what the card says when there is no conversation on it */
  otherwise: string
}) {
  return (
    <span
      className={cn(SMALL, "line-clamp-2 min-h-[2lh] text-muted-foreground")}
    >
      {conversation
        ? (conversation.gist ?? conversation.lastMessage)
        : otherwise}
    </span>
  )
}

/**
 * Under the word that a card's conversation is being worked on: for how long it has
 * been, in the same colour and a lighter letter.
 */
function Going({ since }: { since: number }) {
  // (it is counted in seconds to begin with, which the cards' own clock is too slow for)
  const now = useNow(1000)
  return (
    <span className="font-normal tabular-nums">{elapsed(now - since)}</span>
  )
}

/**
 * Everything written on a card. While there is news of the card's conversation all of
 * it, the name included, gives way at its far end to the card's saying so, half way up
 * the card: the name is on show elsewhere, and this is the news. It gives way to all but
 * a trace of itself, which is still to be made out behind that.
 */
function Written({
  conversation,
  children,
}: {
  conversation: ConversationSummary | null
  children: React.ReactNode
}) {
  const news = newsOf(
    conversation,
    useStore((state) => state.finished)
  )
  return (
    <>
      <span
        className={cn(
          "flex flex-col gap-0.5",
          news &&
            "[mask-image:linear-gradient(to_right,black_calc(100%-6.75rem),rgb(0_0_0/0.04)_calc(100%-4.375rem))]"
        )}
      >
        {children}
      </span>
      {news && (
        <span
          className={cn(
            SMALL,
            "absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-end font-medium",
            // (the light that passes along one being worked on passes along both its lines)
            NEWS[news].className
          )}
        >
          {NEWS[news].label}
          {news === "working" && conversation?.since != null && (
            // (as if begun later, by as long as the user was away from it)
            <Going since={conversation.since + conversation.away} />
          )}
          {news === "board" && conversation?.job && (
            <Going since={conversation.job.since} />
          )}
        </span>
      )}
    </>
  )
}

/**
 * The bottom edge of a card with earlier conversations under it, and the sliver of the
 * next of them that shows below. This is what is pressed to spread them out; the rest
 * of the card opens what is on it. If Claude is in the middle of one of those under the
 * card, the sliver is tall enough to say so.
 */
function Under({
  count,
  news,
  onSpread,
}: {
  count: number
  /** what there is to say of one of them, if there is anything */
  news: News | null
  onSpread: () => void
}) {
  const label = count === 1 ? "1 earlier version" : `${count} earlier versions`
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-expanded={false}
            onClick={onSpread}
            // a little of the card's own edge, and what is under it
            className={cn(
              "group/under pointer-events-auto absolute inset-x-0 z-10 cursor-pointer outline-none",
              news ? "-bottom-7.5 h-9" : "-bottom-3.5 h-5"
            )}
          />
        }
      >
        {/* The card beneath, as much of it as shows: it comes out a little to be pressed.
            It starts just under the edge of the card over it, which is drawn outside
            that card and would otherwise be covered. */}
        <span
          className={cn(
            "glass absolute inset-x-2.5 top-1.75 flex items-center gap-1 rounded-b-lg border-x border-b border-foreground/5 bg-sidebar-accent/45 px-2.5 transition-[height,opacity] duration-200",
            FADES,
            news
              ? "h-6 group-hover/under:h-6.5 group-focus-visible/under:h-6.5"
              : "h-2.5 group-hover/under:h-3.5 group-focus-visible/under:h-3.5"
          )}
        >
          {news && (
            <>
              <span
                className={cn(
                  SMALL,
                  "min-w-0 truncate",
                  news === "working"
                    ? "shimmer text-muted-foreground shimmer-color-foreground"
                    : NEWS[news].className
                )}
              >
                {NEWS[news].under}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </>
          )}
        </span>
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A project: its card, which is the conversation being carried on about it or the offer
 * of a new one, and under the card the conversations had before, which spread out below
 * it when asked for.
 */
function ProjectCard({ project, now }: { project: Project; now: number }) {
  const active = useStore((state) => state.activeId === project.id)
  const openConversation = useStore((state) => state.openConversation)
  const removeProject = useStore((state) => state.removeProject)
  // In PCB mode the cross that takes the project away is not on its card: a red cross
  // is what leaves PCB mode there, and the two are not to be taken for each other. (The
  // card's menu still has it, which is not pressed by mistake.)
  const onBoard = useStore((state) => state.view.board !== null)
  const { cover, under, open } = useStack(project, now)
  const [spread, setSpread] = React.useState(false)
  const [renaming, setRenaming] = React.useState(false)
  const naming = React.useRef<HTMLInputElement>(null)
  // News of one of the conversations under the card, which the card itself has nothing
  // to say of: the edge under it does. Claude being in the middle of one comes first.
  const finished = useStore((state) => state.finished)
  const newsUnder =
    newsOf(under.find((c) => c.status !== "idle") ?? null, finished) ??
    newsOf(under.find((c) => finished.includes(c.id)) ?? null, finished)
  const openUnder = under.some((c) => c.id === open?.id)
  const lit = active && !(spread && openUnder)
  const branches = useControlHeld()
  // The card of the project that is opened is brought to where it can be seen: a new
  // one comes in at the top of the list, which may have been scrolled a long way down.
  const card = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (active) card.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    // (as far from the edge of the list, when it is brought there, as its own edge is drawn)
    <div ref={card} className="flex shrink-0 scroll-my-1 flex-col gap-1.5">
      {/* the card is one button, and closing it another beside it: one cannot go in the other */}
      <div
        className={cn(
          "group/card relative w-49",
          // room for the one that shows under it
          under.length > 0 && !spread && (newsUnder ? "mb-6.75" : "mb-2.75")
        )}
      >
        <ProjectMenu
          project={project}
          naming={naming}
          onRename={() => setRenaming(true)}
        >
          <button
            type="button"
            aria-current={active}
            onClick={() => openConversation(project.id, cover?.id ?? null)}
            className={cn(CARD, lit ? LIT : UNLIT)}
          />
          <Written conversation={cover}>
            <span className="flex items-baseline justify-between gap-2">
              {/* (it keeps its room while it is written over: the card stays as tall) */}
              <span className={cn(NAME, renaming && "invisible")}>
                {project.name}
              </span>
              {/* makes way for the close button while the pointer is on the card */}
              {(cover || project.pinned) && !renaming && (
                <span className="flex self-stretch transition-opacity group-focus-within/card:opacity-0 group-hover/card:opacity-0">
                  {project.pinned ? (
                    <Pinned conversation={cover} />
                  ) : (
                    cover && <When conversation={cover} now={now} />
                  )}
                </span>
              )}
            </span>
            <Said
              conversation={cover}
              otherwise={
                under.length > 0 ? "Start a new session" : "No messages yet"
              }
            />
            {project.branch && branches && (
              <span
                className={cn(
                  SMALL,
                  "mt-1.5 flex items-center gap-1 text-muted-foreground/70"
                )}
              >
                <GitBranchIcon
                  size={11}
                  absoluteStrokeWidth
                  strokeWidth={1}
                  className="shrink-0"
                />
                <span className="truncate">{project.branch}</span>
              </span>
            )}
          </Written>
        </ProjectMenu>
        {renaming ? (
          <Naming
            ref={naming}
            project={project}
            // (short of what the card says of its conversation, across its far end)
            short={newsOf(cover, finished) !== null}
            onDone={() => setRenaming(false)}
          />
        ) : onBoard ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${project.name}`}
            title="Remove project"
            className="pointer-events-auto absolute top-1.5 right-1.5 opacity-0 transition-[opacity,color,background-color] group-hover/card:opacity-100 hover:bg-red-600 hover:text-white focus-visible:opacity-100 dark:hover:bg-red-600"
            onClick={() => void removeProject(project.id)}
          >
            <XIcon />
          </Button>
        )}
        {under.length > 0 && !spread && (
          <Under
            count={under.length}
            news={newsUnder}
            onSpread={() => setSpread(true)}
          />
        )}
      </div>
      {spread &&
        under.map((conversation, index) => (
          <div
            key={conversation.id}
            className="flex animate-in items-center duration-150 fade-in slide-in-from-top-1"
          >
            {/* set in from the card they came out from under, which leaves room beside
                the first of them for what puts them back */}
            <span className="flex w-8 shrink-0 justify-center">
              {index === 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Put the earlier conversations back"
                  className={cn(
                    "pointer-events-auto text-muted-foreground",
                    FADES
                  )}
                  onClick={() => setSpread(false)}
                >
                  <CornerLeftUpIcon />
                </Button>
              )}
            </span>
            <button
              type="button"
              aria-current={active && open?.id === conversation.id}
              onClick={() => openConversation(project.id, conversation.id)}
              className={cn(
                CARD,
                "w-49",
                active && open?.id === conversation.id ? LIT : UNLIT
              )}
            >
              <Written conversation={conversation}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={NAME}>{conversation.title}</span>
                  <When conversation={conversation} now={now} />
                </span>
                <Said conversation={conversation} otherwise="" />
              </Written>
            </button>
          </div>
        ))}
    </div>
  )
}

/**
 * A project whose folder is not where it was: dimmed, saying so, with where it was to be
 * seen on the pointer, and nothing to open. It can be taken off the list; and it is a
 * project again, with its conversations, once its folder is back (the app looks again
 * each time its window is turned to).
 */
function MissingCard({ project }: { project: Project }) {
  const removeProject = useStore((state) => state.removeProject)
  return (
    <div className="relative w-49">
      <div
        title={project.path}
        className={cn(CARD, UNLIT, "opacity-60 hover:bg-sidebar-accent/45")}
      >
        <span className={cn(NAME, "pr-5")}>{project.name}</span>
        <span className={cn(SMALL, "text-muted-foreground")}>
          Folder not found
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${project.name}`}
        title="Remove project"
        className="pointer-events-auto absolute top-1.5 right-1.5 transition-[color,background-color] hover:bg-red-600 hover:text-white dark:hover:bg-red-600"
        onClick={() => void removeProject(project.id)}
      >
        <XIcon />
      </Button>
    </div>
  )
}

/**
 * Something in the list that can be put away, and brought back: it closes up to nothing
 * as it fades, and whatever is under it in the list comes up to where it was. Neither
 * slowly nor in a hurry. Put away, nothing of it is there to be pressed. Or it only
 * fades (`faded`), and keeps its place: for when all of the list goes at once, and
 * there is nothing left to come up to where it was.
 */
function Tucked({
  away,
  faded = false,
  children,
  ref,
}: {
  away: boolean
  faded?: boolean
  children: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      inert={away || faded}
      data-away={away || faded || undefined}
      className={cn(
        "group/tuck grid shrink-0 transition-[grid-template-rows,margin-bottom] duration-300 ease-in-out motion-reduce:transition-none",
        // with nothing of it left, nor is the room the list keeps between two things
        away ? "-mb-1.5 grid-rows-[0fr]" : "grid-rows-[1fr]"
      )}
    >
      {/* (what closes up cuts off whatever is outside it, and a card's edge is drawn
          just outside the card: there is that much room round it) */}
      <div className="-m-1 min-h-0 overflow-hidden p-1">{children}</div>
    </div>
  )
}

/**
 * A project's name, being written over where it is on its card: Enter, or clicking
 * away, keeps what is written, and Esc leaves the name as it was, as does nothing
 * written at all. It lies over the card and is no part of it: the card is a button, and
 * a box to write in cannot go in one.
 */
function Naming({
  project,
  short,
  onDone,
  ref,
}: {
  project: Project
  /** the far end of the card is taken, and the box stops short of it */
  short: boolean
  onDone: () => void
  ref: React.Ref<HTMLInputElement>
}) {
  const [written, setWritten] = React.useState(project.name)
  const left = React.useRef(false)
  // done with once, however it is left: Enter and Esc are both followed by the box
  // losing the caret, which on its own would be clicking away
  const leave = (keep: boolean) => {
    if (left.current) return
    left.current = true
    onDone()
    const name = written.replace(/\s+/g, " ").trim()
    if (keep && name && name !== project.name)
      void window.cad.projects.rename(project.id, name)
  }
  return (
    <input
      ref={ref}
      autoFocus
      aria-label="The project's name"
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
      // over the name, its letters where the name's were
      className={cn(
        SMALL,
        "pointer-events-auto absolute top-1.5 left-1.5 h-6 rounded-md bg-foreground/8 px-1.5 font-medium outline-none",
        short ? "right-19" : "right-1.5"
      )}
    />
  )
}

/** A card, with what else can be done with its project on a right-click. */
function ProjectMenu({
  project,
  naming,
  onRename,
  children,
}: {
  project: Project
  /** where the project's name is written over, while it is */
  naming: React.RefObject<HTMLInputElement | null>
  /** have its name written over, on its card */
  onRename: () => void
  /** the card's button, then what goes in it */
  children: [React.ReactElement, ...React.ReactNode[]]
}) {
  const removeProject = useStore((state) => state.removeProject)
  const recolour = useStore((state) => state.recolour)
  const [card, ...inside] = children
  return (
    <ContextMenu>
      <ContextMenuTrigger render={card}>{inside}</ContextMenuTrigger>
      {/* closed to have the name written, it leaves the caret in the name and not on the card */}
      <ContextMenuContent finalFocus={() => naming.current ?? true}>
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => {
              // (it goes to its new place from where it is, and the others make way)
              notePlaces()
              void window.cad.projects.pin(project.id, !project.pinned)
            }}
          >
            {project.pinned ? "Unpin" : "Pin to top"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void window.cad.projects.reveal(project.id)}
          >
            Open folder
          </ContextMenuItem>
          <ContextMenuItem onClick={onRename}>Rename</ContextMenuItem>
          {project.manifest && (
            <ContextMenuItem onClick={() => recolour(project.id)}>
              Recolor
            </ContextMenuItem>
          )}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          {/* the folder stays; what was said about it goes, which is asked about first */}
          <ContextMenuItem
            variant="destructive"
            onClick={() => void removeProject(project.id)}
          >
            Remove
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** How long a card takes to slide to its new place in the list. */
const SLIDING_MS = 400

/** The cards in the list, by project. */
const cards = new Map<string, HTMLElement>()
/** where each card was, before what is to change their order next */
let were: Map<string, number> | null = null

/** What holds a project's card in the list, for it to be found to slide. */
const holding = (id: string) => (card: HTMLDivElement | null) => {
  if (card) cards.set(id, card)
  else cards.delete(id)
}

/**
 * Note where every card in the list is now, ahead of something that will change their
 * order (see `useSliding`): for a moment, after which nothing is waited for any more.
 */
function notePlaces() {
  const noted = new Map(
    [...cards].map(([id, card]) => [id, card.getBoundingClientRect().top])
  )
  were = noted
  setTimeout(() => {
    if (were === noted) were = null
  }, 1000)
}

/**
 * Has the cards that change places in the list slide there from where they were noted
 * to be (see `notePlaces`), and not jump: a project pinned goes up to the top, over the
 * ones it passes, as they make way below it. Only the same projects in another order
 * move so: where one has come or gone, the cards are where they are drawn, as ever.
 */
function useSliding(order: string) {
  React.useLayoutEffect(() => {
    const tops = were
    were = null
    if (!tops || tops.size !== cards.size) return
    if (![...cards.keys()].every((id) => tops.has(id))) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    for (const [id, card] of cards) {
      const by = (tops.get(id) ?? 0) - card.getBoundingClientRect().top
      if (Math.abs(by) < 1) continue
      // (one going up goes over the ones it passes, which go down under it)
      if (by > 0) card.style.zIndex = "1"
      const sliding = card.animate(
        [{ transform: `translateY(${by}px)` }, { transform: "none" }],
        { duration: SLIDING_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
      )
      void sliding.finished
        .catch(() => {})
        .finally(() => {
          card.style.zIndex = ""
        })
    }
  }, [order])
}

/** One of the app's examples, in the list of what a project is started from. */
function ExampleItem({ example }: { example: Example }) {
  const startExample = useStore((state) => state.startExample)
  const received = useStore((state) => state.starting[example.id])
  const starting = received !== undefined
  return (
    <DropdownMenuItem
      disabled={starting}
      onClick={() => void startExample(example.id)}
    >
      {example.name}
      <span className="ml-auto pl-4 text-xs text-muted-foreground tabular-nums">
        {starting && received > 0
          ? `${Math.floor((received / example.bytes) * 100)}%`
          : sizeOf(example.bytes)}
      </span>
    </DropdownMenuItem>
  )
}

/**
 * The projects: one card per folder, with what its conversation is up to, and its earlier
 * conversations under it, the one added last at the top. The cards float over the 3D view
 * rather than taking a column from it, so the model is never cut off at an edge;
 * everything between and below them still belongs to the view.
 *
 * Under the cards is the button a project is added with, and at the foot of the window
 * whatever the sidebar is given to keep there: the settings. With more cards than there
 * is room for, it is the cards that scroll, on down to the window's edge, and the button
 * stays over what is at the foot, with the cards going by behind the two of them.
 */
export function Sidebar({ children }: { children: React.ReactNode }) {
  const projects = useStore((state) => state.projects)
  const missing = useStore((state) => state.missing)
  // While it is a model's blueprint that is looked at, the sheets have the window: the
  // card of the project they are of stays, at the top, and the rest are put away. And
  // so it is while it is the model's assembly guides, whose covers have it likewise, in
  // PCB mode, where one of its circuit boards has it, on its inspiration board, and once
  // Cmd+. has put the other projects away. (Cmd+. is of the project that is open: with
  // none open there is no view, and the cards are what there is.)
  const activeId = useStore((state) => state.activeId)
  const oneProject = useStore(
    (state) =>
      state.view.blueprint ||
      state.view.assembly ||
      state.view.board !== null ||
      state.view.inspiration ||
      (state.cleared !== null && state.activeId !== null)
  )
  // And while one sheet has the view to itself that card is gone too, and what is at
  // the foot with it: there is nothing over the sheet that is not the sheet's. They
  // fade where they are, and come back the same way. So it is once Cmd+. has given the
  // view the window to itself.
  const alone = useStore(
    (state) =>
      state.view.sheet !== null ||
      (state.cleared === "all" && state.activeId !== null)
  )
  const addProject = useStore((state) => state.addProject)
  const createProject = useStore((state) => state.createProject)
  // an example is a while coming, and the list it was picked from has closed by then:
  // the button it opens from says so until the project is there
  const starting = useStore((state) => Object.keys(state.starting).length > 0)
  const [adding, setAdding] = React.useState(false)
  const now = useNow()
  useSliding(projects.map((project) => project.id).join(" "))
  // with no projects the middle of the window is where one is started
  if (projects.length === 0 && missing.length === 0)
    return (
      <>
        <aside className="pointer-events-none absolute inset-x-0 top-0">
          <div className="drag pointer-events-auto h-12" />
        </aside>
        <div className={cn("absolute bottom-4 left-4.5", FOOT)}>{children}</div>
      </>
    )

  return (
    // wider than a card, by as far as the ones spread out from under it are set in
    <aside className="pointer-events-none absolute inset-y-0 left-0 flex w-68 flex-col">
      {/* room for the window's traffic lights, and something to drag it by */}
      <div className="drag pointer-events-auto h-12 w-58 shrink-0" />
      {/* a list that scrolls cuts off whatever is outside it, and a card's edge is drawn
          just outside the card: it starts a little higher than the first card does */}
      <div className="-mt-1 flex min-h-0 grow [scrollbar-width:none] flex-col items-start gap-1.5 overflow-y-auto px-4.5 pt-1">
        {projects.map((project) => (
          <Tucked
            key={project.id}
            ref={holding(project.id)}
            away={oneProject && project.id !== activeId}
            faded={alone}
          >
            <ProjectCard project={project} now={now} />
          </Tucked>
        ))}
        {/* (after the others: there is nothing to be done in them for now) */}
        {missing.map((project) => (
          <Tucked key={project.id} away={oneProject} faded={alone}>
            <MissingCard project={project} />
          </Tucked>
        ))}
        {/* What is under the cards takes the rest of the list's height, the button at
            the top of it and the settings at the foot. With no height left over it is
            the two of them one over the other, and that stays at the foot of the list
            as the cards go by: over them, and over what shows from under a card. */}
        <div className="sticky bottom-0 z-20 flex shrink-0 grow flex-col justify-between gap-2 pb-4">
          <Tucked away={oneProject} faded={alone}>
            <DropdownMenu open={adding} onOpenChange={setAdding}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className={cn(
                            "pointer-events-auto mt-1.5 shrink-0 bg-background shadow-sm",
                            FADES
                          )}
                        />
                      }
                    />
                  }
                >
                  {starting ? <Spinner /> : <PlusIcon />}
                  <span className="sr-only">New project</span>
                </TooltipTrigger>
                {!adding && (
                  <TooltipContent side="right">New project</TooltipContent>
                )}
              </Tooltip>
              <DropdownMenuContent side="right" align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => void createProject()}>
                    New project
                    <DropdownMenuShortcut className="pl-4">
                      {MAC ? "⌘N" : "Ctrl N"}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                  {/* a Mac's picker takes files and folders alike; no other system's does */}
                  {MAC ? (
                    <DropdownMenuItem onClick={() => void addProject()}>
                      Open file or folder…
                      <DropdownMenuShortcut className="pl-4">
                        ⌘O
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => void addProject("file")}>
                        Open file…
                        <DropdownMenuShortcut className="pl-4">
                          Ctrl O
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void addProject("folder")}
                      >
                        Open folder…
                        <DropdownMenuShortcut className="pl-4">
                          Shift Ctrl O
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Examples</DropdownMenuLabel>
                  {EXAMPLES.map((example) => (
                    <ExampleItem key={example.id} example={example} />
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tucked>
          <div
            inert={alone}
            className={cn(
              "transition-opacity duration-200",
              alone ? "opacity-0" : "pointer-events-auto",
              FOOT
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </aside>
  )
}
