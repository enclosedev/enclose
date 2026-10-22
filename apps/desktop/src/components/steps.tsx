import * as React from "react"
import { cn } from "cn"
import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  ChevronDownIcon,
  EyeIcon,
  FilePlusIcon,
  FileTextIcon,
  FoldVerticalIcon,
  GitBranchPlusIcon,
  GlobeIcon,
  ListIcon,
  MousePointerClickIcon,
  PencilIcon,
  RotateCwIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

import type { Doing } from "@shared/api"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Markdown } from "@/components/markdown"
import { usePreferences } from "@/lib/preferences"
import { sameSteps, type Aside, type Step } from "@/lib/steps"
import { duration, elapsed, useNow } from "@/lib/time"

/** A line of the steps, whichever one; and of anything else that opens as they do. */
export const LINE = "flex h-5 items-center gap-2 text-xs text-muted-foreground"
/**
 * A card in the conversation, as far across as the message box under it, with what is
 * in it as far in as the conversation's words: the conversation's room at its sides
 * (32px) less the box's (14px), out and back in. Its edges and the box's are one line.
 */
export const REACH = "-mx-4.5 px-4.5"
/** Words for what is still going on: a light passes along them, over and over. */
export const LIVE = "shimmer shimmer-color-foreground"
/** How long such a line takes to open into what is under it, ms. */
const OPENING = 200

/**
 * Keeps in view something that opens downwards, while it opens: at the foot of the
 * conversation what is in it would come out below the edge, where nobody is looking.
 * The ref is for the whole of it, the line and what the line opens into.
 */
export function useKeptInView<Whole extends HTMLElement>(open: boolean) {
  const whole = React.useRef<Whole>(null)
  React.useEffect(() => {
    const element = whole.current
    if (!open || !element) return
    const watch = new ResizeObserver(() =>
      element.scrollIntoView({ block: "nearest" })
    )
    watch.observe(element)
    // and let go of once it has opened, so that the conversation scrolls freely again
    const opened = setTimeout(() => watch.disconnect(), OPENING * 2)
    return () => {
      watch.disconnect()
      clearTimeout(opened)
    }
  }, [open])
  return whole
}

/** The picture for each kind of step; any other is a tool of some sort. */
const ICONS: Record<string, LucideIcon> = {
  Run: TerminalIcon,
  Read: FileTextIcon,
  Edit: PencilIcon,
  Write: FilePlusIcon,
  Search: SearchIcon,
  Fetch: GlobeIcon,
  "Web search": GlobeIcon,
  "Find tool": WrenchIcon,
  Subagent: BotIcon,
  Skill: BookOpenIcon,
  Look: EyeIcon,
  Check: MousePointerClickIcon,
  List: ListIcon,
  Create: GitBranchPlusIcon,
}

/** A step in a line: a picture of the kind of thing it was, then what was done, in words. */
function StepLine({
  step,
  live = false,
}: {
  step: Step
  /** it is the one Claude is on, and the line is there to say so */
  live?: boolean
}) {
  const Icon = ICONS[step.name] ?? WrenchIcon
  // a step that failed is one to notice, not an alarm: Claude tries another way
  const failed = step.state === "failed"
  return (
    <>
      <Icon
        className={cn("size-3.5 shrink-0", failed && "text-attention")}
        aria-hidden
      />
      <span className="flex min-w-0 gap-1">
        <span
          className={cn(
            "shrink-0 font-medium",
            failed ? "text-attention" : "text-foreground/80",
            live && !step.detail && LIVE
          )}
        >
          {step.name}
        </span>
        <span
          className={cn(
            "min-w-0 truncate",
            live ? LIVE : step.state === "running" && "text-foreground"
          )}
          title={step.detail}
        >
          {step.detail}
        </span>
      </span>
    </>
  )
}

/** A count of tokens as it is said in a line: "820 tokens", "4.2k tokens", "36k tokens". */
export function tokensSaid(count: number): string {
  if (count < 1000) return `${count} tokens`
  const thousands = count / 1000
  return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k tokens`
}

/**
 * What Claude is at where nothing it says or does shows it, in a line: thinking, and for
 * how long (and about how much, where that was asked for in the settings); or trying the
 * API again; or compacting the conversation, and for how long. Among steps, with a
 * picture as each of them has, so that the words stay where theirs are.
 */
export function Meanwhile({
  doing,
  among = false,
}: {
  doing: Doing
  among?: boolean
}) {
  const now = useNow(1000)
  const tokens = usePreferences((state) => state.thinkingTokens)
  const Icon =
    doing.kind === "thinking"
      ? BrainIcon
      : doing.kind === "compacting"
        ? FoldVerticalIcon
        : RotateCwIcon
  return (
    <>
      {among && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className={cn("shrink-0", LIVE)}>
        {doing.kind === "thinking"
          ? "Thinking"
          : doing.kind === "compacting"
            ? "Compacting"
            : "Retrying"}
      </span>
      <span className="min-w-0 truncate tabular-nums">
        {doing.kind === "thinking"
          ? [
              elapsed(now - doing.since),
              // (under a thousand it has hardly begun)
              tokens && doing.tokens ? `${doing.tokens / 1000}k tokens` : null,
            ]
              .filter(Boolean)
              .join(" ")
          : doing.kind === "compacting"
            ? elapsed(now - doing.since)
            : `attempt ${doing.attempt} of ${doing.of}`}
      </span>
    </>
  )
}

/**
 * What Claude did before it answered, as one line. While it is at it, the line is the
 * step it is on, or what it is at between them; afterwards, how long it was at them. It
 * opens into all of them, with what Claude said on the way between one and the next.
 * Drawn again only when one of them changes (see sameSteps), and not for every word
 * said after them.
 */
export const Steps = React.memo(
  function Steps({
    steps,
    took,
    working,
    doing = null,
  }: {
    steps: (Step | Aside)[]
    /** how long Claude was at them, in ms, if they are over and that is known */
    took: number | null
    /** Claude is still on the turn these are the latest of, and may add to them */
    working: boolean
    /** what Claude is at after them where nothing shows it, while it is working */
    doing?: Doing | null
  }) {
    const [open, setOpen] = React.useState(false)
    const whole = useKeptInView<HTMLDivElement>(open)
    const counting = usePreferences((state) => state.thinkingTokens)
    const taken = steps.filter((step) => step.kind === "tool")
    // what Claude wrote over them, its thinking with it, where it said (see ThreadItem)
    const tokens = taken.reduce((all, step) => all + (step.tokens ?? 0), 0)
    const current =
      taken.findLast((step) => step.state === "running") ?? taken.at(-1)
    if (!current) return null
    const busy = working || current.state === "running"
    const meanwhile = working ? doing : null

    // one step with no time to give is the whole of it: there is nothing to open, unless
    // something has taken its place in the line
    if (steps.length === 1 && !meanwhile && (busy || took === null))
      return (
        <div className={LINE}>
          <StepLine step={current} live={busy} />
        </div>
      )

    return (
      <Collapsible
        ref={whole}
        open={open}
        onOpenChange={setOpen}
        className="scroll-my-6"
      >
        <CollapsibleTrigger
          className={cn(
            LINE,
            "group/steps max-w-full rounded-md text-left outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          {busy && !open ? (
            <span className="flex min-w-0 items-center gap-2">
              {meanwhile ? (
                <Meanwhile doing={meanwhile} among />
              ) : (
                <StepLine step={current} live />
              )}
            </span>
          ) : busy || took === null ? (
            <span className={cn(busy && LIVE)}>
              {taken.length === 1 ? "1 step" : `${taken.length} steps`}
            </span>
          ) : (
            <span className="tabular-nums">
              Worked for {duration(took)}
              {counting && tokens > 0 && ` · ${tokensSaid(tokens)}`}
            </span>
          )}
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-60 transition-transform group-data-panel-open/steps:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <ol className="mt-1.5 ml-0.5 flex flex-col gap-1.5 border-l pl-3">
            {steps.map((step) =>
              step.kind === "tool" ? (
                <li key={step.id} className={LINE}>
                  <StepLine step={step} />
                </li>
              ) : (
                // said on the way: in full, since here is the one place it is kept,
                // and as words alone among the steps
                <li key={step.id}>
                  <Markdown className="gap-1.5 text-xs leading-5 text-muted-foreground">
                    {step.text}
                  </Markdown>
                </li>
              )
            )}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    )
  },
  (was, now) =>
    was.took === now.took &&
    was.working === now.working &&
    was.doing === now.doing &&
    sameSteps(was.steps, now.steps)
)
