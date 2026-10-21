import * as React from "react"
import { cn } from "cn"
import {
  ArrowUpIcon,
  BoxesIcon,
  ChevronDownIcon,
  CircleGaugeIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  PaperclipIcon,
  PencilIcon,
  QuoteIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import type {
  Access,
  Attached,
  ConversationSummary,
  Effort,
  Provider,
  ProviderId,
} from "@shared/api"
import { BoardIcon, ProviderIcon, ReferenceIcon } from "@/components/icons"
import { MentionMenu, type Choice } from "@/components/mention-menu"
import { Thumb } from "@/components/picture"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ACCESS_WORDS,
  chosenEffort,
  chosenModel,
  EFFORT_WORDS,
} from "@/lib/manner"
import { useInspiration } from "@/lib/inspiration"
import { matching, putIn, tokenAt } from "@/lib/mentions"
import { isPicture } from "@/lib/pictures"
import { inLine } from "@/lib/quotes"
import {
  answering,
  barred,
  offeredModels,
  PROVIDER_WORDS,
} from "@/lib/providers"
import {
  askCommands,
  askModels,
  goesBy,
  useActiveProject,
  useStack,
  useStore,
  type Called,
  type Note,
  type Quoted,
} from "@/lib/store"
import { useNow } from "@/lib/time"
import {
  atPictures,
  cutOut,
  pictureMark,
  pictureName,
  PICTURE_TYPES,
} from "@shared/pictures"
import { inspirationUrl } from "@shared/inspiration-format"
import { useBoards } from "./pcb/boards"
import { bridge } from "./viewport/bridge"

/**
 * The line under a message sits a little lower than the round button beside it, which is
 * taller: as far from the bottom of the box, near enough, as it is from its side.
 */
const LOW = "translate-y-1"

/** How far the box is from the side of the window. */
const BOX_INSET = 14

const MODEL_TITLE = "Which model answers"
const effortTitle = (name: string) => `How hard ${name} thinks`
const accessTitle = (name: string) => `What ${name} may do without asking`

/**
 * One of the three choices, where they are made: what it is set to, and an arrow to the
 * others. The three sit side by side as one box, a line between each two.
 */
const CHOICE =
  "flex h-14.5 flex-auto cursor-pointer items-center gap-2.5 border-l pr-4.5 pl-5 text-sm font-semibold whitespace-nowrap outline-none transition-colors first-of-type:border-l-0 hover:bg-foreground/5 focus-visible:bg-foreground/5 data-popup-open:bg-foreground/5 [&>svg]:size-3.5 [&>svg]:shrink-0"

/** The arrow of a choice: bigger than its picture and drawn lighter, being less of a shape. */
function Arrow() {
  return (
    <ChevronDownIcon className="size-5.5! stroke-[1.5] text-muted-foreground" />
  )
}

/**
 * What one of a list's choices says: what it is called and, under that, what it comes
 * to. Both in the same letters, the name in the heavier of them.
 */
function Words({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-medium">{name}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
    </div>
  )
}

/** Which of an agent's models answers. */
function ModelChoice({ provider }: { provider: Provider }) {
  const models = offeredModels(provider)
  const picked = useStore((state) => state.model[provider.id])
  const setModel = useStore((state) => state.setModel)
  const chosen = chosenModel(models, picked)
  const { name, cli } = PROVIDER_WORDS[provider.id]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={CHOICE} title={MODEL_TITLE}>
        {chosen?.short ?? name}
        <Arrow />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="thin-icons max-h-[min(22rem,var(--available-height))] w-max max-w-[min(26rem,var(--available-width))]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{MODEL_TITLE}</DropdownMenuLabel>
          {models.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {cli} has not said what models it has.
            </p>
          )}
          <DropdownMenuRadioGroup
            value={chosen?.id ?? ""}
            onValueChange={(value) =>
              setModel(provider.id, value === "" ? null : value)
            }
          >
            {models.map((model) => (
              <DropdownMenuRadioItem
                key={model.id ?? ""}
                value={model.id ?? ""}
                closeOnClick
              >
                <Words name={model.name} detail={model.detail} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** How hard the model thinks, for a model that can be told. */
function EffortChoice({ provider }: { provider: Provider }) {
  const model = chosenModel(
    offeredModels(provider),
    useStore((state) => state.model[provider.id])
  )
  const picked = useStore((state) => state.effort[provider.id])
  const setEffort = useStore((state) => state.setEffort)
  if (!model || model.efforts.length === 0) return null
  const effort = chosenEffort(model, picked)
  const { name, cli } = PROVIDER_WORDS[provider.id]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={CHOICE} title={effortTitle(name)}>
        <CircleGaugeIcon />
        {effort ? EFFORT_WORDS[effort] : "Default"}
        <Arrow />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="thin-icons w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{effortTitle(name)}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={effort ?? ""}
            onValueChange={(value) =>
              setEffort(provider.id, value === "" ? null : (value as Effort))
            }
          >
            <DropdownMenuRadioItem value="" closeOnClick>
              <Words name="Default" detail={`As ${cli} is set`} />
            </DropdownMenuRadioItem>
            {model.efforts.map((level) => (
              <DropdownMenuRadioItem key={level} value={level} closeOnClick>
                <Words name={EFFORT_WORDS[level]} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ACCESS_ICON: Record<Access, LucideIcon> = {
  supervised: LockKeyholeIcon,
  edits: PencilIcon,
  auto: SparklesIcon,
  full: LockKeyholeOpenIcon,
}

/** What the agent may do without asking. */
function AccessChoice({ provider }: { provider: Provider }) {
  const access = useStore((state) => state.access)
  const setAccess = useStore((state) => state.setAccess)
  const Icon = ACCESS_ICON[access]
  const title = accessTitle(PROVIDER_WORDS[provider.id].name)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={CHOICE} title={title}>
        <Icon />
        {ACCESS_WORDS[access].label}
        <Arrow />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="thin-icons w-max max-w-(--available-width)"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={access}
            onValueChange={(value) => setAccess(value as Access)}
          >
            {(Object.keys(ACCESS_WORDS) as Access[]).map((key) => {
              const ItemIcon = ACCESS_ICON[key]
              return (
                <DropdownMenuRadioItem key={key} value={key} closeOnClick>
                  <ItemIcon size={16} absoluteStrokeWidth strokeWidth={1} />
                  <Words
                    name={ACCESS_WORDS[key].label}
                    detail={ACCESS_WORDS[key].detail}
                  />
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * How the next message will be answered, said in one line under it: by which model,
 * thinking how hard, asking how much. The line is a button: it opens onto the three
 * choices, under the makers whose models there are to choose from. A conversation under
 * way is carried on by the agent it began with, so there another's begin a new one.
 */
function Manner({
  conversation,
}: {
  conversation: ConversationSummary | null
}) {
  const providers = useStore((state) => state.providers)
  const picked = useStore((state) => state.provider)
  const setProvider = useStore((state) => state.setProvider)
  const project = useActiveProject()
  const openConversation = useStore((state) => state.openConversation)
  const id = answering(providers, picked, conversation)
  const provider = providers.find((one) => one.id === id)
  const { name } = PROVIDER_WORDS[id]
  const model = chosenModel(
    offeredModels(provider),
    useStore((state) => state.model[id])
  )
  const effort = chosenEffort(
    model,
    useStore((state) => state.effort[id])
  )
  const access = useStore((state) => state.access)
  const said = [
    model?.short ?? name,
    ...(model && model.efforts.length > 0
      ? [effort ? EFFORT_WORDS[effort] : "Default effort"]
      : []),
    ACCESS_WORDS[access].label,
  ].join(", ")
  return (
    <Popover
      onOpenChange={(open) => {
        // the agent may not have said when the app started: it is asked again
        if (open) void askModels(id)
      }}
    >
      <PopoverTrigger
        render={
          <InputGroupButton
            // what it opens is in plain sight over it: it is drawn no differently for
            // being open
            className={`min-w-0 shrink gap-1.5 text-xs font-normal ${LOW} aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-muted/50 aria-expanded:hover:text-foreground [&>svg]:size-3!`}
          />
        }
      >
        <ProviderIcon provider={id} className="shrink-0" />
        <span className="truncate">Using {said}</span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={12}
        collisionAvoidance={{ side: "flip", align: "shift" }}
        collisionPadding={BOX_INSET}
        className="thin-icons w-auto gap-0 p-1.5 ring-foreground/8"
      >
        <Tabs
          value={id}
          onValueChange={(value) => {
            setProvider(value as ProviderId)
            // this one stays with the agent it began with: another answers a new one,
            // which begins from the model as it is
            if (conversation && project) openConversation(project.id, null)
          }}
          className="gap-1.75"
        >
          <TabsList
            variant="line"
            className="h-11.5! w-full justify-start gap-0 border-b p-0"
          >
            {providers.map((one) => {
              const why = one.id === id ? null : barred(one)
              const called = PROVIDER_WORDS[one.id].name
              const says =
                why ??
                (conversation && one.id !== id
                  ? `New conversation with ${called}`
                  : called)
              return (
                // (a tab that cannot be picked hears nothing of the pointer: it is what
                // it stands in that says why)
                <span key={one.id} title={says} className="flex h-full">
                  <TabsTrigger
                    value={one.id}
                    disabled={why !== null}
                    className="h-full w-11.5 flex-none p-0 after:-bottom-px! after:h-px! aria-disabled:grayscale"
                  >
                    <ProviderIcon provider={one.id} className="size-6" />
                    <span className="sr-only">{says}</span>
                  </TabsTrigger>
                </span>
              )
            })}
          </TabsList>
          {provider && (
            <TabsContent
              value={id}
              className="flex overflow-hidden rounded-[0.75rem] border bg-foreground/6"
            >
              <ModelChoice provider={provider} />
              <EffortChoice provider={provider} />
              <AccessChoice provider={provider} />
            </TabsContent>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}

/** The cross on a chip, which takes it back off the message. */
const OFF =
  "shrink-0 cursor-pointer rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground"

/**
 * A chip on the message box: a part called on from the view, what was said of one, or
 * words picked out of the conversation with what was said of them.
 */
type Chip = { called: Called } | { note: Note } | { quote: Quoted }
const of = (chip: Chip) =>
  "called" in chip ? chip.called : "note" in chip ? chip.note : chip.quote

/**
 * What is waiting to go with the next message: the parts called on from the view, and
 * what has been said of parts. A chip for each, in one row that scrolls sideways when
 * there are more than fit, so that however many there are the box is no taller for
 * them. The last put there comes first, whichever it is, where it is in sight. A part
 * called on is a chip of its name, and so is a whole object, which is one chip however
 * many parts it is made of. The reference scene the model is set in is a chip too, and
 * with it on the box the message is about the scene. What was said of a part is a chip
 * that says which part and how it begins; pressed, it opens that again beside the part.
 * Words picked out of the conversation are a chip of how they begin, and of what was said
 * of them; pressed, it opens that again over the chip. And in PCB mode the circuit board
 * on screen is a chip, first, for as long as it is on screen: the message is about it.
 */
function Waiting({
  called,
  notes,
  quotes,
  board,
}: {
  called: Called[]
  notes: Note[]
  quotes: Quoted[]
  /** what the board on screen is called, in PCB mode */
  board: string | null
}) {
  const write = useStore((state) => state.write)
  const writeBoard = useStore((state) => state.writeBoard)
  const dropNote = useStore((state) => state.dropNote)
  const dropCalled = useStore((state) => state.dropCalled)
  const quote = useStore((state) => state.quote)
  const dropQuote = useStore((state) => state.dropQuote)
  const writing = useStore((state) => state.writing)
  const quoting = useStore((state) => state.quoting?.id ?? null)
  const noted = useStore((state) => state.noted)
  // (those called on together stay as they were given, and any kept from before chips
  // had a time come after the rest, as they were)
  const chips = React.useMemo(
    () =>
      [
        ...called.map((part): Chip => ({ called: part })),
        ...notes.map((note): Chip => ({ note })),
        ...quotes.map((one): Chip => ({ quote: one })),
      ].sort((a, b) => (of(b).at ?? 0) - (of(a).at ?? 0)),
    [called, notes, quotes]
  )
  const row = React.useRef<HTMLDivElement>(null)
  const first = chips.length > 0 ? of(chips[0]).id : null
  React.useEffect(() => {
    row.current?.scrollTo({ left: 0 })
  }, [first])
  return (
    <InputGroupAddon align="block-start" className="pb-0">
      <div
        ref={row}
        className="flex min-w-0 [scrollbar-width:none] gap-1.5 overflow-x-auto"
      >
        {/* (nothing to take it off with: it goes with PCB mode) */}
        {board && (
          <Badge
            variant="secondary"
            title="This message is about the circuit board on screen"
            className="h-6 max-w-44 shrink-0 gap-1"
          >
            <BoardIcon className="shrink-0" />
            <span className="truncate">{board}</span>
          </Badge>
        )}
        {chips.map((chip) => {
          if ("called" in chip) {
            const part = chip.called
            return (
              <Badge
                key={part.id}
                data-called={part.id}
                variant="secondary"
                title={
                  part.scene
                    ? "This message is about the reference scene, not the model"
                    : part.parts
                      ? `The whole of it: ${part.parts.length} parts`
                      : `@${part.id}`
                }
                className="h-6 max-w-44 shrink-0 gap-1 pr-1"
              >
                {part.parts && <BoxesIcon className="shrink-0" />}
                {part.scene && <ReferenceIcon className="shrink-0" />}
                <span className="truncate">{part.label}</span>
                <button
                  type="button"
                  onClick={() => dropCalled(part.id)}
                  aria-label={`Leave ${part.label} out of the message`}
                  className={OFF}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            )
          }
          if ("quote" in chip) {
            const one = chip.quote
            const words = inLine(one.quote)
            return (
              <Badge
                key={one.id}
                data-quote={one.id}
                variant="secondary"
                className={cn(
                  "h-6 max-w-52 shrink-0 gap-1 pr-1",
                  quoting === one.id && "ring-1 ring-foreground/30",
                  noted === one.id && "just-noted"
                )}
              >
                <button
                  type="button"
                  title={one.quote}
                  onClick={() => quote({ id: one.id })}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 outline-none"
                >
                  <QuoteIcon className="size-3 shrink-0" />
                  <span
                    className={cn("truncate", one.text && "max-w-20 shrink-0")}
                  >
                    {words}
                  </span>
                  {one.text && (
                    <span className="truncate font-normal text-muted-foreground">
                      {one.text}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => dropQuote(one.id)}
                  aria-label="Take back what was quoted"
                  className={OFF}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            )
          }
          const { note } = chip
          return (
            <Badge
              key={note.id}
              data-note={note.id}
              variant="secondary"
              className={cn(
                "h-6 max-w-52 shrink-0 gap-1 pr-1",
                writing === note.id && "ring-1 ring-foreground/30",
                noted === note.id && "just-noted"
              )}
            >
              <button
                type="button"
                title="Change what was said"
                onClick={() =>
                  note.part.board ? writeBoard(note.id) : write(note.id)
                }
                className="flex min-w-0 cursor-pointer items-center gap-1.5 outline-none"
              >
                <span className="shrink-0">{goesBy(note.part)}</span>
                <span className="truncate font-normal text-muted-foreground">
                  {note.text}
                </span>
              </button>
              <button
                type="button"
                onClick={() => dropNote(note.id)}
                aria-label={`Take back what was said of ${goesBy(note.part)}`}
                className={OFF}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          )
        })}
      </div>
    </InputGroupAddon>
  )
}

/**
 * The pictures waiting to go with the next message, over what is written: each small,
 * in one row that scrolls sideways when there are more than fit. Pressed, one is shown
 * big; its cross takes it back off the message. With more than one, each says which it
 * is, as what is written speaks of it.
 */
function Pictures({
  projectId,
  pictures,
  trouble,
}: {
  projectId: string
  pictures: Attached[]
  trouble: string | null
}) {
  const dropPicture = useStore((state) => state.dropPicture)
  return (
    <InputGroupAddon align="block-start" className="flex-col items-start pb-0">
      {pictures.length > 0 && (
        <div className="flex max-w-full min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto">
          {pictures.map((picture) => (
            <div
              key={picture.id}
              data-picture={picture.number}
              className="relative shrink-0"
            >
              <Thumb
                projectId={projectId}
                picture={picture}
                className="block size-14 rounded-lg ring-1 ring-foreground/10"
              />
              {pictures.length > 1 && (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded-sm bg-background/85 px-1 text-[0.625rem] leading-3.5 font-medium text-foreground tabular-nums">
                  {picture.number}
                </span>
              )}
              <button
                type="button"
                onClick={() => dropPicture(picture.id)}
                aria-label={`Leave ${pictureName(picture.number)} out of the message`}
                className="absolute top-1 right-1 flex size-4.5 cursor-pointer items-center justify-center rounded-full bg-background/85 text-foreground outline-none hover:bg-background focus-visible:bg-background"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {trouble && (
        <span className="text-xs font-normal text-muted-foreground">
          {trouble}
        </span>
      )}
    </InputGroupAddon>
  )
}

/**
 * Where a picture's mark stands in what is being written, drawn round as a chip is. It
 * lies under the box, which is see-through, and holds the same words in the same
 * letters: so each mark's ground falls behind the mark, and the words are the box's own.
 */
function Marks({
  text,
  numbers,
  box,
}: {
  text: string
  numbers: number[]
  box: React.RefObject<HTMLTextAreaElement | null>
}) {
  const under = React.useRef<HTMLDivElement>(null)
  // as wide as the box has room to write in, and moved up as far as it has been
  const follow = React.useCallback(() => {
    const at = box.current
    const it = under.current
    if (!at || !it) return
    it.style.right = `${at.offsetWidth - at.clientWidth}px`
    it.scrollTop = at.scrollTop
  }, [box])
  React.useLayoutEffect(follow, [follow, text])
  React.useEffect(() => {
    const at = box.current
    if (!at) return
    at.addEventListener("scroll", follow)
    const sized = new ResizeObserver(follow)
    sized.observe(at)
    return () => {
      at.removeEventListener("scroll", follow)
      sized.disconnect()
    }
  }, [box, follow])
  return (
    <div
      ref={under}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden px-3 pt-3 pb-2 text-base wrap-break-word whitespace-pre-wrap text-transparent md:text-sm"
    >
      {atPictures(text, numbers).map((piece) =>
        piece.picture === null ? (
          piece.text
        ) : (
          <span
            key={piece.from}
            data-mark={piece.picture}
            className="rounded-[0.3rem] bg-foreground/10 ring-2 ring-foreground/10"
          >
            {piece.text}
          </span>
        )
      )}
      {/* a last line with nothing on it is still a line */}
      {text.endsWith("\n") && " "}
    </div>
  )
}

/** Stable when a project has nothing said of its parts, and none of them called on. */
const NO_NOTES: Note[] = []
const NO_QUOTES: Quoted[] = []
const NO_CALLED: Called[] = []
const NO_PICTURES: Attached[] = []
const NO_CHOICES: Choice[] = []
/** What a picture of the inspiration board's goes by in the list: never a part's id. */
const PICTURE_CHOICE = "inspiration:"

/** How many times the message box has taken the typing for being asked to. */
let answered = 0

/** The parts of the model on screen, as what @ can name: each by its id, shown by its label. */
function partChoices(): Choice[] {
  const parts = (bridge.parts?.() ?? []) as { id: string; label: string }[]
  return parts.map((part) => ({
    name: part.id,
    also: part.label,
    detail: `@${part.id}`,
  }))
}

/**
 * Where a message to Claude is written, with what has been said of parts to go with it.
 * It looks after itself: the conversation above it coming in word by word is not
 * reason enough to draw it again.
 */
export const Composer = React.memo(function Composer({
  placeholder,
  autoFocus,
}: {
  placeholder: string
  autoFocus?: boolean
}) {
  const project = useActiveProject()
  const { open } = useStack(project, useNow(60_000))
  const send = useStore((state) => state.send)
  const text = useStore((state) =>
    project ? (state.drafts[project.id] ?? "") : ""
  )
  const setText = useStore((state) => state.setDraft)
  const notes = useStore((state) =>
    project ? (state.notes[project.id] ?? NO_NOTES) : NO_NOTES
  )
  const quotes = useStore((state) =>
    project ? (state.quotes[project.id] ?? NO_QUOTES) : NO_QUOTES
  )
  const called = useStore((state) =>
    project ? (state.called[project.id] ?? NO_CALLED) : NO_CALLED
  )
  const pictures = useStore((state) =>
    project ? (state.pictures[project.id] ?? NO_PICTURES) : NO_PICTURES
  )
  const pictureTrouble = useStore((state) => state.pictureTrouble)
  const boards = useBoards(project)
  const onScreen = useStore((state) => state.view.board)
  const board = boards?.find((one) => one.id === onScreen)?.name ?? null
  const attach = useStore((state) => state.attach)
  const dropPicture = useStore((state) => state.dropPicture)
  // whether it is being written in, which is when a name being written is looked for
  const [within, setWithin] = React.useState(false)

  // A name being written - a part's after @, a skill's after $, a command's after / -
  // brings up what it could be, over the box. Esc puts the list away for that name.
  const box = React.useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = React.useState(0)
  const [shut, setShut] = React.useState<string | null>(null)
  // Skills and commands are Claude Code's: what Codex and Grok have of their own is not
  // listed yet, so with them a $ or a / is only something written.
  const answers = answering(
    useStore((state) => state.providers),
    useStore((state) => state.provider),
    open
  )
  const found = within ? tokenAt(text, caret) : null
  const token =
    found && (found.kind === "part" || answers === "claude") ? found : null
  const naming = token ? `${token.kind}:${token.from}` : null
  if (shut !== null && shut !== naming) setShut(null)
  const calling = token !== null && naming !== shut ? token : null
  const kind = calling?.kind ?? null
  const projectId = project?.id ?? null
  const has = useStore((state) =>
    projectId ? state.commands[projectId] : undefined
  )
  // what Claude Code has is asked for when the box opens on a project, and again when
  // one of its names is begun, should it have changed since
  const ofClaude = kind === "skill" || kind === "command"
  React.useEffect(() => {
    if (projectId) void askCommands(projectId)
  }, [projectId, ofClaude])
  // the parts are what is on screen when the name is begun
  const parts = React.useMemo(
    () => (kind === "part" ? partChoices() : NO_CHOICES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, naming, project?.revision]
  )
  // and before them the pictures of the project's inspiration board, the newest first,
  // to be put in what is written as a picture pasted there is (see `paste`)
  const inspiration = useInspiration((state) =>
    projectId ? state.boards[projectId] : undefined
  )
  React.useEffect(() => {
    if (projectId && kind === "part")
      void useInspiration.getState().load(projectId)
  }, [projectId, kind])
  const boardPictures = React.useMemo(
    () =>
      kind === "part" && projectId && inspiration
        ? [...inspiration.images]
            .sort((a, b) => b.added - a.added)
            .map((image) => ({
              name: `${PICTURE_CHOICE}${image.id}`,
              also: image.name,
              detail: "",
              picture: inspirationUrl(projectId, image.file),
            }))
        : NO_CHOICES,
    [kind, projectId, inspiration]
  )
  const all: Choice[] =
    kind === "part"
      ? parts
      : kind === "skill"
        ? (has?.skills ?? NO_CHOICES)
        : kind === "command"
          ? (has?.commands ?? NO_CHOICES)
          : NO_CHOICES
  const query = calling?.query ?? ""
  const offered = React.useMemo(
    () => [...matching(boardPictures, query), ...matching(all, query)],
    [boardPictures, all, query]
  )
  // the keys start at the top of the list each time what is written changes
  const [chosen, setChosen] = React.useState({ of: "", index: 0 })
  const written = `${naming}:${query}`
  const active =
    chosen.of === written ? Math.min(chosen.index, offered.length - 1) : 0
  const move = (index: number) => setChosen({ of: written, index })

  // the caret goes after a name that was put in, once the box holds it
  const caretTo = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    if (caretTo.current === null) return
    box.current?.setSelectionRange(caretTo.current, caretTo.current)
    caretTo.current = null
  }, [text])
  const pick = (choice: Choice) => {
    if (!calling) return
    if (choice.picture) return void pickPicture(choice.picture, choice.also)
    const put = putIn(text, calling, choice.name)
    caretTo.current = put.caret
    setText(put.text)
    setCaret(put.caret)
  }
  const follow = (at: HTMLTextAreaElement) => setCaret(at.selectionStart)

  // A picture that is pasted goes on the message, and its mark goes into what is being
  // written, where the caret is: so that the words can say which picture they mean.
  const numbers = React.useMemo(
    () => pictures.map((picture) => picture.number),
    [pictures]
  )
  const paste = async (files: File[]) => {
    const added = await attach(files)
    const at = box.current
    if (added.length === 0 || !at) return
    // (what is written may have been written on while the pictures were made ready)
    const now = at.value
    const before = now.slice(0, at.selectionStart)
    const after = now.slice(at.selectionEnd)
    const marks =
      (before === "" || /\s$/.test(before) ? "" : " ") +
      added.map((picture) => pictureMark(picture.number)).join(" ") +
      // (a full stop or a comma after it is the sentence's, and stays up against it)
      (/^(\s|[,.;:!?)])/.test(after) ? "" : " ")
    caretTo.current = before.length + marks.length
    setText(before + marks + after)
    setCaret(caretTo.current)
  }
  // A picture of the inspiration board's, chosen after @, takes the place of what was
  // written for it: as if it had been pasted there.
  const pickPicture = async (url: string, name = "image") => {
    if (!calling) return
    caretTo.current = calling.from
    setText(text.slice(0, calling.from) + text.slice(calling.to))
    setCaret(calling.from)
    const blob = await fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .catch(() => null)
    if (!blob)
      return useStore.setState({
        pictureTrouble: "That image could not be read.",
      })
    await paste([new File([blob], name, { type: blob.type })])
  }
  // The mark of a picture is one thing: the key that would take its last letter takes
  // all of it, and the picture with it. Whether it did.
  const unmark = (at: HTMLTextAreaElement, key: string) => {
    if (at.selectionStart !== at.selectionEnd) return false
    const piece = atPictures(text, numbers).find(
      (one) =>
        one.picture !== null &&
        (key === "Backspace"
          ? one.from + one.text.length === at.selectionStart
          : one.from === at.selectionStart)
    )
    const picture = pictures.find((one) => one.number === piece?.picture)
    if (!piece || !picture) return false
    const cut = cutOut(text, piece.from, piece.text.length)
    caretTo.current = cut.caret
    setText(cut.text)
    setCaret(cut.caret)
    dropPicture(picture.id)
    return true
  }
  React.useEffect(() => {
    if (!pictureTrouble) return
    const timer = setTimeout(
      () => useStore.setState({ pictureTrouble: null }),
      6000
    )
    return () => clearTimeout(timer)
  }, [pictureTrouble])
  const picker = React.useRef<HTMLInputElement>(null)
  // a note just made shimmers on the box for as long as the light takes to go across
  // it its three times (.just-noted), and is then a chip like the others
  const noted = useStore((state) => state.noted)
  React.useEffect(() => {
    if (!noted) return
    const timer = setTimeout(() => useStore.setState({ noted: null }), 2400)
    return () => clearTimeout(timer)
  }, [noted])

  // Parts called on from the view go on the box as chips, for the user to say what of
  // them: the box takes the typing. It may only now be on show, having been asked before.
  const asked = useStore((state) => state.writeRequests)
  React.useEffect(() => {
    const at = box.current
    if (asked === answered || !at) return
    answered = asked
    at.focus()
    at.setSelectionRange(at.value.length, at.value.length)
    setCaret(at.value.length)
  }, [asked])

  // The part the keys are on lights up in the view, as it does under the pointer; and
  // for as long as a part is being named, the view shows it through all the others.
  const hover = useStore((state) => state.hover)
  const seek = useStore((state) => state.seek)
  const seeking = kind === "part"
  const lit =
    seeking && !offered[active]?.picture
      ? (offered[active]?.name ?? null)
      : null
  React.useEffect(() => {
    if (!seeking) return
    seek(true)
    return () => seek(false)
  }, [seeking, seek])
  React.useEffect(() => {
    if (lit === null) return
    hover(lit)
    return () => hover(null)
  }, [lit, hover])
  // one thing at a time is done in a project's folder: Claude is at work in the
  // conversation this writes to, which can be stopped, and where what is said meanwhile
  // waits its turn; or in another of the project's
  const running = project?.conversations.find((c) => c.status !== "idle")
  const busy = running !== undefined && running.id === open?.id
  const elsewhere = running !== undefined && !busy

  const something =
    text.trim() !== "" ||
    notes.length > 0 ||
    quotes.length > 0 ||
    called.length > 0 ||
    pictures.length > 0
  const submit = () => {
    if (project && !elsewhere && something) send()
  }

  return (
    // being written in does not change how the box is drawn: the caret says where the
    // typing goes
    <InputGroup
      className="has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0"
      onFocus={() => setWithin(true)}
      onBlur={(event) => {
        // one of its own choices being made, in the list that opens for it, is not leaving
        const next = event.relatedTarget as Element | null
        const stays =
          next !== null &&
          (event.currentTarget.contains(next) ||
            next.closest("[role=menu], [role=dialog]") !== null)
        if (!stays) setWithin(false)
      }}
    >
      {calling && (
        <MentionMenu
          kind={calling.kind}
          choices={offered}
          any={all.length > 0}
          asking={ofClaude && has === undefined}
          active={active}
          onActive={move}
          onPick={pick}
        />
      )}
      {project && (pictures.length > 0 || pictureTrouble) && (
        <Pictures
          projectId={project.id}
          pictures={pictures}
          trouble={pictureTrouble}
        />
      )}
      {(called.length > 0 ||
        notes.length > 0 ||
        quotes.length > 0 ||
        board) && (
        <Waiting called={called} notes={notes} quotes={quotes} board={board} />
      )}
      <div className="relative w-full">
        {pictures.length > 0 && (
          <Marks text={text} numbers={numbers} box={box} />
        )}
        <InputGroupTextarea
          value={text}
          ref={box}
          onPaste={(event) => {
            const data = event.clipboardData
            const files = [...data.files].filter(isPicture)
            // Words copied with a picture of them (a table's cells) are pasted as words.
            // A file copied where files are kept has its name for words: that is a picture.
            const words = data.getData("text/plain") !== ""
            const kept = files.some((file) => window.cad.projects.pathOf(file))
            if (!project || files.length === 0 || (words && !kept)) return
            event.preventDefault()
            void paste(files)
          }}
          onChange={(event) => {
            setText(event.target.value)
            follow(event.target)
          }}
          onSelect={(event) => follow(event.currentTarget)}
          onKeyDown={(event) => {
            if (
              (event.key === "Backspace" || event.key === "Delete") &&
              pictures.length > 0 &&
              !event.nativeEvent.isComposing &&
              unmark(event.currentTarget, event.key)
            ) {
              event.preventDefault()
              return
            }
            if (calling && !event.nativeEvent.isComposing) {
              if (event.key === "Escape") {
                event.preventDefault()
                setShut(naming)
                return
              }
              const step =
                event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
              if (step !== 0 && offered.length > 0) {
                event.preventDefault()
                move((active + step + offered.length) % offered.length)
                return
              }
              const takes =
                (event.key === "Enter" && !event.shiftKey) ||
                event.key === "Tab"
              if (takes && offered.length > 0) {
                event.preventDefault()
                pick(offered[active])
                return
              }
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={1}
          // A little more room over the words than the box gives, to match what is under
          // the words of the line below. The box is one size, written in or not, until
          // what is written needs more; and what it suggests keeps to one line, however
          // long it is, so that the first letter written does not change the size either.
          className="relative max-h-48 min-h-14 pt-3 placeholder-shown:overflow-hidden placeholder-shown:whitespace-nowrap"
        />
      </div>
      <InputGroupAddon
        align="block-end"
        // the line has room of its own around its words, which the round button has
        // not: that is kept as far from the side as it is from the bottom
        className="gap-1 pr-3 pl-1.5"
      >
        <Manner conversation={open ?? null} />
        <input
          ref={picker}
          type="file"
          accept={Object.keys(PICTURE_TYPES).join(",") + ",image/*"}
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])].filter(isPicture)
            // (the same file can be picked again, having been taken off)
            event.target.value = ""
            void attach(files, true)
          }}
        />
        <InputGroupButton
          size="icon-xs"
          title="Attach an image"
          className="ml-auto shrink-0"
          disabled={!project}
          onClick={() => picker.current?.click()}
        >
          <PaperclipIcon />
          <span className="sr-only">Attach an image</span>
        </InputGroupButton>
        {/* Claude at work here can be stopped: with nothing written, that is all there
            is to do, and it is where sending would be */}
        {busy && project && (
          <InputGroupButton
            variant="default"
            size="icon-xs"
            title="Stop"
            className="shrink-0 bg-destructive text-white hover:bg-destructive/80"
            onClick={() => void window.cad.thread.stop(project.id)}
          >
            <SquareIcon className="size-2.5 fill-current" />
            <span className="sr-only">Stop</span>
          </InputGroupButton>
        )}
        {(!busy || something) && (
          <InputGroupButton
            variant="default"
            size="icon-xs"
            title={busy ? "Queue" : undefined}
            className="shrink-0"
            disabled={!project || !something || elsewhere}
            onClick={submit}
          >
            <ArrowUpIcon />
            <span className="sr-only">{busy ? "Queue" : "Send"}</span>
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
})
