import * as React from "react"
import { cn } from "cn"
import {
  ArrowRightIcon,
  PersonStandingIcon,
  PlusIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { OWN_SCENE, type PartRef, type Project } from "@shared/api"
import { AskForGuide, Assembly } from "@/components/assembly/assembly"
import { ToolsPanel } from "@/components/custom-tools/panel"
import { runTools, stopTools, useTools } from "@/lib/custom-tools/host"
import type { PartFact } from "@/lib/custom-tools/types"
import { Blueprint } from "@/components/blueprint/blueprint"
import { Floating } from "@/components/floating"
import { InspirationMode } from "@/components/inspiration/inspiration-mode"
import { LookingAtPictures, NotingHint } from "@/components/inspiration/looking"
import { NewerAgent } from "@/components/newer-agent"
import { TrustSettings } from "@/components/trust-settings"
import { Options } from "@/components/blueprint/options"
import { Logo } from "@/components/mark"
import { atWork } from "@/lib/steps"
import { duration, useNow } from "@/lib/time"
import { PartsPanel } from "@/components/parts-panel"
import { BoardAtWork } from "@/components/pcb/at-work"
import { BoardMode } from "@/components/pcb/board-mode"
import { BoardSteps } from "@/components/pcb/board-steps"
import { useBoards } from "@/components/pcb/boards"
import { BoardsPanel } from "@/components/pcb/boards-panel"
import { ReferencePanel } from "@/components/reference-panel"
import { Switch, Tools } from "@/components/tools"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Welcome } from "@/components/welcome"
import {
  arranged,
  grouped,
  LOOSE,
  NOT_ARRANGED,
  renamed,
  ungrouped,
  UNNAMED,
  untouched,
  type Named,
} from "@/lib/arrange"
import { lookFor, type Found } from "@/lib/find"
import { readModel } from "@/lib/model"
import { spaceTaken, spokenFor } from "@/lib/keys"
import { MAC } from "@/lib/platform"
import { notCalledOn, partsOf } from "@/lib/mentions"
import { VIEWS } from "@/lib/orient"
import { sceneFor, withFigure } from "@/lib/reference"
import {
  allOf,
  BOARD_AS,
  LAYER_KEYS,
  calledAs,
  calledScene,
  exploding,
  useStore,
  type Called,
  type Note,
  type Only,
  type Selection,
  type View,
} from "@/lib/store"
import { objectsOf, pieceWith, wholeOf } from "./apart"
import { ARRIVAL, newIn, type Arriving } from "./arriving"
import { AxisGizmo } from "./axis-gizmo"
import { bridge } from "./bridge"
import { BackingUp } from "@/components/backing-up"
import { ExplodeSlider } from "./explode-slider"
import {
  apartAsShown,
  disposeModel,
  eachAlone,
  loadModel,
  regrouped,
  standInModel,
  type LoadedModel,
} from "./load"
import { picturesOf } from "./pictures"
import { useLoadedReference, useReferenceScenes } from "./reference"
import { appearance, onShow, Scene } from "./scene"
import { Search } from "./search"
import { ShadingPie } from "./shading-pie"
import { useThumbnails } from "./thumbnails"
import { cutOpenThrough, sectionAcross, SectionPlanes } from "./section-planes"

/** Stable when a project has nothing said of its parts, or no colours given. */
const NO_NOTES: Note[] = []
const NO_COLOURS: Record<string, string> = {}
const NO_PARTS: string[] = []
const NOTHING_SHOWN: LoadedModel["parts"] = []
const NO_CALLED: Called[] = []
const NO_NAMES: Named = {}

/** The room kept, in pixels, between a part the camera goes to and the list of parts. */
const LIST_GAP = 12

/**
 * The parts that have been shown on their own and gone up to, with I, from what was
 * found by name or from the list of parts: none, if nothing has.
 */
function nearOf(only: Only | null, loaded: LoadedModel | null): string[] {
  return only?.near ? aloneOf(only, loaded) : NO_PARTS
}

/** The parts that are shown on their own, by id: none, if all of the model is shown. */
function aloneOf(only: Only | null, loaded: LoadedModel | null): string[] {
  if (!only) return NO_PARTS
  return only.kind === "parts"
    ? only.ids
    : only.kind === "part"
      ? [only.id]
      : only.kind === "group"
        ? (loaded?.model.parts ?? [])
            .filter((part) => part.group === only.id)
            .map((part) => part.id)
        : NO_PARTS
}

/** The parts picked out, by id: the several, or the one, or those of the one piece. */
function pickedOut(): string[] {
  const { several, selection } = useStore.getState()
  return several.length > 0
    ? several
    : selection
      ? allOf(selection.part)
      : NO_PARTS
}

/**
 * The box round these parts of the model, where they are with it pulled this far apart:
 * null, where it has none of them.
 */
function boxRound(loaded: LoadedModel | null, ids: string[], explode: number) {
  const boxes = (loaded?.parts ?? [])
    .filter((part) => ids.includes(part.part.id))
    .map((part) =>
      part.box
        .clone()
        .applyMatrix4(part.home)
        .translate(part.away.clone().multiplyScalar(explode))
    )
  return boxes.length > 0 ? boxes.reduce((all, box) => all.union(box)) : null
}

/**
 * Those of these parts that are on show: not put out of sight, by the user or by the
 * model's own tools. What is out of sight is nothing for the camera to go to or turn
 * about.
 */
function shownOf(ids: string[]): string[] {
  const hidden = new Set([
    ...useStore.getState().view.hidden,
    ...useTools.getState().looks.hidden,
  ])
  return ids.filter((id) => !hidden.has(id))
}

/**
 * The box round what is on show of the model, where it is with the model pulled this far
 * apart: null, where all of it is on show (or none of it).
 */
function boxOnShow(
  loaded: LoadedModel | null,
  shown: Pick<View, "only" | "hidden">,
  explode: number
) {
  const ids = (loaded?.parts ?? [])
    .filter((part) => onShow(part, shown))
    .map((part) => part.part.id)
  return ids.length === loaded?.parts.length
    ? null
    : boxRound(loaded, ids, explode)
}

/** How much of the view's right side the list of parts lies over, in pixels. */
function underList(): number {
  const list = document.querySelector<HTMLElement>("[data-parts-list]")
  const within = list?.offsetParent?.getBoundingClientRect()
  return list && within
    ? within.right - list.getBoundingClientRect().left + LIST_GAP
    : 0
}

/**
 * How much longer than their coming is shown what came is kept, ms: the light sets off
 * when the parts are first drawn, which can be a while after they came (see Arrival).
 */
const LATE = 1000

/**
 * What Claude has just made, to be shown coming (see arriving.ts): the parts a model
 * has, loaded again for what was done while Claude was at work in the project, that it
 * had none of when it was last looked at. Not the parts a model has as it is found when
 * its project is opened, nor those that taking a change back brings back, or turning to
 * another conversation: Claude made none of those just now. And nothing comes in a
 * window that is not there to be seen, put away or wholly under another: it waits until
 * the window is, and is then all that came meanwhile.
 *
 * `loading` is called as a model begins to be loaded, and what it gives back is told of
 * the model once it is, before it is shown: what came is known of by the time the model
 * is drawn, so that no part is seen before it is seen coming.
 */
function useArrivals(project: Project) {
  const atWork = project.conversations.some((c) => c.status !== "idle")
  const [came, setCame] = React.useState<{
    parts: string[]
    /** when, in ms, as `performance.now()` has it */
    at: number
  } | null>(null)
  const working = React.useRef(atWork)
  React.useEffect(() => {
    working.current = atWork
  }, [atWork])
  // the model as it is, the parts it had when it was last looked at, and whether any of
  // what it has been loaded for since then was Claude's doing
  const model = React.useRef<LoadedModel | null>(null)
  const had = React.useRef<Set<string> | null>(null)
  const claudes = React.useRef(false)

  const look = React.useCallback(() => {
    const now = model.current
    if (!now || document.hidden) return
    const was = had.current
    const made = claudes.current
    const ids = now.parts.map((part) => part.part.id)
    had.current = new Set(ids)
    claudes.current = false
    if (!was || !made || now.standIn) return
    const parts = newIn(was, ids)
    if (parts.length > 0) setCame({ parts, at: performance.now() })
  }, [])
  React.useEffect(() => {
    document.addEventListener("visibilitychange", look)
    return () => document.removeEventListener("visibilitychange", look)
  }, [look])

  const loading = React.useCallback(() => {
    // what is built while Claude is at work in the project is taken for what it built
    const made = working.current
    return (loaded: LoadedModel) => {
      model.current = loaded
      if (made) claudes.current = true
      look()
    }
  }, [look])
  const done = React.useCallback(() => setCame(null), [])
  return { came, loading, done }
}

/** A part as what a piece is made out from: see `listed`, in Model. */
type Listed = Parameters<typeof objectsOf<string>>[0][number]

const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/**
 * With parts picked out together, at the foot of the view: they are called on for the
 * message to Claude, where each shows as a chip, and the message is brought up to be
 * gone on with. It is there for as long as the message does not name them all, by a
 * chip or in its own words.
 *
 * What is picked out goes by the piece here too. A whole object among it is called on
 * as one thing, a chip of its own, and not as the many parts it is made of: the button
 * counts those as groups. The parts left over, picked out for themselves, go one by one.
 */
function AddToChat({
  listed,
  groups,
  projectId,
}: {
  listed: Listed[]
  groups: LoadedModel["model"]["groups"]
  projectId: string
}) {
  const several = useStore((s) => s.several)
  const sweeping = useStore((s) => s.sweep !== null)
  const draft = useStore((s) => s.drafts[projectId] ?? "")
  const called = useStore((s) => s.called[projectId] ?? NO_CALLED)
  const callOn = useStore((s) => s.callOn)
  const picked = React.useMemo(
    () => objectsOf(listed, groups, several),
    [listed, groups, several]
  )
  const fresh = (one: Called) => !called.some((other) => other.id === one.id)
  const objects = picked.objects.map(calledAs).filter(fresh)
  const unnamed = notCalledOn(draft, picked.loose)
  const parts = listed
    .filter((part) => unnamed.includes(part.id))
    .map((part): Called => ({ id: part.id, label: part.label }))
    .filter(fresh)
  if (objects.length + parts.length === 0 || sweeping) return null
  return (
    <Button
      className="pointer-events-auto animate-in gap-2 pl-5 shadow-md duration-150 fade-in slide-in-from-bottom-2 has-data-[icon=inline-end]:pr-4"
      onClick={() => callOn([...objects, ...parts])}
    >
      Add{" "}
      {[
        ...(objects.length > 0 ? [counted(objects.length, "group")] : []),
        ...(parts.length > 0 ? [counted(parts.length, "part")] : []),
      ].join(" and ")}{" "}
      to chat
      <PlusIcon data-icon="inline-end" />
    </Button>
  )
}

/**
 * With the model set in a reference scene, at the foot of the view: the scene is called
 * on for the message to Claude, which is then about the scene and not the model, and
 * the message is brought up to be gone on with. It is how it is found out that a scene
 * can be changed, or another made for the project: nobody is kept to the app's own. It
 * is there for as long as the message does not call on the scene already.
 */
function ImproveReference({
  sceneId,
  projectId,
}: {
  sceneId: string
  projectId: string
}) {
  const called = useStore((s) => s.called[projectId] ?? NO_CALLED)
  const sweeping = useStore((s) => s.sweep !== null)
  const callOn = useStore((s) => s.callOn)
  if (sweeping || called.some((one) => one.scene === sceneId)) return null
  return (
    <Button
      size="lg"
      className="pointer-events-auto animate-in gap-2 pr-4.5 pl-5 shadow-md duration-150 fade-in slide-in-from-bottom-2"
      onClick={() => callOn([calledScene(sceneId)])}
    >
      Improve reference scene in chat
      <ArrowRightIcon
        className="size-5"
        size={20}
        absoluteStrokeWidth
        strokeWidth={1.25}
      />
    </Button>
  )
}

/**
 * Beside that, at the foot of the view, for a scene that has the figure of a person to
 * show: the button that stands the figure in the scene, and takes it away again. A
 * person is the measure everyone has, and is more to look at than a desk: so it is
 * there when it is asked for, and stays asked for from one project to the next.
 */
function ShowFigure() {
  const figure = useStore((s) => s.figure)
  const setFigure = useStore((s) => s.setFigure)
  return (
    <div className="pointer-events-auto animate-in duration-150 fade-in slide-in-from-bottom-2">
      <Switch
        label="Person"
        side="top"
        on={figure}
        onChange={setFigure}
        // as tall as the button it stands beside
        className="size-10 shadow-md"
      >
        <PersonStandingIcon
          className="size-5"
          size={20}
          absoluteStrokeWidth
          strokeWidth={1.25}
        />
      </Switch>
    </div>
  )
}

/**
 * The parts Claude is at work on, by id: the ones the message it is answering is about.
 * None while it is not at work in the project.
 */
function useChanging(project: Project): string[] {
  const running = project.conversations.find((c) => c.status !== "idle")?.id
  const load = useStore((s) => s.load)
  // what was asked is there to be read, whether or not that conversation is looked at
  React.useEffect(() => {
    if (running) load(project.id, running)
  }, [project.id, running, load])
  // the same message for as long as the turn lasts, whatever else is said in it
  const asked = useStore((s) =>
    running
      ? s.items[running]?.findLast((item) => item.kind === "user")
      : undefined
  )
  return React.useMemo(
    () => (asked?.kind === "user" ? partsOf(asked) : NO_PARTS),
    [asked]
  )
}

/** How long the app's saying something stays at the foot of the view, ms. */
const SAID_FOR_MS = 3200
/** The keys that are only held, with another: pressed alone, nothing is done. */
const HELD = new Set(["Meta", "Control", "Shift", "Alt", "CapsLock"])

/**
 * At the foot of the view, for a moment: what the app has to say of something just done
 * that would otherwise go unsaid. What Cmd+Z took back, or why it could not.
 */
function Saying() {
  const saying = useStore((s) => s.saying)
  React.useEffect(() => {
    if (!saying) return
    const over = setTimeout(
      () =>
        useStore.setState((state) =>
          state.saying === saying ? { saying: null } : {}
        ),
      saying.ms ?? SAID_FOR_MS
    )
    return () => clearTimeout(over)
  }, [saying])
  if (!saying) return null
  return (
    <Floating
      key={saying.key}
      role="status"
      className="max-w-[min(34rem,calc(100%-22rem))] truncate px-5 py-2.5"
      title={saying.text}
    >
      {saying.text}
    </Floating>
  )
}

/** How big the square the mark stands in is while something is waited for, px. */
const MARK_SIZE = 40
/** How far across the ring round the mark is, px. */
const RING_SIZE = 80
/** How thick the line of the ring is, px: much what the lines of the mark in it are. */
const RING_WEIGHT = 1.25

/**
 * What is waited for, in the middle of the view while it has nothing else to show: the
 * mark, in a ring that fills from the top round as far as things have got; and under
 * them what is being done, and how far along it is. `progress` runs from 0 to 1, or is
 * null while there is no telling. The mark stands still: what is waited for keeps the
 * window too busy to turn it evenly, and a mark that turns in fits and starts looks
 * stuck. The ring says that things are moving.
 */
function Waiting({
  title,
  detail,
  progress,
  late,
}: {
  title: string
  detail: string
  progress: number | null
  /** not shown at once: what is waited for may be here before anyone could read this */
  late: boolean
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex animate-in flex-col items-center justify-center fill-mode-both select-none fade-in",
        late ? "delay-300 duration-300" : "duration-200"
      )}
    >
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          progress === null ? undefined : Math.round(progress * 100)
        }
        className="relative flex items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        {/* a circle is drawn from its right hand side round by the bottom: turned a
            quarter back, it fills from the top. While there is no telling how far
            things have got, a quarter of it goes round and round. */}
        <svg
          className={cn(
            "absolute inset-0 fill-none",
            progress === null
              ? "animate-[passing_1.3s_linear_infinite]"
              : "-rotate-90"
          )}
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          strokeWidth={RING_WEIGHT}
          aria-hidden
        >
          <circle
            className="stroke-foreground/10"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={(RING_SIZE - RING_WEIGHT) / 2}
          />
          <circle
            className="stroke-foreground transition-[stroke-dashoffset] duration-200 ease-out"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={(RING_SIZE - RING_WEIGHT) / 2}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={
              progress === null ? 0.75 : 1 - Math.max(0.02, progress)
            }
          />
        </svg>
        <Logo size={MARK_SIZE} />
      </div>
      <div className="mt-6 flex max-w-md flex-col items-center text-center text-xl/[1.3]">
        <div className="max-w-full truncate font-bold">{title}</div>
        <div className="text-foreground/45">{detail}</div>
      </div>
    </div>
  )
}

/**
 * At the foot of the view while Claude is at something the app asked of it, and not a
 * message: looking over the model of files just opened, or writing an assembly guide.
 * How long it has been at it, what it is at just now, as the conversation would say it,
 * and a way to have it leave off. `meanwhile` is what it says until Claude has done
 * anything to say.
 */
function AtWork({
  project,
  meanwhile,
}: {
  project: Project
  meanwhile: string
}) {
  const turn = project.conversations.find((c) => c.status !== "idle")
  const items = useStore((s) => (turn ? s.items[turn.id] : undefined))
  // Counted from when this came up, which is a moment before Claude is set to it; or
  // from when it was, if this is come back to with the turn already under way.
  const [shown] = React.useState(() => Date.now())
  const now = useNow(1000)
  const taken = now - Math.min(shown, turn?.since ?? Infinity)
  const doing = (items && atWork(items, turn?.doing)) ?? meanwhile
  return (
    <Floating className="pointer-events-auto flex items-center gap-3 py-2.5 pr-2.5 pl-6">
      {/* room for two figures and what they count in, so that the words beside it stay
          where they are as it goes up, in the figures everything else is set in */}
      <span className="min-w-[3ch] text-foreground/45">{duration(taken)}</span>
      {/* a light passes along it, as one does across the parts; and it is as wide as
          this whatever it says, so that the whole does not change size as it changes */}
      <span
        className="mr-2 w-52 shimmer truncate font-medium text-muted-foreground shimmer-color-foreground"
        title={doing}
      >
        {doing}
      </span>
      <Button
        size="icon-sm"
        className="shrink-0 bg-destructive text-white hover:bg-destructive/80"
        onClick={() => void window.cad.thread.stop(project.id)}
      >
        <SquareIcon className="size-3 fill-current" />
        <span className="sr-only">Stop</span>
      </Button>
    </Floating>
  )
}

/**
 * How much of bringing files in is making the model of them: the rest is the model being
 * loaded into the view, which is the quicker of the two.
 */
const MAKING = 0.8
/**
 * How big the cube that stands in for a model is seen, as a share of all the view takes
 * in: it is nothing yet, and is not to fill the view as a model does.
 */
const STAND_IN_SEEN = 0.55
/** The cube's one part, for the light to go across while the first model is made. */
const STAND_IN_PARTS = ["stand-in"]

type Loading =
  | { status: "loading"; done: number; total: number }
  | { status: "error"; message: string }
  | { status: "ready" }

/**
 * The project's model, loaded - or a cube standing in for it, while the project has none.
 * While a rebuilt model is coming in, the previous one stays on screen, so a rebuild swaps
 * the picture rather than blanking it.
 */
function useLoadedModel(
  project: Project,
  /**
   * Called as a model begins to be loaded: what it gives back is told of the model once
   * it is, before it is shown.
   */
  loading: () => (loaded: LoadedModel) => void
) {
  const blank = project.manifest === null
  // Files opened into it that are not a model yet. There is nothing of the project's to
  // show meanwhile, and a cube would be taken for what was opened.
  const coming = blank && project.bringingIn !== null
  const [loaded, setLoaded] = React.useState<LoadedModel | null>(null)
  const [state, setState] = React.useState<Loading>({
    status: "loading",
    done: 0,
    total: 0,
  })

  React.useEffect(() => {
    let cancelled = false
    const taken = loading()
    const run = async () => {
      if (!blank) setState({ status: "loading", done: 0, total: 0 })
      if (blank) {
        await Promise.resolve()
        if (cancelled) return
        const cube = coming ? null : standInModel()
        if (cube) taken(cube)
        setLoaded(cube)
        setState({ status: "ready" })
        return
      }
      const source = await window.cad.model.read(project.id)
      if (!source) throw new Error("The model's manifest could not be read.")
      const model = readModel(source.manifest)
      const next = await loadModel(
        model,
        source.baseUrl,
        project.revision,
        (done, total) => {
          if (!cancelled) setState({ status: "loading", done, total })
        }
      )
      if (cancelled) return disposeModel(next)
      taken(next)
      setLoaded(next)
      setState({ status: "ready" })
    }
    run().catch((error: unknown) => {
      if (!cancelled)
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        })
    })
    return () => {
      cancelled = true
    }
  }, [project.id, project.revision, blank, coming, loading])

  React.useEffect(
    () => () => {
      if (loaded) disposeModel(loaded)
    },
    [loaded]
  )

  return { loaded, state }
}

function Model({ project }: { project: Project }) {
  const arrivals = useArrivals(project)
  const { loaded: base, state } = useLoadedModel(project, arrivals.loading)
  // a model made of a mesh is offered to be built again as code, beside the conversation
  const setMeshes = useStore((s) => s.setMeshes)
  React.useEffect(() => {
    if (base && !base.standIn)
      setMeshes(
        project.id,
        base.model.parts.some((part) => part.mesh)
      )
  }, [base, project.id, setMeshes])
  // The model as the user has its parts in groups, where they have put them in others
  // than the model says, by hand (see lib/arrange): the same model, as it was loaded,
  // but for its groups and what follows from them.
  const arrangement = useStore((s) => s.arranged[project.id] ?? NOT_ARRANGED)
  const named = useStore((s) => s.named[project.id] ?? NO_NAMES)
  const inGroups = React.useMemo(() => {
    if (!base || base.standIn || untouched(arrangement)) return base
    const { groups, of } = arranged(base.model, arrangement, named)
    return regrouped(base, groups, of)
  }, [base, arrangement, named])
  // And, pulled apart with some of it out of sight, as what is on show comes apart by
  // itself (see apartAsShown): by the user, by the project's tools, or by the view being
  // cut down to a part or a group. What is looked for by name is looked for in all of the
  // model, which is all on show meanwhile, as the scene has it.
  const view = useStore((s) => s.view)
  const hiddenByTools = useTools((s) => s.looks.hidden)
  const looking = useStore((s) => s.finding !== null)
  // (by what is out of sight, and not by the lists of it, which are made afresh)
  const outOfSight = React.useMemo(
    () => [...new Set([...view.hidden, ...hiddenByTools])].sort().join("\n"),
    [view.hidden, hiddenByTools]
  )
  const { exploded, only: cutTo } = view
  const asShown = React.useMemo(() => {
    if (!inGroups || !exploded || looking || (outOfSight === "" && !cutTo))
      return inGroups
    const hidden = outOfSight === "" ? [] : outOfSight.split("\n")
    return apartAsShown(inGroups, (part) =>
      onShow(part, { hidden, only: cutTo })
    )
  }, [inGroups, exploded, looking, outOfSight, cutTo])
  // And as it comes apart: piece by piece, or, pulled apart a second time, part by part.
  const alone = useStore((s) => s.view.alone)
  const loaded = React.useMemo(
    () => (asShown && alone ? eachAlone(asShown) : asShown),
    [asShown, alone]
  )
  // The guides are not of what is on show: one goes by how all of the model comes apart.
  const guided = React.useMemo(
    () => (inGroups && alone ? eachAlone(inGroups) : inGroups),
    [inGroups, alone]
  )
  const setView = useStore((s) => s.setView)
  const selection = useStore((s) => s.selection)
  const several = useStore((s) => s.several)
  const sweep = useStore((s) => s.sweep)
  const hoveredId = useStore((s) => s.hoveredId)
  const seeking = useStore((s) => s.seeking)
  const finding = useStore((s) => s.finding)
  const plain = useStore((s) => s.plain)
  const hover = useStore((s) => s.hover)
  const homeRequests = useStore((s) => s.homeRequests)
  const partsOpen = useStore((s) => s.partsOpen)
  const notes = useStore((s) => s.notes[project.id] ?? NO_NOTES)
  const colours = useStore((s) => s.colours[project.id] ?? NO_COLOURS)
  const changing = useChanging(project)
  const lookOver = useStore((s) => s.lookOver)
  // (the pictures are of the parts, whatever groups they are in)
  useThumbnails(base, partsOpen, colours)
  const goHome = useStore((s) => s.goHome)
  const setThreadOpen = useStore((s) => s.setThreadOpen)

  // A project with nothing made in it opens with the conversation beside it: that is
  // where the first thing to do is. Put away, it stays away. (Files being made a model
  // of are not nothing: there is a model on its way, and nothing to say until it is here.)
  const blank = project.manifest === null
  const bringingIn = blank ? project.bringingIn : null
  const reading = bringingIn?.state === "working"
  React.useEffect(() => {
    if (blank && !reading) setThreadOpen(true)
  }, [blank, reading, setThreadOpen])
  // files were brought in while this was up: loading their model is the end of that
  const [brought, setBrought] = React.useState(false)
  if (reading && !brought) setBrought(true)

  // Files just opened are looked over by Claude as soon as their model is here to be
  // seen: it is shown pictures of the model, drawn for it, and names and groups the
  // parts. Until it is through, a light goes across every part, as across the ones it
  // is at work on at any other time.
  const real = loaded && !loaded.standIn ? loaded : null
  const lookingOver = real !== null && project.lookOver !== null
  const wanted = real !== null && project.lookOver === "wanted"
  React.useEffect(() => {
    if (!wanted || !real) return
    let over = false
    const given = useStore.getState().colours[project.id] ?? NO_COLOURS
    void picturesOf(real, given).then((seen) => {
      if (!over) void lookOver(project.id, seen)
    })
    return () => {
      over = true
    }
  }, [wanted, real, project.id, lookOver])
  const every = React.useMemo(
    () => real?.parts.map((part) => part.part.id) ?? NO_PARTS,
    [real]
  )
  // And while the first model is being made, the cube that stands in for it is looked
  // over the same way: the camera goes round it, and the light goes across it, until
  // the model takes its place.
  const makingFirst =
    loaded?.standIn === true &&
    project.conversations.some((c) => c.status === "working")

  // The model can be set in a reference scene: things of a known real size drawn round
  // it, a desk under it or a room about it, so that how big it is can be seen. Cmd+/
  // sets it in the scene that suits it, and again takes it back out; the list of scenes
  // picks another, which is then the one for the project. A project's own scene comes
  // before the app's. (There is none for the cube that stands in for a model.)
  const scenes = useReferenceScenes(project)
  const pickedScene = useStore((s) => s.sceneOf[project.id] ?? null)
  const referenceOpen = useStore((s) => s.referenceOpen)
  const suited = React.useMemo(() => {
    if (!real || !scenes) return null
    const { min, max } = real.box
    return sceneFor(
      scenes,
      {
        reference: real.model.reference,
        size: max.clone().sub(min).toArray(),
      },
      pickedScene
    )
  }, [real, scenes, pickedScene])
  const setIn = React.useMemo(
    () =>
      (real && scenes?.find((scene) => scene.id === view.reference)) || null,
    [real, scenes, view.reference]
  )
  const figure = useStore((s) => s.figure)
  const shownScene = React.useMemo(
    () => setIn && withFigure(setIn, figure),
    [setIn, figure]
  )
  const reference = useLoadedReference(shownScene)
  const toggleReference = React.useCallback(() => {
    const { view, setView } = useStore.getState()
    if (view.reference !== null) setView({ reference: null })
    else if (suited) setView({ reference: suited.id })
  }, [suited])
  // The scene it is set in is one there is. Where that one is gone, the project's own
  // having been taken away, it is set in the one that suits it instead.
  React.useEffect(() => {
    const { view, setView } = useStore.getState()
    if (!scenes || view.reference === null) return
    if (!scenes.some((scene) => scene.id === view.reference))
      setView({ reference: suited?.id ?? null })
  }, [scenes, suited])
  // A scene of the project's own that has just been written is the one for the project
  // from then on. It is shown at once where a scene was showing, or where it is Claude
  // that wrote it, at work in the project: what was asked for is there to be seen, by
  // the user and by Claude, which looks at the view to check what it made.
  const ownScene = scenes?.find((scene) => scene.own)?.files.join() ?? null
  const ownSeen = React.useRef<string | null | undefined>(undefined)
  // (a board being made in the background is Claude at work as well)
  const atWorkHere = project.conversations.some(
    (c) => c.status !== "idle" || c.job !== null
  )
  React.useEffect(() => {
    if (!scenes) return
    const was = ownSeen.current
    ownSeen.current = ownScene
    // (as it was found when the project was opened is not its having been written)
    if (was === undefined || ownScene === null || ownScene === was) return
    const { view, pickScene } = useStore.getState()
    if (atWorkHere || view.reference !== null) pickScene(OWN_SCENE)
  }, [scenes, ownScene, atWorkHere])
  // The project can have tools of its own, made for its model: controls that move it
  // and try it out, each a file in the project's folder (see lib/custom-tools). They
  // are at work on the model from when it opens (below), and stay at work with their
  // panel put away; brought up, they are left with Esc: the parts are then where the
  // model has them. They are started again when one of them is written, and when the
  // model is built.
  const toolsOpen = useStore((s) => s.toolsOpen)
  const hasTools = project.tools !== null
  const tooling = view.tools && real !== null && hasTools && !lookingOver
  React.useEffect(() => {
    if (!tooling || !real) return
    let over = false
    const of = `${project.id}:${project.tools}`
    const parts = real.parts.map((part): PartFact => {
      const box = part.box.clone().applyMatrix4(part.home)
      return {
        id: part.part.id,
        label: part.part.label,
        group: part.part.group,
        min: box.min.toArray(),
        max: box.max.toArray(),
      }
    })
    void window.cad.tools.read(project.id).then((sources) => {
      if (!over) runTools(project.id, of, sources, parts)
    })
    return () => {
      over = true
    }
  }, [tooling, real, project.id, project.tools])
  React.useEffect(() => {
    if (!tooling) stopTools()
  }, [tooling])
  React.useEffect(() => stopTools, [])
  // They are at work from when the project opens, as soon as its model is there, so
  // that what they put out of sight is out of sight from the first: by themselves,
  // and not let go of by an Esc meant for something else (see View's `toolsQuiet`).
  const toolsStarted = React.useRef(false)
  React.useEffect(() => {
    if (toolsStarted.current || !real || !hasTools || lookingOver) return
    toolsStarted.current = true
    const { view, setView } = useStore.getState()
    if (!view.tools) setView({ tools: true, toolsQuiet: true })
  }, [real, hasTools, lookingOver])
  // With the last of them taken away there is nothing to be at work, or to bring up.
  React.useEffect(() => {
    if (hasTools) return
    const { view, setView, setToolsOpen } = useStore.getState()
    setToolsOpen(false)
    if (view.tools) setView({ tools: false })
  }, [hasTools])
  // A tool that Claude has just written, at work in the project, is brought up: what
  // was asked for is there to be seen and tried.
  const toolsSeen = React.useRef<number | null | undefined>(undefined)
  React.useEffect(() => {
    const was = toolsSeen.current
    toolsSeen.current = project.tools
    // (as they were found when the project was opened is not their having been written)
    if (was === undefined || project.tools === null || project.tools === was)
      return
    if (atWorkHere) useStore.getState().setToolsOpen(true)
  }, [project.tools, atWorkHere])
  // How the tools have the parts look, apart from where they are: out of sight, or in
  // another of the app's colours.
  const toolLooks = useTools((s) => s.looks)
  const shownColours = React.useMemo(
    () =>
      Object.keys(toolLooks.colours).length > 0
        ? { ...colours, ...toolLooks.colours }
        : colours,
    [colours, toolLooks.colours]
  )
  const shownView = React.useMemo(
    () =>
      toolLooks.hidden.length > 0
        ? { ...view, hidden: [...view.hidden, ...toolLooks.hidden] }
        : view,
    [view, toolLooks.hidden]
  )
  // what the tools have out of sight, by which the camera knows to take in afresh what
  // is left on show when they change it
  const toolsHid = React.useMemo(
    () => [...toolLooks.hidden].sort().join("\n"),
    [toolLooks.hidden]
  )
  // A guide to putting the model together that Claude has just written, at work in the
  // project, is brought up with the rest of them: what was asked for is there to be
  // opened, wherever it was asked for.
  const guidesSeen = React.useRef<number | null | undefined>(undefined)
  React.useEffect(() => {
    const was = guidesSeen.current
    guidesSeen.current = project.assembly
    // (as they were found when the project was opened is not their having been written)
    if (
      was === undefined ||
      project.assembly === null ||
      project.assembly === was
    )
      return
    if (atWorkHere) useStore.getState().setView({ assembly: true })
  }, [project.assembly, atWorkHere])
  // The circuit boards that go in the thing, each designed with tscircuit and built by
  // Claude (see components/pcb). One picked from their list takes the view's place, in
  // PCB mode, until that is left with Esc or the button at the foot of the view. A
  // board that is taken away takes PCB mode with it.
  const boards = useBoards(project)
  const boardsOpen = useStore((s) => s.boardsOpen)
  const onBoard = React.useMemo(
    () => boards?.find((board) => board.id === view.board) ?? null,
    [boards, view.board]
  )
  // (how many layers of copper it has, for the keys that bring up each, which are
  // listened for once)
  const boardLayers = React.useRef(2)
  React.useEffect(() => {
    boardLayers.current = onBoard?.layers ?? 2
  }, [onBoard])
  React.useEffect(() => {
    const { view, setView } = useStore.getState()
    if (!boards || view.board === null) return
    if (!boards.some((one) => one.id === view.board)) setView({ board: null })
  }, [boards])
  // A board made in detail in the background, as was asked for, is opened in PCB mode
  // the first time it is built: what is made there is there to be watched, as each build
  // of it comes in. Once PCB mode is left it is not opened again while Claude is at work.
  // A board that Claude builds in a turn, on the way to the model it was asked about, is
  // not: the PCB button and the foot of the view say that it is at the board, and the
  // view stays on the model (see components/pcb/at-work.tsx).
  const boardsBuilt = React.useRef<Map<string, number | null> | null>(null)
  const openedInTurn = React.useRef(false)
  const madeInDetail = project.conversations
    .flatMap((c) => (c.job ? [c.job.board] : []))
    .join("\n")
  React.useEffect(() => {
    if (!boards) return
    const was = boardsBuilt.current
    boardsBuilt.current = new Map(boards.map((one) => [one.id, one.built]))
    if (!atWorkHere) {
      openedInTurn.current = false
      return
    }
    // (as they were found when the project was opened is not their having been built)
    if (!was || openedInTurn.current) return
    const inDetail = madeInDetail.split("\n")
    const built = boards.find(
      (one) =>
        inDetail.includes(one.id) &&
        one.built !== null &&
        one.built !== was.get(one.id)
    )
    if (!built) return
    openedInTurn.current = true
    const { view, setView } = useStore.getState()
    if (view.board === null) setView({ board: built.id })
  }, [boards, atWorkHere, madeInDetail])
  // Meanwhile the view is Claude's: the camera goes round the model by itself, and
  // nothing in the view answers the hand or the keys. When it is through, the camera
  // goes back to where a model opens, as Cmd+1 would take it.
  const looked = React.useRef(false)
  React.useEffect(() => {
    if (looked.current && !lookingOver) goHome()
    looked.current = lookingOver
  }, [lookingOver, goHome])

  // Parts and groups are looked for by name (Cmd+F): what goes by the name so far is lit
  // up in the view, through all the rest. There is nothing to look through in the cube
  // that stands in for a model, or while the view is Claude's, or is not the model's
  // but its guides'.
  const searched =
    lookingOver || view.assembly || view.inspiration ? null : real
  const finds = React.useMemo(
    () =>
      searched && finding !== null ? lookFor(searched.model, finding) : null,
    [searched, finding]
  )
  // What was found is shown on its own, and the camera brought to it, the way I does
  // with what is picked out: the one thing whose name was pressed, or all of it. That is
  // the end of looking. A part of it that had been put out of sight is back in sight.
  const showFound = React.useCallback((things: Found[]) => {
    const { view, setView, find } = useStore.getState()
    const ids = [...new Set(things.flatMap((thing) => thing.parts))]
    if (ids.length === 0) return
    const [one] = things
    setView({
      only:
        things.length === 1 && one.kind === "group"
          ? { kind: "group", id: one.id, near: true }
          : ids.length === 1
            ? { kind: "part", id: ids[0], near: true }
            : { kind: "parts", ids, near: true },
      ...(view.hidden.some((id) => ids.includes(id)) && {
        hidden: view.hidden.filter((id) => !ids.includes(id)),
      }),
    })
    find(null)
  }, [])
  const showOne = React.useCallback(
    (thing: Found) => showFound([thing]),
    [showFound]
  )

  // Nothing to see yet: how far along it is, in the middle of the view, from the files
  // being read to their model being loaded, as one thing. (A model built again comes in
  // behind the one on screen, and takes its place when it is all there: nothing is said
  // of that.)
  const loading = state.status === "loading" ? state : { done: 0, total: 0 }
  const waiting = loaded
    ? null
    : bringingIn?.state === "working"
      ? {
          title: `Importing ${project.name}`,
          detail: bringingIn.settingUp
            ? `${bringingIn.settingUp}, to read CAD files with. Only the first time.`
            : bringingIn.total
              ? `Preparing ${bringingIn.done} of ${bringingIn.total} parts`
              : "Reading the files",
          progress: bringingIn.total
            ? (MAKING * bringingIn.done) / bringingIn.total
            : null,
          late: false,
        }
      : // a model there is, and none of it here yet: it is loading, or about to
        !blank && state.status !== "error"
        ? {
            title: `${brought ? "Importing" : "Opening"} ${project.name}`,
            detail:
              loading.total > 0
                ? `Loading ${loading.done} of ${loading.total} parts`
                : "Loading the model",
            progress:
              (brought ? MAKING : 0) +
              ((brought ? 1 - MAKING : 1) * loading.done) /
                (loading.total || 1),
            late: !brought,
          }
        : null

  // What is on show of the model, where it stands with the model pulled apart as far as
  // it is, where some of it is out of sight: a cut chosen afresh goes through the middle
  // of it, the section's handle keeps to it, and so does a turn of the view that would
  // go about nothing on show. All of the model otherwise.
  const explode = view.exploded ? view.spread : 0
  const shownAt = React.useMemo(
    () =>
      boxOnShow(
        loaded,
        {
          only: cutTo,
          hidden: outOfSight === "" ? NO_PARTS : outOfSight.split("\n"),
        },
        explode
      ),
    [loaded, cutTo, outOfSight, explode]
  )
  const through = shownAt ?? loaded?.box ?? null
  const middle = React.useMemo(
    () => through?.getCenter(through.min.clone()).toArray() ?? null,
    [through]
  )
  React.useEffect(() => {
    bridge.shown = () => shownAt
    return () => {
      bridge.shown = null
    }
  }, [shownAt])

  // Picking parts out. A click picks one, at the place on it that was clicked, and what
  // can be done with that part is shown there. A box drawn across the view picks every
  // part it takes in, together, and so does a click with Shift held: it adds a part to
  // what is picked out, or takes back out one that was among it. Parts picked out
  // together are hinted at through whatever of the model is in front of them.
  //
  // A click and a box go by the piece: the parts of a group that are one object, a
  // circuit board with all that is on it, are picked out as one, the way they come
  // apart as one (see apart.ts). So a click on any of a piece picks out all of it, at
  // that place on it, and a box that takes in any of it takes all of it. Shift with a
  // click goes by the part, and is how the one part is got at: it picks out the part
  // itself, adds it to what is picked out, or takes it back out. So does a second
  // click, or a click with Cmd held, which pick out the part and nothing else.
  //
  // A second click works the other way about with Shift held. The first has gone by the
  // part, and the second, coming straight after it on the same spot, takes in the whole
  // of the piece the part is of: added to what is picked out, which is how one object is
  // picked out together with another.
  /** The parts, as what a piece is made out from. */
  const listed = React.useMemo(
    () =>
      (loaded?.parts ?? []).map(({ part, piece, box }) => ({
        id: part.id,
        label: part.label,
        group: part.group,
        piece,
        across: box.min.distanceTo(box.max),
      })),
    [loaded]
  )
  /** These parts and the rest of their pieces, in the order the model has them. */
  const whole = React.useCallback(
    (ids: string[]) => wholeOf(listed, ids),
    [listed]
  )
  /** A part as the piece it is of, where it is one of several in a piece. */
  const asPiece = React.useCallback(
    (part: PartRef): PartRef => {
      const piece = loaded && pieceWith(listed, loaded.model.groups, part.id)
      return piece ? { ...part, piece } : part
    },
    [loaded, listed]
  )
  /** These parts with what is picked out already, in the order the model has them. */
  const withPicked = React.useCallback(
    (ids: string[]) => {
      const had = pickedOut()
      return listed
        .map((part) => part.id)
        .filter((id) => had.includes(id) || ids.includes(id))
    },
    [listed]
  )
  const pick = React.useCallback(
    (selection: Selection | null, add: boolean, alone: boolean) => {
      const { select, selectSeveral, selection: was } = useStore.getState()
      if (!add)
        return select(
          selection && !alone
            ? { ...selection, part: asPiece(selection.part) }
            : selection
        )
      if (!selection) return
      const { id } = selection.part
      const had = pickedOut()
      // The second click of two: all of the part's piece is picked out, with whatever
      // else is. Where nothing else is, it is picked out as a click on it alone would.
      if (!alone) {
        const all = whole([id])
        if (had.every((other) => all.includes(other)))
          return select({ ...selection, part: asPiece(selection.part) })
        return selectSeveral(withPicked(all))
      }
      // With nothing picked out, the part is picked out as a click on it alone would:
      // and so is a part of the piece that is picked out, which is the part meant.
      if (had.length === 0 || (was?.part.piece && had.includes(id)))
        return select(selection)
      selectSeveral(
        had.includes(id)
          ? had.filter((other) => other !== id)
          : withPicked([id])
      )
    },
    [asPiece, whole, withPicked]
  )
  const sweepTo = React.useCallback(
    (ids: string[] | null, add: boolean) =>
      useStore
        .getState()
        .sweepOver(ids && (add ? withPicked(whole(ids)) : whole(ids))),
    [whole, withPicked]
  )
  const take = React.useCallback(
    (ids: string[], add: boolean) => {
      const { selectSeveral } = useStore.getState()
      const taken = whole(ids)
      if (!add) return selectSeveral(taken)
      const had = pickedOut()
      if (!taken.every((id) => had.includes(id)))
        selectSeveral(withPicked(taken))
    },
    [whole, withPicked]
  )
  const selectedWith = React.useMemo(
    () => (selection ? allOf(selection.part) : NO_PARTS),
    [selection]
  )
  // What a click would pick out is what lights up under the pointer: in the view, all
  // of a piece, or the part by itself while a key is held that a click would pick out
  // just the part with. A part pointed at in the list of parts is lit up alone.
  const [over, setOver] = React.useState<string | null>(null)
  const hoverOver = React.useCallback(
    (id: string | null, alone: boolean) => {
      setOver(alone ? null : id)
      hover(id)
    },
    [hover]
  )
  const hoveredWith = React.useMemo(
    () =>
      hoveredId === null
        ? NO_PARTS
        : hoveredId === over
          ? whole([hoveredId])
          : [hoveredId],
    [hoveredId, over, whole]
  )

  // Parts are put into groups by hand, over what the model says (see lib/arrange).
  // Cmd+G makes a group of what is picked out, or failing that of what is shown on its
  // own, as it is by being picked in the list of parts: the group is new, and goes to
  // the top of the list. Shift+Cmd+G takes the same parts out of the groups they are
  // in, to be in none. Either is taken back with Cmd+Z.
  const meant = React.useCallback((): string[] => {
    const picked = pickedOut()
    return picked.length > 0
      ? picked
      : aloneOf(useStore.getState().view.only, loaded)
  }, [loaded])
  const groupThem = React.useCallback(() => {
    if (!base || base.standIn) return
    const { model } = base
    const store = useStore.getState()
    const now = store.arranged[project.id] ?? NOT_ARRANGED
    const names = store.named[project.id] ?? NO_NAMES
    const ids = meant()
    if (ids.length === 0)
      return store.say("Pick out the parts to make a group of first")
    const id = `by-hand-${Date.now().toString(36)}`
    const next = grouped(model, now, ids, id)
    if (!next) return store.say("Those parts are a group already")
    // what each part was in, and what the other groups are called, are what Claude has
    // to go by in saying what this one is to be called
    const before = arranged(model, now, names)
    const after = arranged(model, next, names)
    const was = new Map(before.groups.map((group) => [group.id, group.label]))
    const parts = model.parts
      .filter((part) => after.of.get(part.id) === id)
      .map((part) => {
        const from = before.of.get(part.id)
        return {
          label: part.label,
          from: from && from !== LOOSE ? (was.get(from) ?? null) : null,
        }
      })
    store.rearrange(next, "a grouping")
    store.say(`Grouped ${counted(parts.length, "part")}`)
    store.setNaming(id, true)
    void window.cad.model
      .nameGroup(project.id, {
        title: model.title,
        parts,
        others: after.groups
          .filter((group) => group.id !== id && group.id !== LOOSE)
          .map((group) => group.label)
          .filter((label) => label !== UNNAMED),
      })
      .catch(() => null)
      .then((name) => {
        const { nameGroup, setNaming, partsOpen, say } = useStore.getState()
        setNaming(id, false)
        if (!name) return
        nameGroup(project.id, id, name)
        // with the list away there is nowhere the name shows: it is said
        if (!partsOpen) say(`Named the group "${name}"`)
      })
  }, [base, meant, project.id])
  const ungroupThem = React.useCallback(() => {
    if (!base || base.standIn) return
    const store = useStore.getState()
    const now = store.arranged[project.id] ?? NOT_ARRANGED
    const ids = meant()
    if (ids.length === 0)
      return store.say("Pick out the parts to ungroup first")
    const next = ungrouped(base.model, now, ids)
    if (!next) return store.say("Those parts are in no group")
    const places = arranged(base.model, now, NO_NAMES).of
    const out = ids.filter((id) => places.has(id) && places.get(id) !== LOOSE)
    store.rearrange(next, "an ungrouping")
    store.say(`Ungrouped ${counted(out.length, "part")}`)
  }, [base, meant, project.id])
  /** Call a group something else, as written by hand: or, with nothing written, what it went by. */
  const renameGroup = React.useCallback(
    (groupId: string, label: string) => {
      if (!base || base.standIn) return
      const store = useStore.getState()
      const next = renamed(
        base.model,
        store.arranged[project.id] ?? NOT_ARRANGED,
        store.named[project.id] ?? NO_NAMES,
        groupId,
        label
      )
      if (next) store.rearrange(next, "a renaming")
    },
    [base, project.id]
  )

  // Cmd+1 is the view the model opened with; Cmd+2 to 7 are the six flat ones. S cuts
  // the model open and E pulls it apart, both again to undo. B is the model's blueprint,
  // in place of the view of it, and again is the view back; A is its assembly guides,
  // likewise, and while they are up the other letters here wait. I shows what is picked
  // out, one part or several, on its own and close to, and again brings the rest back.
  // Space brings the camera to what is picked out and changes nothing else: the rest
  // stays on show, and the camera is not kept there. H is the other way about from I:
  // it puts what is picked out, one part or several, out of sight, and with nothing
  // picked out brings back all that was. P brings up the list of parts, and puts it
  // away. While the model is cut open, X and Y choose the axis the cut goes across (and
  // Z, which the shading menu passes on). Esc stops looking for parts by name, puts the
  // parts list away, and then gets out of the section, the explode, what was shown on
  // its own or what was put out of sight, whichever was gone into last. Shift+G rules
  // the ground and draws the world's axes, as it brings up the grid in Figma, and again
  // takes them away. (Cmd+F, which looks for parts by name, is listened for where the
  // name is typed: see Search.)
  //
  // Cmd+G makes a group of the parts picked out, and Shift+Cmd+G takes them out of
  // their groups (see above). Cmd+/ sets the model in the reference scene that suits
  // it, and again takes it back out. T brings up the project's own tools, where it has
  // some, and puts them away.
  //
  // Cmd+Z takes back the last thing done to the model, a colour given by hand, parts
  // put into groups another way or out of sight, or what Claude did in a turn (at a
  // second press), and with Shift puts it back. In a box that is written in it is
  // the writing's, as ever, for as long as there is any: with nothing written there,
  // which is how the message box is left by a message just sent, it is the model's.
  //
  // A first Cmd+Z that would take back a turn waits for the second: anything else done
  // meanwhile, a key or a click, lets it go. (Not Cmd or Shift by itself: the hand may
  // let go of Cmd between the two presses.)
  React.useEffect(() => {
    const other = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (HELD.has(event.key)) return
        const again =
          (MAC ? event.metaKey : event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "z"
        if (again) return
      }
      useStore.getState().letUndoGo()
    }
    window.addEventListener("keydown", other, true)
    window.addEventListener("pointerdown", other, true)
    return () => {
      window.removeEventListener("keydown", other, true)
      window.removeEventListener("pointerdown", other, true)
    }
  }, [])
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey || lookingOver) return
      if (useStore.getState().settingsOpen) return
      if (
        (MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        const on = event.target
        const written =
          on instanceof HTMLInputElement || on instanceof HTMLTextAreaElement
            ? on.value !== ""
            : spokenFor(on)
        if (written) return
        event.preventDefault()
        if (event.repeat) return
        const { undo, redo } = useStore.getState()
        void (event.shiftKey ? redo() : undo())
        return
      }
      if (
        (MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey) &&
        event.key.toLowerCase() === "g"
      ) {
        // there is nothing else the key does, wherever the typing is
        event.preventDefault()
        if (event.repeat) return
        if (event.shiftKey) ungroupThem()
        else groupThem()
        return
      }
      if (
        (MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey) &&
        event.key === "/"
      ) {
        // (on some keyboards it is typed with Shift held, and it is no other key's)
        event.preventDefault()
        if (event.repeat) return
        // the scene is the view's: a blueprint is of the model alone, and the guides,
        // a board and the inspiration board are no view of it
        const { blueprint, assembly, board, inspiration } =
          useStore.getState().view
        if (!blueprint && !assembly && board === null && !inspiration)
          toggleReference()
        return
      }
      if (event.shiftKey) {
        // the keys here that Shift goes with: and not a capital letter being typed
        const alone = !event.metaKey && !event.ctrlKey && !event.repeat
        if (!loaded || !alone || spokenFor(event.target)) return
        if (event.key.toLowerCase() === "i") {
          const { view, setView } = useStore.getState()
          setView({ inspiration: !view.inspiration })
          event.preventDefault()
          return
        }
        // (nothing else of the view's is over the inspiration board)
        if (useStore.getState().view.inspiration) return
        if (event.key.toLowerCase() === "p") {
          // the list of the project's circuit boards, which PCB mode is gone into from
          const { boardsOpen, setBoardsOpen } = useStore.getState()
          setBoardsOpen(!boardsOpen)
          event.preventDefault()
          return
        }
        if (event.key.toLowerCase() !== "g") return
        const { view, setView } = useStore.getState()
        // (the ground is the view's: there is none under a blueprint, the guides or a
        // board)
        if (view.blueprint || view.assembly || view.board !== null) return
        setView({ grid: !view.grid })
        event.preventDefault()
        return
      }
      if (event.metaKey || event.ctrlKey) {
        const digit = /^Digit([1-7])$/.exec(event.code)?.[1]
        if (!digit) return
        event.preventDefault()
        // the set views are the view's: a blueprint has a sheet for each of them, and
        // the guides none; a board has them in 3D, of its own camera, and the
        // inspiration board only the one that shows all of it, which it sees to itself
        const { blueprint, assembly, board, boardAs, inspiration } =
          useStore.getState().view
        if (blueprint || assembly || inspiration) return
        const view = VIEWS[Number(digit) - 2]
        if (board !== null) {
          if (boardAs !== "3d") return
          if (view) bridge.board?.lookFrom(view.axis, view.sign)
          else bridge.board?.home()
          return
        }
        if (view) bridge.lookFrom?.(view.axis, view.sign)
        else goHome()
        return
      }
      if (event.key === "Escape") {
        // not when the key is already closing something of its own: a menu, or what
        // is being written of a part
        const { writing, leave } = useStore.getState()
        const taken =
          event.defaultPrevented || writing !== null || spokenFor(event.target)
        if (!taken && leave()) event.preventDefault()
        return
      }
      if (!loaded || !middle || event.repeat || spokenFor(event.target)) return
      const { view, setView } = useStore.getState()
      const letter = event.key.toLowerCase()
      const layer =
        LAYER_KEYS.indexOf(letter as (typeof LAYER_KEYS)[number]) + 1
      if (view.board !== null && layer > 0) {
        // in PCB mode, the board's layers of copper, the top's first, each drawn as it
        // is made (which is brought up for it, where the board is being looked at
        // another way); a key for a layer the board has not got does nothing
        if (layer > boardLayers.current) return
        setView({ boardAs: "pcb", boardLayer: layer })
      } else if (letter === "b") {
        // there is no blueprint of the cube that stands in for a model
        if (loaded.standIn) return
        setView({ blueprint: !view.blueprint })
      } else if (letter === "a") {
        if (loaded.standIn) return
        setView({ assembly: !view.assembly })
      } else if (view.board !== null && /^[1-3]$/.test(letter)) {
        // in PCB mode, the ways the board is looked at, in the order of their buttons
        setView({ boardAs: BOARD_AS[Number(letter) - 1] })
      } else if (view.board !== null && letter === "p") {
        const { boardPartsOpen, setBoardPartsOpen } = useStore.getState()
        setBoardPartsOpen(!boardPartsOpen)
      } else if (view.assembly || view.board !== null || view.inspiration) {
        // every other key here is the view's, or the blueprint's: they wait until the
        // guides are put away, PCB mode is left, or the inspiration board
        return
      } else if (view.blueprint && "sxy".includes(letter)) {
        // the cut is the view's: a blueprint is of the model whole
        return
      } else if (letter === "s") {
        if (view.section) setView({ section: null })
        else if (through) cutOpenThrough(through)
      } else if (letter === "e") setView(exploding(view, loaded.further))
      else if (letter === "i") {
        const wanted = pickedOut()
        const near = nearOf(view.only, loaded)
        const there =
          wanted.length === near.length &&
          wanted.every((id) => near.includes(id))
        if (wanted.length > 0 && !there)
          setView({
            only:
              wanted.length > 1
                ? { kind: "parts", ids: wanted, near: true }
                : { kind: "part", id: wanted[0], near: true },
          })
        else if (near.length > 0) setView({ only: null })
        else return
      } else if (letter === "h") {
        // what is picked out goes out of sight, with whatever is out of sight already,
        // and is picked out no longer; with nothing picked out, all of it comes back.
        // Either is kept for Cmd+Z, which it is what a hand goes to after.
        const wanted = pickedOut()
        const { select, setHidden } = useStore.getState()
        if (wanted.length > 0) {
          select(null)
          setHidden([...new Set([...view.hidden, ...wanted])])
        } else if (view.hidden.length > 0) setHidden(NO_PARTS)
        else return
      } else if (letter === "p") {
        const { partsOpen, setPartsOpen } = useStore.getState()
        setPartsOpen(!partsOpen)
      } else if (letter === "t") {
        // the project's own tools, where it has some: they are the view's, as the
        // cut is, and wait under a blueprint
        if (!hasTools || loaded.standIn || view.blueprint) return
        const { toolsOpen, setToolsOpen } = useStore.getState()
        setToolsOpen(!toolsOpen)
      } else if (letter === " ") {
        // the camera is the view's: a blueprint has none to bring anywhere
        if (view.blueprint || spaceTaken(event)) return
        const box = boxRound(
          loaded,
          shownOf(pickedOut()),
          view.exploded ? view.spread : 0
        )
        if (!box) return
        bridge.goTo?.(box, underList())
      } else if (view.section && (letter === "x" || letter === "y"))
        setView({ section: sectionAcross(letter, middle) })
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [
    goHome,
    loaded,
    through,
    middle,
    lookingOver,
    groupThem,
    ungroupThem,
    toggleReference,
    hasTools,
  ])

  // The camera goes to what I shows on its own, one part or several together, and
  // follows it if it is pulled out from the rest; and goes back when that is no longer
  // what is shown. So it does to what is picked in the list of parts; and while the list
  // is up, lying over the right of the view, it is the middle of what the list leaves
  // of the view that the part goes to.
  const near = React.useMemo(
    () => nearOf(view.only, loaded),
    [view.only, loaded]
  )

  // The blueprint takes the view's place: the model drawn flat, from each of its sides
  // and from its corners, as much of it as the view had on show and pulled apart as far. The view is still
  // there behind it, as it was left, for Claude to be shown and to come back to.
  const blueprint = view.blueprint && real !== null && !lookingOver
  // And so do the model's assembly guides: their covers, to be opened and taken away.
  const assembly = view.assembly && real !== null && !lookingOver
  // And so does a board, in PCB mode: one of the circuit boards that go in the thing.
  const board = onBoard && loaded && !lookingOver ? onBoard : null
  // And so does the inspiration board: the pictures of what the thing should be like.
  // It is there before there is any model, the cube standing in for one.
  const inspiring = view.inspiration && loaded !== null && !lookingOver
  /** something other than the model has the view's place */
  const away = !!(blueprint || assembly || board || inspiring)
  // (what the project's tools have out of sight too)
  const { only, hidden } = shownView
  const drawn = React.useMemo(
    () =>
      real?.parts.filter((part) => onShow(part, { only, hidden })) ??
      NOTHING_SHOWN,
    [real, only, hidden]
  )

  React.useEffect(() => {
    bridge.focus?.(boxRound(loaded, near, explode), underList())
  }, [loaded, near, explode])

  // What Claude has just made is shown coming (see useArrivals): for a moment its parts
  // are light, where they stand, and then the camera goes to them, as Space takes it to
  // what is picked out. The first model a project has is all of it such parts; but that
  // is framed afresh as it is, and there is none of it to go to. The view is not the
  // model's under a blueprint, nor the user's while Claude looks a model over; and a
  // part that is not on show does not come into it.
  const { came, done: cameAndWent } = arrivals
  const coming = React.useMemo(() => {
    if (
      !came ||
      !loaded ||
      view.blueprint ||
      view.assembly ||
      view.board !== null ||
      view.inspiration ||
      lookingOver
    )
      return null
    const parts = loaded.parts
      .filter(
        (part) =>
          came.parts.includes(part.part.id) && onShow(part, { only, hidden })
      )
      .map((part) => part.part.id)
    const box = boxRound(loaded, parts, explode)
    if (!box) return null
    const arriving: Arriving = { parts, box, at: came.at }
    return { arriving, all: parts.length === loaded.parts.length }
  }, [
    came,
    loaded,
    view.blueprint,
    view.assembly,
    view.board,
    view.inspiration,
    lookingOver,
    only,
    hidden,
    explode,
  ])
  // For whoever has asked for less to move they are there, and the camera goes.
  const still = React.useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const comingNow = React.useRef(coming)
  React.useEffect(() => {
    comingNow.current = coming
  }, [coming])
  React.useEffect(() => {
    if (!came) return
    const go = setTimeout(
      () => {
        const now = comingNow.current
        if (now && !now.all) bridge.goTo?.(now.arriving.box, underList())
      },
      still ? 0 : ARRIVAL.shown
    )
    const over = setTimeout(cameAndWent, ARRIVAL.lasts + LATE)
    return () => {
      clearTimeout(go)
      clearTimeout(over)
    }
  }, [came, still, cameAndWent])

  // what the camera turns about, where it is to turn about what is picked out
  React.useEffect(() => {
    bridge.picked = () => boxRound(loaded, shownOf(pickedOut()), explode)
    return () => {
      bridge.picked = null
    }
  }, [loaded, explode])

  // Z is the shading menu's key. While the model is cut open a tap of it still chooses
  // the cut across Z, and the menu comes up when the key is held instead.
  const cut = view.section !== null
  const cutAcrossZ = React.useMemo(
    () =>
      cut && middle
        ? () => setView({ section: sectionAcross("z", middle) })
        : null,
    [cut, middle, setView]
  )

  // A rebuild can take away the part or the group that was picked out, which would
  // leave nothing showing: then everything shows again.
  React.useEffect(() => {
    const { only } = useStore.getState().view
    if (!loaded || !only) return
    const { parts, groups, keepouts } = loaded.model
    const there =
      only.kind === "part"
        ? parts.some((part) => part.id === only.id)
        : only.kind === "parts"
          ? parts.some((part) => only.ids.includes(part.id))
          : only.kind === "group"
            ? groups.some((group) => group.id === only.id) &&
              parts.some((part) => part.group === only.id)
            : keepouts.length > 0
    if (!there) setView({ only: null })
  }, [loaded, setView])
  // Nor is a part it takes away out of sight any longer: there is none to bring back.
  React.useEffect(() => {
    const { hidden } = useStore.getState().view
    if (!loaded || hidden.length === 0) return
    const still = hidden.filter((id) =>
      loaded.parts.some((part) => part.part.id === id)
    )
    if (still.length < hidden.length) setView({ hidden: still })
  }, [loaded, setView])
  // What is picked out is there to be seen. A part that was put out of sight and is
  // picked out again, by going back to what was said of it, is brought back.
  React.useEffect(() => {
    if (!selection) return
    const { hidden } = useStore.getState().view
    const picked = allOf(selection.part)
    if (hidden.some((id) => picked.includes(id)))
      setView({ hidden: hidden.filter((id) => !picked.includes(id)) })
  }, [selection, setView])
  // And of the parts picked out together, the ones it takes away are no longer.
  React.useEffect(() => {
    if (!loaded) return
    const { several, selectSeveral } = useStore.getState()
    const still = several.filter((id) =>
      loaded.parts.some((part) => part.part.id === id)
    )
    if (still.length < several.length) selectSeveral(still)
  }, [loaded])
  // A piece that is picked out is the piece as the model now has it: what it has gained
  // or lost, or come to be called, in a rebuild.
  React.useEffect(() => {
    const { selection } = useStore.getState()
    if (!loaded || !selection?.part.piece) return
    const { piece } = asPiece({ ...selection.part, piece: undefined })
    const was = selection.part.piece
    if (piece?.label === was.label && piece.parts.join() === was.parts.join())
      return
    // (not picked out afresh: what is being written of it is still being written)
    useStore.setState({
      selection: { ...selection, part: { ...selection.part, piece } },
    })
  }, [loaded, asPiece])

  // what Claude gets when it asks which parts are on screen
  React.useEffect(() => {
    if (!loaded) return
    const called = new Map(
      loaded.model.groups.map((group) => [group.id, group.label])
    )
    // where the model itself has each part, to tell which were moved by hand
    const own = new Map(
      (base?.model.parts ?? []).map((part) => [part.id, part.group])
    )
    bridge.parts = () =>
      loaded.parts.map((part) => {
        const box = part.box.clone().applyMatrix4(part.home)
        const round = (n: number) => Math.round(n * 100) / 100
        const { group } = part.part
        return {
          id: part.part.id,
          label: part.part.label,
          group,
          groupLabel: called.get(group) ?? group,
          ...(own.get(part.part.id) !== group && { byHand: true }),
          min: box.min.toArray().map(round),
          max: box.max.toArray().map(round),
          faces: part.faces,
          // the colour the user gave it in the app, or the model's own; null if neither
          color:
            useStore.getState().colours[project.id]?.[part.part.id] ??
            part.part.color,
          shown: appearance(part, useStore.getState().view).shown,
        }
      })
    return () => {
      bridge.parts = null
    }
  }, [loaded, base, project.id])

  // the section's handle was dragged in the view: the cut moves, the side shown stays
  const moveSection = React.useCallback(
    (moved: Parameters<React.ComponentProps<typeof Scene>["onSection"]>[0]) => {
      const { section } = useStore.getState().view
      if (section) setView({ section: { ...section, ...moved } })
    },
    [setView]
  )

  return (
    <>
      {loaded && (
        // (out of sight under a blueprint, the guides, a board or the inspiration
        // board, and none of it there to be pressed)
        <div className={cn("absolute inset-0", away && "invisible")}>
          <Scene
            loaded={loaded}
            covered={away}
            reference={reference}
            projectId={project.id}
            notes={notes}
            colours={shownColours}
            view={shownView}
            through={through ?? loaded.box}
            selectedId={selection?.part.id ?? null}
            selectedWith={selectedWith}
            several={several}
            // the stand-in is nothing Claude was asked to change
            // (a guide to the whole of it is of every part, as looking it over is)
            changing={
              loaded.standIn
                ? makingFirst
                  ? STAND_IN_PARTS
                  : NO_PARTS
                : lookingOver || (project.assembling && changing.length === 0)
                  ? every
                  : changing
            }
            arriving={still ? null : (coming?.arriving ?? null)}
            reading={lookingOver || makingFirst}
            small={loaded.standIn ? STAND_IN_SEEN : 1}
            sweep={sweep}
            hoveredId={hoveredId}
            hoveredWith={hoveredWith}
            seeking={seeking && !loaded.standIn}
            found={finds}
            plain={plain}
            // the first model made takes the cube's place, and is framed afresh
            homeKey={`${project.id}:${loaded.standIn ? "cube" : "model"}:${homeRequests}`}
            refit={toolsHid}
            // the stand-in is nothing to ask about: it is not picked, and does not light up
            onPick={loaded.standIn ? nothing : pick}
            onSweep={loaded.standIn ? nothing : sweepTo}
            onTake={loaded.standIn ? nothing : take}
            onHover={loaded.standIn ? nothing : hoverOver}
            onShow={showOne}
            onSection={moveSection}
          />
        </div>
      )}
      {blueprint && real && (
        <Blueprint
          loaded={real}
          parts={drawn}
          apart={explode}
          dimensions={view.dimensions}
          labels={view.labels}
          pieces={view.exploded && !view.alone && real.further}
          name={real.model.title ?? project.name}
        />
      )}
      {assembly && real && guided && (
        <Assembly project={project} loaded={guided} listed={listed} />
      )}
      {board && <BoardMode projectId={project.id} board={board} />}
      {inspiring && <InspirationMode projectId={project.id} />}

      {waiting && <Waiting {...waiting} />}
      {state.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <Alert variant="destructive" className="max-w-md">
            <TriangleAlertIcon />
            <AlertTitle>The model could not be shown</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      )}
      {bringingIn?.state === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          {bringingIn.why === "python" ? (
            <Alert className="max-w-md">
              <TriangleAlertIcon />
              <AlertTitle>Nothing to read the files with yet</AlertTitle>
              <AlertDescription>
                <p>
                  Enclose reads CAD files with Python and build123d, and could
                  not set them up: {bringingIn.detail}
                </p>
                <p>
                  The files are in the project: ask Claude to set it up, and it
                  will see to the rest.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" className="max-w-md">
              <TriangleAlertIcon />
              <AlertTitle>The files could not be made a model of</AlertTitle>
              <AlertDescription>
                <p>{bringingIn.detail}</p>
                <p>The files are in the project: ask Claude to look into it.</p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {searched && !board && !inspiring && (
        <Search finds={finds} onShow={showFound} />
      )}
      <Tools
        loaded={loaded}
        through={through}
        projectId={project.id}
        locked={lookingOver}
        hasTools={hasTools}
        board={board}
        boards={atWorkHere ? boards : null}
      />
      {loaded &&
        partsOpen &&
        !lookingOver &&
        !assembly &&
        !board &&
        !inspiring && (
          <PartsPanel
            loaded={loaded}
            projectId={project.id}
            onRename={renameGroup}
            // further in while the section's other buttons stand where it would be, and
            // no wider than leaves it room in the view
            className={cn(
              "absolute top-1/2 max-h-[80%] -translate-y-1/2 transition-[right]",
              view.section && !blueprint
                ? "right-36 max-w-[calc(100%-9.75rem)]"
                : "right-15 max-w-[calc(100%-4.5rem)]"
            )}
          />
        )}
      {real &&
        scenes &&
        referenceOpen &&
        !lookingOver &&
        !blueprint &&
        !assembly &&
        !inspiring && (
          <ReferencePanel
            scenes={scenes}
            shown={view.reference}
            // where the list of parts goes, which is never up with it: a little
            // further from the buttons, and further in while the section's other
            // buttons stand where it would be
            className={cn(
              "absolute top-1/2 max-h-[80%] -translate-y-1/2 transition-[right]",
              view.section ? "right-38.5" : "right-17.5"
            )}
          />
        )}
      {real &&
        hasTools &&
        toolsOpen &&
        !lookingOver &&
        !blueprint &&
        !assembly &&
        !inspiring && (
          <ToolsPanel
            projectId={project.id}
            // where the list of parts goes, which is never up with it
            className={cn(
              "absolute top-1/2 max-h-[80%] -translate-y-1/2 transition-[right]",
              view.section
                ? "right-36 max-w-[calc(100%-9.75rem)]"
                : "right-15 max-w-[calc(100%-4.5rem)]"
            )}
          />
        )}
      {loaded && boards && boardsOpen && !lookingOver && !inspiring && (
        <BoardsPanel
          projectId={project.id}
          boards={boards}
          // where the list of reference scenes goes, which is never up with it
          className={cn(
            "absolute top-1/2 max-h-[80%] -translate-y-1/2 transition-[right]",
            view.section && !blueprint && !assembly
              ? "right-38.5"
              : "right-17.5"
          )}
        />
      )}
      {/* at the foot of the view, in the middle: what the app has to tell, and what to
          do with the parts picked out together and with the scene the model is set in,
          over how far apart the parts are pulled. Each is a pill floating over the model;
          a newer agent, a folder's settings to trust, and what was just done, are told
          with no model there as well */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-2.5">
        <NewerAgent />
        <TrustSettings project={project} />
        <BackingUp />
        {loaded ? (
          <>
            {lookingOver && (
              <AtWork project={project} meanwhile="Understanding the model" />
            )}
            {project.assembling && !lookingOver && (
              <AtWork
                project={project}
                // (short enough to be said whole: the words have only so much room)
                meanwhile="Working out the steps"
              />
            )}
            {atWorkHere && boards && !board && (
              <BoardAtWork projectId={project.id} boards={boards} />
            )}
            {inspiring && (
              <>
                <LookingAtPictures projectId={project.id} />
                <NotingHint projectId={project.id} />
              </>
            )}
            <Saying />
            {!assembly && !board && !inspiring && (
              <AddToChat
                listed={listed}
                groups={loaded.model.groups}
                projectId={project.id}
              />
            )}
            {reference && !away && !lookingOver && (
              <div className="flex items-center gap-2">
                {reference.scene.figures.length > 0 && <ShowFigure />}
                <ImproveReference
                  sceneId={reference.scene.id}
                  projectId={project.id}
                />
              </div>
            )}
            {/* how far apart the parts are pulled: which a blueprint has beside its own
              bar, with the rest of how its sheets show the model; and for a board, the
              steps it is made in, while an agent makes it */}
            {inspiring ? null : board ? (
              <BoardSteps projectId={project.id} board={board} />
            ) : blueprint ? (
              <Options further={loaded.further} />
            ) : assembly ? (
              <AskForGuide
                project={project}
                listed={listed}
                groups={loaded.model.groups}
              />
            ) : (
              view.exploded && <ExplodeSlider further={loaded.further} />
            )}
          </>
        ) : (
          <Saying />
        )}
      </div>
      {loaded && middle && !lookingOver && !away && (
        <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1">
          <SectionPlanes middle={middle} />
          <AxisGizmo />
        </div>
      )}
      <ShadingPie
        enabled={loaded !== null && !lookingOver && !away}
        tap={cutAcrossZ}
      />
    </>
  )
}

const nothing = () => {}

/** The middle of the window: the open project's model, or what to do about not having one. */
export function Viewport({ project }: { project: Project | null }) {
  if (!project) return <Welcome />
  // keyed by project, so one project's model never lingers under another's name
  return <Model key={project.id} project={project} />
}
