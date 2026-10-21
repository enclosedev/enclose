import * as React from "react"
import { cn } from "cn"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  HistoryIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import type {
  EnvVar,
  ModelChoice,
  Provider,
  ProviderId,
  ProviderSettings,
} from "@shared/api"
import { ProviderIcon, StarIcon } from "@/components/icons"
import { Row } from "@/components/setting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  listedModels,
  PROVIDER_WORDS,
  standing,
  trouble,
  updatable,
  usable,
  type Standing,
} from "@/lib/providers"
import {
  changeProvider,
  checkProviders,
  updateProvider,
  useStore,
} from "@/lib/store"
import { ago, useNow } from "@/lib/time"

/**
 * Where each keeps its settings and its sign-in, for the ones that can be told to keep
 * them elsewhere: by the variable it reads that from, which is what it is known as.
 */
const HOME: Partial<
  Record<ProviderId, { title: string; placeholder: string }>
> = {
  claude: { title: "CLAUDE_CONFIG_DIR path", placeholder: "~/.claude" },
  codex: { title: "CODEX_HOME path", placeholder: "~/.codex" },
}

/** What more one might be started with, for the box that asks. */
const ARGS: Partial<Record<ProviderId, string>> = { claude: "e.g. --chrome" }

/** What is typed for a machine to read: a path, a name as a program has it. */
const TYPED = "font-mono text-[13px] md:text-[13px]"

/** The mark of something wanting a look: nothing, where nothing does. */
function Dot({ tone }: { tone: Standing["tone"] }) {
  if (tone !== "warn" && tone !== "bad") return null
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "warn" ? "bg-attention" : "bg-destructive"
      )}
    />
  )
}

/** Something typed that counts once it is finished: on Enter, or on leaving the box. */
function Draft({
  value,
  onCommit,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string
  onCommit: (value: string) => void
}) {
  const [typed, setTyped] = React.useState(value)
  // what stands has changed under it: that is what it shows
  const [was, setWas] = React.useState(value)
  if (was !== value) {
    setWas(value)
    setTyped(value)
  }
  return (
    <Input
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={() => {
        if (typed.trim() !== value) onCommit(typed.trim())
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      spellCheck={false}
      autoComplete="off"
      className={cn("h-8 w-56", TYPED, className)}
      {...props}
    />
  )
}

/**
 * Some of what there is to choose about an agent, in a frame of its own under what it
 * has in common: one thing to a line, and a rule between each two.
 */
function Box({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-foreground/10 px-5 pt-5 pb-2.5">
      <h4 className="text-sm text-muted-foreground">{title}</h4>
      <div className="mt-2 divide-y divide-border/60">{children}</div>
    </section>
  )
}

/** Some of its models, in a frame under what they have in common. */
function Listed({
  title,
  models,
  provider,
}: {
  title: string
  models: ModelChoice[]
  provider: Provider
}) {
  const { hidden, favorites, custom } = provider.settings
  if (models.length === 0) return null
  const without = (list: string[], id: string) =>
    list.filter((one) => one !== id)
  const change = (patch: Partial<ProviderSettings>) =>
    void changeProvider(provider.id, patch)
  return (
    <Box title={title}>
      {models.map((model) => {
        const id = model.id ?? ""
        const off = hidden.includes(id)
        const favorite = favorites.includes(id)
        return (
          <div key={id} className="flex h-9.5 items-center gap-2.5">
            <button
              type="button"
              aria-pressed={favorite}
              aria-label={`${favorite ? "Remove" : "Make"} ${model.name} a favorite`}
              title="Favorites come first where a model is chosen"
              onClick={() =>
                change({
                  favorites: favorite
                    ? without(favorites, id)
                    : [...favorites, id],
                })
              }
              // the star keeps its middle whichever way it is drawn, and is pressed
              // from a little way off
              className={cn(
                "relative flex w-3.5 shrink-0 cursor-pointer justify-center rounded-sm outline-none after:absolute after:-inset-2 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                favorite
                  ? "text-attention"
                  : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              {/* in a line, its points run on past where they are drawn to: it is
                  drawn a little smaller, to look the size it is filled */}
              <StarIcon
                filled={favorite}
                className={cn("shrink-0", favorite ? "size-4" : "size-3.5")}
              />
            </button>
            <span className="min-w-0 truncate text-sm font-medium">
              {model.name}
            </span>
            {model.name !== id && (
              <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
                {id}
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2.5 pl-2">
              {custom.includes(id) && (
                <button
                  type="button"
                  aria-label={`Remove ${model.name}`}
                  onClick={() =>
                    change({
                      custom: without(custom, id),
                      hidden: without(hidden, id),
                      favorites: without(favorites, id),
                    })
                  }
                  className="-m-1 cursor-pointer rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <XIcon size={15} absoluteStrokeWidth strokeWidth={1} />
                </button>
              )}
              <Switch
                aria-label={`Show ${model.name} in the composer`}
                title="Offered where a model is chosen"
                checked={!off}
                onCheckedChange={(on) =>
                  change({ hidden: on ? without(hidden, id) : [...hidden, id] })
                }
              />
            </span>
          </div>
        )
      })}
    </Box>
  )
}

/**
 * Its models: which are offered where one is chosen, by the switch, and which come first
 * there, by the star. One that is switched off stays where it was in its list.
 */
function Models({ provider }: { provider: Provider }) {
  const { cli } = PROVIDER_WORDS[provider.id]
  const { favorites } = provider.settings
  const all = listedModels(provider)
  // one that is not in use, or not well, has none to list: what is wanting is said
  // over this
  if (all.length === 0 && (!usable(provider) || trouble(provider))) return null
  const first = (model: ModelChoice) => favorites.includes(model.id ?? "")
  return (
    <section className="flex flex-col gap-5">
      <h3 className="mb-2 text-sm font-medium">Models</h3>
      {all.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {provider.checking
            ? `Asking ${cli} for its models…`
            : `${cli} has not said what models it has.`}
        </p>
      )}
      <Listed
        title="Favorites"
        provider={provider}
        models={all.filter(first)}
      />
      <Listed
        title="All"
        provider={provider}
        models={all.filter((model) => !first(model))}
      />
    </section>
  )
}

/** What is set in its environment: a name and a value to a line. */
function Variables({ provider }: { provider: Provider }) {
  // what is being written: a line counts once it has a name
  const [rows, setRows] = React.useState<EnvVar[]>(provider.settings.env)
  // why what was written was not kept, where it was not: a machine with nowhere to keep
  // a key safely keeps none
  const [refused, setRefused] = React.useState<string | null>(null)
  const keep = (next: EnvVar[]) => {
    const named = next.filter((row) => row.name.trim())
    if (JSON.stringify(named) !== JSON.stringify(provider.settings.env))
      changeProvider(provider.id, { env: named }).then(
        () => setRefused(null),
        (error: unknown) =>
          setRefused(
            String(error instanceof Error ? error.message : error).replace(
              /^Error invoking remote method '[^']*': (Error: )?/,
              ""
            )
          )
      )
  }
  const write = (index: number, patch: Partial<EnvVar>) =>
    setRows((was) =>
      was.map((row, at) => (at === index ? { ...row, ...patch } : row))
    )
  return (
    <>
      <Row
        flush
        title="Variables"
        detail="API keys, base URLs and other settings for this CLI."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((was) => [...was, { name: "", value: "" }])}
        >
          <PlusIcon />
          Add variable
        </Button>
      </Row>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2 py-2.5">
          <Input
            aria-label="Name"
            placeholder="NAME"
            value={row.name}
            onChange={(event) => write(index, { name: event.target.value })}
            onBlur={() => keep(rows)}
            spellCheck={false}
            autoComplete="off"
            className={cn("h-8 w-44", TYPED)}
          />
          <Input
            aria-label="Value"
            placeholder="Value"
            // a key is not for whoever is looking over a shoulder
            type={
              /key|token|secret|password/i.test(row.name) ? "password" : "text"
            }
            value={row.value}
            onChange={(event) => write(index, { value: event.target.value })}
            onBlur={() => keep(rows)}
            spellCheck={false}
            autoComplete="off"
            className={cn("h-8 flex-1", TYPED)}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${row.name || "this variable"}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              const next = rows.filter((_, at) => at !== index)
              setRows(next)
              keep(next)
            }}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      {refused && (
        <p role="alert" className="py-2.5 text-sm text-destructive">
          {refused}
        </p>
      )}
    </>
  )
}

/** A model the agent has and does not list, added by what the agent knows it as. */
function Added({ provider }: { provider: Provider }) {
  const { cli } = PROVIDER_WORDS[provider.id]
  const [adding, setAdding] = React.useState<string | null>(null)
  const add = () => {
    const id = (adding ?? "").trim()
    setAdding(null)
    if (id && !listedModels(provider).some((model) => model.id === id))
      void changeProvider(provider.id, {
        custom: [...provider.settings.custom, id],
      })
  }
  return (
    <>
      <Row
        flush
        title="Add a model"
        detail={`One ${cli} has that is not listed above.`}
      >
        <Button variant="outline" size="sm" onClick={() => setAdding("")}>
          <PlusIcon />
          Add model
        </Button>
      </Row>
      {adding !== null && (
        <div className="flex items-center gap-2 py-2.5">
          <Input
            aria-label="Model"
            placeholder={`A model as ${cli} knows it`}
            autoFocus
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add()
            }}
            spellCheck={false}
            autoComplete="off"
            className={cn("h-8 flex-1", TYPED)}
          />
          <Button variant="outline" size="sm" onClick={add}>
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  )
}

/**
 * What few have any need to touch: what is run, where it keeps its own settings, what
 * it is started with, and a model it does not list.
 */
function Advanced({ provider }: { provider: Provider }) {
  const { cli, command } = PROVIDER_WORDS[provider.id]
  const { settings } = provider
  const home = HOME[provider.id]
  const change = (patch: Partial<ProviderSettings>) =>
    void changeProvider(provider.id, patch)
  return (
    <div className="flex flex-col gap-5">
      <Box title="Runtime">
        <Row
          flush
          wrap
          title="Binary path"
          detail={`The ${cli} binary to run.`}
        >
          <Draft
            aria-label="Binary path"
            placeholder={command}
            value={settings.binary}
            onCommit={(binary) => change({ binary })}
          />
        </Row>
        {home && (
          <Row
            flush
            wrap
            title={home.title}
            detail={`Where ${cli} keeps its settings and sign-in.`}
          >
            <Draft
              aria-label={home.title}
              placeholder={home.placeholder}
              value={settings.home}
              onCommit={(path) => change({ home: path })}
            />
          </Row>
        )}
        <Row
          flush
          wrap
          title="Launch arguments"
          detail="Extra arguments passed when a session starts."
        >
          <Draft
            aria-label="Launch arguments"
            placeholder={ARGS[provider.id]}
            value={settings.args}
            onCommit={(args) => change({ args })}
          />
        </Row>
      </Box>
      <Box title="Environment">
        <Variables provider={provider} />
      </Box>
      <Box title="Other models">
        <Added provider={provider} />
      </Box>
    </div>
  )
}

/** How long a command copied says so, in ms. */
const COPIED_MS = 1500

/** Something to type in a terminal, as it is to be typed, with a button that copies it. */
function Command({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 rounded-lg bg-foreground/6 py-0.5 pr-0.5 pl-2">
      <code className="min-w-0 truncate font-mono text-[13px] text-foreground select-all">
        {text}
      </code>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => setCopied(true))
        }
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </span>
  )
}

/** How one that is not on the machine is put there: in a terminal, or as its makers say. */
function Install({ provider }: { provider: Provider }) {
  const { name, install, docs } = PROVIDER_WORDS[provider.id]
  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <div className="flex flex-col items-start gap-2">
        <p>Open Terminal and type</p>
        <Command text={install} />
      </div>
      <p>
        <a
          href={docs}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Visit the {name} docs
        </a>
      </p>
    </div>
  )
}

/**
 * What is wrong with one that is installed and switched on, in two lines: what it comes
 * to, and what to type in a terminal to see to it. What the agent itself said of it, in
 * its own words, is there for a pointer that rests on it.
 */
function Trouble({ provider }: { provider: Provider }) {
  const wrong = trouble(provider)
  if (!wrong) return null
  return (
    <div
      className="flex flex-col gap-0.5 text-sm"
      title={provider.status?.trouble ?? undefined}
    >
      <p className="font-medium">{wrong.title}</p>
      <p className="text-muted-foreground">
        Open Terminal and type{" "}
        <code className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[13px] text-foreground">
          {wrong.command}
        </code>
        {wrong.after}
      </p>
    </div>
  )
}

/**
 * What there is to choose about one that is open: its models first, and the rest under
 * them for whoever asks to see it.
 */
function Body({ provider, id }: { provider: Provider; id: string }) {
  const [advanced, setAdvanced] = React.useState(false)
  const { tone, detail } = standing(provider)
  const missing = provider.status !== null && !provider.status.path
  return (
    <div id={id} className="flex flex-col gap-7 px-8 pb-7">
      {/* what is wanting of it, and what to do about that: what is wrong with one that
          is there, or, where it is not on the machine, how it is put there, after what
          was wrong with a path given for it */}
      <Trouble provider={provider} />
      {tone !== "ok" &&
        tone !== "warn" &&
        detail &&
        (!missing || provider.settings.binary) && (
          <p className="text-sm text-muted-foreground">{detail}</p>
        )}
      {missing && <Install provider={provider} />}
      <Models provider={provider} />
      {advanced && <Advanced provider={provider} />}
      <button
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced(!advanced)}
        className="cursor-pointer self-start rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {advanced ? "Hide advanced settings" : "Show advanced settings"}
      </button>
    </div>
  )
}

/**
 * One of them: its mark, what it is and how it stands, and at the far side its version,
 * the switch for whether it is in use, and an arrow. All of the line opens it, but for
 * the switch. Where there is a newer version of it, a button that puts it in stands in
 * place of all three, until it is in.
 */
function Entry({
  provider,
  open,
  onOpen,
}: {
  provider: Provider
  open: boolean
  onOpen: () => void
}) {
  const { name, cli } = PROVIDER_WORDS[provider.id]
  const { tone, headline, detail } = standing(provider)
  const { enabled } = provider.settings
  const body = React.useId()
  return (
    <div>
      <div className="relative flex min-h-24.5 items-center gap-5 pr-7 pl-8">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          title={detail ?? undefined}
          onClick={onOpen}
          // it is pressed anywhere on its line: only the switch stands over it
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-6 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
        >
          <ProviderIcon
            provider={provider.id}
            className={cn(
              "size-6.5 shrink-0",
              !enabled && "opacity-50 grayscale"
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{name}</span>
            <span className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
              {/* (level with the middle of the line) */}
              <span className="flex h-5 shrink-0 items-center empty:hidden">
                <Dot tone={tone} />
              </span>
              <span className="truncate">{headline}</span>
            </span>
          </span>
        </button>
        {updatable(provider) || provider.updating ? (
          <Button
            disabled={provider.updating}
            title={
              provider.update
                ? `${cli} ${provider.update.version} is available, for the ${provider.status?.version} there is. This runs ${provider.update.command}.`
                : undefined
            }
            onClick={() => void updateProvider(provider.id)}
            className="relative z-10 h-9 shrink-0 gap-2 rounded-full px-4 disabled:opacity-100"
          >
            {provider.updating ? (
              <Spinner />
            ) : (
              // (its arrow goes the way a clock does: on, to what is newer)
              <HistoryIcon className="-scale-x-100" />
            )}
            {provider.updating ? "Updating…" : "Update available"}
          </Button>
        ) : (
          <>
            {provider.status?.version && (
              <span className="font-mono text-sm text-muted-foreground uppercase">
                v{provider.status.version}
              </span>
            )}
            <Switch
              aria-label={`Use ${name}`}
              checked={enabled}
              onCheckedChange={(on) =>
                void changeProvider(provider.id, { enabled: on })
              }
              className="z-10"
            />
            <ChevronDownIcon
              absoluteStrokeWidth
              strokeWidth={1}
              className={cn(
                "size-6 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        )}
      </div>
      {/* each has its own boxes, with nothing in them of another's */}
      {open && <Body id={body} provider={provider} />}
    </div>
  )
}

/**
 * The agents looked at again, for one installed or signed in to since: when it was last
 * done, as a button that does it. It stands beside the name of the section.
 */
export function CheckAgain() {
  const providers = useStore((state) => state.providers)
  const [asked, setAsked] = React.useState(false)
  const now = useNow(30_000)
  const checking = asked || providers.some((one) => one.checking)
  const checked = Math.max(
    0,
    ...providers.map((one) => one.status?.checkedAt ?? 0)
  )
  const since = ago(checked, now)
  return (
    <Button
      variant="ghost"
      size="sm"
      // its words end where the list under it does
      className="-mr-3 gap-1.5 text-muted-foreground"
      disabled={checking}
      onClick={() => {
        setAsked(true)
        void checkProviders().finally(() => setAsked(false))
      }}
    >
      <RefreshCwIcon className={cn(checking && "animate-spin")} />
      {checking
        ? "Checking…"
        : checked === 0
          ? "Check again"
          : `Checked ${since === "now" ? "just now" : `${since} ago`}`}
    </Button>
  )
}

/**
 * The agents a message can be put to, one under another: each says how it stands and has
 * a switch for whether it is in use, and opens, one at a time, onto its models and what
 * else there is to choose about it.
 */
export function Providers() {
  const providers = useStore((state) => state.providers)
  const [open, setOpen] = React.useState<ProviderId | null>(null)
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      {providers.map((one) => (
        <Entry
          key={one.id}
          provider={one}
          open={one.id === open}
          onOpen={() => setOpen(one.id === open ? null : one.id)}
        />
      ))}
    </div>
  )
}
