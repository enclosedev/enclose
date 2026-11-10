// The newer versions there are, of the app and of the agents in use: told at the foot of
// the view in one pill, with a button that leaves them be for now and another that puts
// them in. One alone is told as itself; more than one together, with "Update all", which
// puts the agents in one after another while the app's own comes, and then starts the
// app again as that version.
import * as React from "react"

import type { Provider, ProviderId, Update } from "@shared/api"
import { Floating } from "@/components/floating"
import { ProviderIcon } from "@/components/icons"
import { Logo } from "@/components/mark"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDER_WORDS, updatable } from "@/lib/providers"
import { updateProvider, useStore } from "@/lib/store"

/**
 * The app's version left be: one not fetched, or one fetched and not started as (that,
 * "<version> ready"). Neither is offered here again: the settings still offer both.
 */
const APP_PASSED_KEY = "enclose:passed-app-update"
/** The agents' versions left be, by agent: each is not offered again, where it was. */
const AGENTS_PASSED_KEY = "enclose:passed-updates"

type Passed = {
  app: string | null
  agents: Partial<Record<ProviderId, string>>
}

function readPassed(): Passed {
  let app: string | null = null
  let agents: Passed["agents"] = {}
  try {
    app = localStorage.getItem(APP_PASSED_KEY)
    const kept: unknown = JSON.parse(
      localStorage.getItem(AGENTS_PASSED_KEY) ?? "{}"
    )
    if (kept && typeof kept === "object") agents = kept as Passed["agents"]
  } catch {
    // (none left be, then)
  }
  return { app, agents }
}

function keepPassed(passed: Passed) {
  try {
    if (passed.app !== null) localStorage.setItem(APP_PASSED_KEY, passed.app)
    localStorage.setItem(AGENTS_PASSED_KEY, JSON.stringify(passed.agents))
  } catch {
    // (left be until the app is opened again, then)
  }
}

/** What of the app's update there is to leave be, as it is kept once it is. */
function passing(update: Update): string | null {
  if (update.state === "available") return update.version
  if (update.state === "ready") return `${update.version} ready`
  return null
}

/** The agents with a newer version not left be. */
function offeredAgents(providers: Provider[], passed: Passed) {
  return providers.filter(
    (provider) =>
      updatable(provider) &&
      passed.agents[provider.id] !== provider.update?.version
  )
}

/** The app's update, where it is one on offer and not left be. */
function offeredApp(update: Update, passed: Passed) {
  const leaving = passing(update)
  return leaving !== null && leaving !== passed.app ? update : null
}

/** "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** Whether all is being put in, from "Update all": the pill says so until it is over. */
let allUnderway = false
const allListeners = new Set<() => void>()
function setAllUnderway(on: boolean) {
  allUnderway = on
  allListeners.forEach((listener) => listener())
}
function useAllUnderway() {
  return React.useSyncExternalStore(
    (listener) => {
      allListeners.add(listener)
      return () => allListeners.delete(listener)
    },
    () => allUnderway
  )
}

/** Until the app's update has come, or did not: whether it came. */
function fetched(): Promise<boolean> {
  return new Promise((resolve) => {
    const settled = (update: Update) =>
      update.state === "ready" || update.state === "restarting"
        ? true
        : update.state === "available" && update.failed
          ? false
          : update.state === "none"
            ? false
            : null
    const now = settled(useStore.getState().update)
    if (now !== null) return resolve(now)
    const stop = useStore.subscribe((state) => {
      const came = settled(state.update)
      if (came === null) return
      stop()
      resolve(came)
    })
  })
}

/**
 * Put in all that is on offer: the app's own version is fetched while the agents are
 * put in, one after another, and once both are over the app is started again as it
 * (which asks first, where an agent is in the middle of something). Each agent put in,
 * or tried, is not offered again, as with its own Update.
 */
async function updateAll(
  app: Update | null,
  agents: Provider[],
  pass: (id: ProviderId, version: string) => void
) {
  if (allUnderway) return
  setAllUnderway(true)
  window.cad.analytics.used("update-all")
  try {
    if (app?.state === "available") void window.cad.update.download()
    for (const agent of agents) {
      const version = agent.update?.version
      await updateProvider(agent.id).finally(() => {
        if (version) pass(agent.id, version)
      })
    }
    if (app && (await fetched())) await window.cad.update.restart()
  } finally {
    setAllUnderway(false)
  }
}

export function Updates() {
  const update = useStore((state) => state.update)
  const providers = useStore((state) => state.providers)
  const underway = useAllUnderway()
  const [passed, setPassed] = React.useState(readPassed)
  const passWith = (change: (was: Passed) => Passed) =>
    setPassed((was) => {
      const now = change(was)
      keepPassed(now)
      return now
    })
  const passAgent = (id: ProviderId, version: string) =>
    passWith((was) => ({ ...was, agents: { ...was.agents, [id]: version } }))

  const agents = offeredAgents(providers, passed)
  const app = offeredApp(update, passed)
  const updatingAgent = providers.find((provider) => provider.updating)
  const appBusy =
    update.state === "downloading" || update.state === "restarting"

  // something under way: what it is, with no buttons until it is over
  if (updatingAgent || appBusy || (underway && (app || agents.length > 0))) {
    const said = updatingAgent
      ? `Updating ${PROVIDER_WORDS[updatingAgent.id].cli}…`
      : update.state === "downloading"
        ? `Downloading Enclose ${update.version}… ${Math.round(update.fraction * 100)}%`
        : update.state === "restarting"
          ? "Restarting…"
          : "Updating…"
    return (
      <Pill>
        {updatingAgent ? (
          <ProviderIcon
            provider={updatingAgent.id}
            className="size-4 shrink-0"
          />
        ) : (
          <Logo size={18} className="shrink-0" />
        )}
        <span className="mr-1 truncate tabular-nums">{said}</span>
        <Spinner className="m-2 text-muted-foreground" />
      </Pill>
    )
  }

  const count = (app ? 1 : 0) + agents.length
  if (count === 0) return null

  const passAll = () =>
    passWith((was) => ({
      app: app ? passing(app) : was.app,
      agents: {
        ...was.agents,
        ...Object.fromEntries(
          agents.flatMap((agent) =>
            agent.update ? [[agent.id, agent.update.version]] : []
          )
        ),
      },
    }))

  // more than one: told together, and put in together
  if (count > 1) {
    const names = [
      ...(app ? ["Enclose"] : []),
      ...agents.map((agent) => PROVIDER_WORDS[agent.id].cli),
    ]
    const said = `New versions of ${listed(names)} are available`
    return (
      <Pill>
        <div className="flex shrink-0 items-center gap-1.5">
          {app && <Logo size={18} className="shrink-0" />}
          {agents.map((agent) => (
            <ProviderIcon
              key={agent.id}
              provider={agent.id}
              className="size-4 shrink-0"
            />
          ))}
        </div>
        <span className="mr-1 truncate" title={said}>
          {said}
        </span>
        <Choices
          onPass={passAll}
          action="Update all"
          onAction={() => void updateAll(app, agents, passAgent)}
        />
      </Pill>
    )
  }

  // the app's alone
  if (app && app.state !== "none") {
    return (
      <Pill>
        <Logo size={18} className="shrink-0" />
        <span className="mr-1 truncate tabular-nums">
          {app.state === "ready"
            ? `Enclose ${app.version} is ready`
            : app.state === "available" && app.failed
              ? `Enclose ${app.version} did not download`
              : "A new version of Enclose is available"}
        </span>
        <Choices
          onPass={passAll}
          action={
            app.state === "ready"
              ? "Restart"
              : app.state === "available" && app.failed
                ? "Try again"
                : "Update"
          }
          onAction={() =>
            void (app.state === "ready"
              ? window.cad.update.restart()
              : window.cad.update.download())
          }
        />
      </Pill>
    )
  }

  // an agent's alone
  const one = agents[0]
  const version = one.update?.version
  return (
    <Pill>
      <ProviderIcon provider={one.id} className="size-4 shrink-0" />
      <span className="mr-1 truncate">
        {/* which version, the settings say */}
        {`A new version of ${PROVIDER_WORDS[one.id].cli} is available`}
      </span>
      <Choices
        onPass={passAll}
        action="Update"
        title={one.update ? `Runs ${one.update.command}` : undefined}
        onAction={() => {
          if (!version) return
          void updateProvider(one.id).finally(() => passAgent(one.id, version))
        }}
      />
    </Pill>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Floating
      role="status"
      className="pointer-events-auto flex max-w-[calc(100%-2.5rem)] items-center gap-2.5 py-1.5 pr-1.5 pl-4"
    >
      {children}
    </Floating>
  )
}

function Choices({
  onPass,
  action,
  onAction,
  title,
}: {
  onPass: () => void
  action: string
  onAction: () => void
  title?: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="secondary"
        size="sm"
        className="rounded-full px-3.5"
        onClick={onPass}
      >
        Not now
      </Button>
      <Button
        size="sm"
        className="rounded-full px-3.5"
        title={title}
        onClick={onAction}
      >
        {action}
      </Button>
    </div>
  )
}
