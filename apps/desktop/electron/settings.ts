// What the user has chosen for the app as a whole, kept in one file in its data folder.
import fs from "node:fs"
import path from "node:path"

import {
  PROVIDERS,
  type EnvVar,
  type ProviderId,
  type ProviderSettings,
  type Settings,
} from "../shared/api"
import { missing, setAside, writeWhole } from "./atomic"
import type { Account, Tokens } from "./github"

/** A list of names, from what may be anything: the strings in it, each once. */
const names = (given: unknown): string[] => [
  ...new Set(
    (Array.isArray(given) ? given : [])
      .filter((one): one is string => typeof one === "string")
      .map((one) => one.trim())
      .filter(Boolean)
  ),
]

/** What is set in an agent's environment, from what may be anything. */
const variables = (given: unknown): EnvVar[] =>
  (Array.isArray(given) ? given : []).flatMap(
    (one: Partial<EnvVar> | null): EnvVar[] =>
      typeof one?.name === "string" && typeof one.value === "string"
        ? [{ name: one.name.trim(), value: one.value }]
        : []
  )

/**
 * What is chosen about an agent, from what was kept or what the window gave, either of
 * which may be anything: each thing as it should be, or as `otherwise` has it.
 */
export function providerSettings(
  given: unknown,
  otherwise: ProviderSettings
): ProviderSettings {
  const read = (given ?? {}) as Partial<Record<keyof ProviderSettings, unknown>>
  const text = (key: "binary" | "home" | "args") =>
    typeof read[key] === "string" ? read[key].trim() : otherwise[key]
  return {
    enabled:
      typeof read.enabled === "boolean" ? read.enabled : otherwise.enabled,
    binary: text("binary"),
    home: text("home"),
    args: text("args"),
    env: read.env === undefined ? otherwise.env : variables(read.env),
    hidden: read.hidden === undefined ? otherwise.hidden : names(read.hidden),
    favorites:
      read.favorites === undefined
        ? otherwise.favorites
        : names(read.favorites),
    custom: read.custom === undefined ? otherwise.custom : names(read.custom),
  }
}

/**
 * An agent as it is until something is chosen about it. Claude Code is what the app was
 * made around, and is on; the others, opencode among them, are for whoever switches
 * them on.
 */
export const providerDefaults = (id: ProviderId): ProviderSettings => ({
  enabled: id === "claude",
  binary: "",
  home: "",
  args: "",
  env: [],
  hidden: [],
  favorites: [],
  custom: [],
})

/**
 * Keeps a secret so that the file it is written in does not give it away: the system's
 * own keeping, where there is one. What is set in an agent's environment is often a key.
 */
export type Vault = {
  seal(text: string): string
  unseal(sealed: string): string
}

/**
 * What setting a value in an agent's environment comes to on a machine that has nowhere
 * to keep it safely: it is not kept, rather than kept in the open in the settings file.
 */
export class Unsealed extends Error {
  constructor() {
    super(
      "This machine has nowhere to keep keys safely, so the variables were not saved. Set them where the agent is started instead (its own config, or the terminal it runs from)."
    )
  }
}

type Saved = Partial<Settings> & {
  providers?: Partial<Record<ProviderId, unknown>>
  /** the GitHub account projects are backed up to, and its tokens, sealed */
  github?: { account: Account; sealed: string }
}

export class SettingsStore {
  private readonly file: string
  private readonly defaults: Settings
  private readonly vault: Vault | null
  private saved: Saved = {}
  /**
   * Where a settings file that could not be read was moved to, as the app was opened:
   * null where there was none such. The defaults stand in its place.
   */
  readonly aside: string | null = null

  constructor(file: string, defaults: Settings, vault: Vault | null = null) {
    this.file = file
    this.defaults = defaults
    this.vault = vault
    let text: string
    try {
      text = fs.readFileSync(file, "utf8")
    } catch (error) {
      if (missing(error)) return
      text = ""
    }
    let read: unknown = null
    try {
      read = JSON.parse(text)
    } catch {
      // cut short, or something else: read as nothing
    }
    if (typeof read === "object" && read !== null && !Array.isArray(read)) {
      this.saved = read
      // for the user alone to read, however it was written before
      try {
        fs.chmodSync(file, 0o600)
      } catch {
        // (it is written so the next time anything is set)
      }
      return
    }
    // What cannot be read is kept, out of the way, rather than written over the first
    // time anything is set: the keys and the GitHub sign-in in it with the rest.
    this.aside = setAside(file)
  }

  get(): Settings {
    const folder = this.saved.projectsFolder
    const { lookOver, analytics, versions } = this.saved
    return {
      projectsFolder:
        typeof folder === "string" && folder
          ? folder
          : this.defaults.projectsFolder,
      lookOver:
        typeof lookOver === "boolean" ? lookOver : this.defaults.lookOver,
      analytics:
        typeof analytics === "boolean" ? analytics : this.defaults.analytics,
      versions:
        typeof versions === "boolean" ? versions : this.defaults.versions,
    }
  }

  set(patch: Partial<Settings>): Settings {
    this.saved = { ...this.saved, ...patch }
    this.write()
    return this.get()
  }

  /** What is kept about the agents, as it is kept: one that is none of them left out. */
  private kept(): Partial<Record<ProviderId, unknown>> {
    const { providers } = this.saved
    if (typeof providers !== "object" || providers === null) return {}
    return Object.fromEntries(
      PROVIDERS.flatMap((id) =>
        providers[id] === undefined ? [] : [[id, providers[id]]]
      )
    )
  }

  /** What is chosen about one of the agents. */
  provider(id: ProviderId): ProviderSettings {
    const kept = this.kept()[id] as { env?: unknown } | undefined
    const env = (Array.isArray(kept?.env) ? kept.env : []).map(
      (one: { name?: unknown; value?: unknown; sealed?: unknown } | null) => {
        if (typeof one?.sealed !== "string") return one
        try {
          return { name: one.name, value: this.vault?.unseal(one.sealed) ?? "" }
        } catch {
          return { name: one.name, value: "" }
        }
      }
    )
    return providerSettings({ ...kept, env }, providerDefaults(id))
  }

  /**
   * Change what is chosen about one, in as much as `patch` says anything of it. Throws
   * Unsealed, and keeps nothing of it, where a value in its environment would have to be
   * kept in the open: one kept so before, as it was, stays.
   */
  setProvider(id: ProviderId, patch: unknown): ProviderSettings {
    const next = providerSettings(patch, this.provider(id))
    const { vault } = this
    if (!vault) {
      const kept = (this.kept()[id] as { env?: unknown } | undefined)?.env
      const open = variables(kept)
      if (
        next.env.some(
          ({ name, value }) =>
            value &&
            !open.some((one) => one.name === name && one.value === value)
        )
      )
        throw new Unsealed()
    }
    this.saved = {
      ...this.saved,
      providers: {
        ...this.kept(),
        [id]: {
          ...next,
          env: next.env.map(({ name, value }) =>
            vault && value
              ? { name, sealed: vault.seal(value) }
              : { name, value }
          ),
        },
      },
    }
    this.write()
    return next
  }

  /**
   * The GitHub account projects are backed up to, and what signs the app in to it:
   * null where there is none, or where what was kept cannot be had back.
   */
  github(): { account: Account; tokens: Tokens } | null {
    const kept = this.saved.github
    if (!kept || !this.vault) return null
    try {
      return {
        account: kept.account,
        tokens: JSON.parse(this.vault.unseal(kept.sealed)),
      }
    } catch {
      return null
    }
  }

  /** Keep a GitHub account, sealed, or forget the one there is. Not kept where nothing can seal it. */
  setGitHub(github: { account: Account; tokens: Tokens } | null): boolean {
    if (github && !this.vault) return false
    const rest = { ...this.saved }
    delete rest.github
    this.saved = github
      ? {
          ...rest,
          github: {
            account: github.account,
            sealed: this.vault!.seal(JSON.stringify(github.tokens)),
          },
        }
      : rest
    this.write()
    return true
  }

  private write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    // (sealed or not, what is in it is the user's alone to read; and it is written whole,
    // or the keys and the sign-in in it could be lost with the rest)
    writeWhole(this.file, JSON.stringify(this.saved, null, 2), 0o600)
  }
}
