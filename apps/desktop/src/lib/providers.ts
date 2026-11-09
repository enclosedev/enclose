// The agents a message can be put to, as the window knows them: what each is called, how
// it stands, and which of its models are offered where one is chosen.
import type {
  ConversationSummary,
  ModelChoice,
  Provider,
  ProviderId,
  ProviderUpdated,
} from "@shared/api"

/**
 * What each is called: by its name, by the command-line agent that is run, and by what
 * is typed to run that, which is also how its sign-in is begun. Then how it is put on a
 * Mac, by what its makers have typed in a terminal, and where they say more of that.
 */
export const PROVIDER_WORDS: Record<
  ProviderId,
  {
    name: string
    cli: string
    command: string
    signIn: string
    install: string
    docs: string
    /** what to say where it needs no account at all, in place of who is signed in */
    noAccount?: string
    /**
     * What is said where it is not found, of what it is taken for that is not it: an
     * app of the same name, which is no command a terminal can run.
     */
    notTheApp?: string
  }
> = {
  claude: {
    name: "Claude",
    cli: "Claude Code",
    command: "claude",
    signIn: "claude auth login",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    docs: "https://code.claude.com/docs/en/setup",
    notTheApp:
      "Enclose runs Claude Code, which is used from Terminal. The Claude app is not enough on its own.",
  },
  codex: {
    name: "Codex",
    cli: "Codex",
    command: "codex",
    signIn: "codex login",
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    docs: "https://learn.chatgpt.com/docs/codex/cli",
  },
  grok: {
    name: "Grok",
    cli: "Grok",
    command: "grok",
    signIn: "grok login",
    install: "curl -fsSL https://x.ai/cli/install.sh | bash",
    docs: "https://x.ai/cli",
  },
  opencode: {
    name: "opencode",
    cli: "opencode",
    command: "opencode",
    signIn: "opencode auth login",
    install: "curl -fsSL https://opencode.ai/install | bash",
    docs: "https://opencode.ai/docs",
    noAccount:
      "opencode answers with or without an account: nothing to sign in to.",
  },
}

/** Whether a message can be put to one: it is switched on, and installed. */
export const usable = (provider: Provider) =>
  provider.settings.enabled && provider.status?.path != null

/** Stable while nothing is known of the agents, or one has no models. */
const NO_MODELS: ModelChoice[] = []

/** A model the user told an agent of, by what the agent knows it as. */
const added = (id: string): ModelChoice => ({
  id,
  name: id,
  short: id,
  detail: "Added in Settings",
  efforts: [],
})

/**
 * Every model there is to list for an agent, but for the choice of leaving it to the
 * agent: its own, then those the user told it of.
 */
export function listedModels(provider: Provider): ModelChoice[] {
  const own = provider.models.filter((model) => model.id !== null)
  return [
    ...own,
    ...provider.settings.custom
      .filter((id) => !own.some((model) => model.id === id))
      .map(added),
  ]
}

/**
 * The models offered where one is chosen: leaving it to the agent, then the favourites,
 * then the rest, without those the user has hidden.
 */
export function offeredModels(provider: Provider | undefined): ModelChoice[] {
  if (!provider) return NO_MODELS
  const { hidden, favorites } = provider.settings
  const shown = listedModels(provider).filter(
    (model) => !hidden.includes(model.id ?? "")
  )
  const first = (model: ModelChoice) => favorites.includes(model.id ?? "")
  return [
    ...provider.models.filter((model) => model.id === null),
    ...shown.filter(first),
    ...shown.filter((model) => !first(model)),
  ]
}

/**
 * The agent that answers in a conversation: the one it is had with; or, of one not yet
 * begun, the one picked, if a message can be put to it, and failing that the first that
 * one can be put to.
 */
export function answering(
  providers: Provider[],
  picked: ProviderId,
  conversation: Pick<ConversationSummary, "provider"> | null | undefined
): ProviderId {
  if (conversation) return conversation.provider
  const ready = providers.filter(usable)
  return (ready.find((one) => one.id === picked) ?? ready[0])?.id ?? picked
}

/**
 * Why a message cannot be put to an agent, as a line says it, or null where one can be:
 * it is switched off, or is not on the machine.
 */
export function barred(provider: Provider): string | null {
  const { cli } = PROVIDER_WORDS[provider.id]
  if (!provider.status) return `Looking for ${cli}…`
  if (!provider.status.path) return `${cli} was not found on this machine.`
  if (!provider.settings.enabled)
    return `${cli} is switched off. Switch it on in Settings.`
  return null
}

/** How an agent stands, as a line says it: what, and how much it wants looking at. */
export type Standing = {
  /** off: not in use. wait: being looked at. ok, warn, bad: as they sound. */
  tone: "off" | "wait" | "ok" | "warn" | "bad"
  headline: string
  /** what to do about it, or what it means, in a sentence; null if nothing needs saying */
  detail: string | null
}

/**
 * Who is signed in, as it is said to them: by what they pay for, where the agent says,
 * and failing that by how they reach it.
 */
function using(account: string | null): string {
  if (!account) return "Signed in"
  if (account.includes("@")) return `Signed in as ${account}`
  if (account === "API key") return "You’re using an API key"
  if (account === "Grok account") return "You’re using your Grok account"
  return `You’re using ${account}`
}

export function standing(provider: Provider): Standing {
  const { name, cli, signIn, noAccount } = PROVIDER_WORDS[provider.id]
  const { status, settings } = provider
  if (!status) return { tone: "wait", headline: "Checking…", detail: null }
  if (!status.path)
    return {
      tone: settings.enabled ? "bad" : "off",
      // by the name of what is run, where the agent goes by another: it is Claude Code
      // that is not there, and not the Claude app that may well be
      headline: cli === name ? "Not installed" : `${cli} not installed`,
      detail: settings.binary
        ? `Nothing to run was found at ${settings.binary}.`
        : `Install ${cli}, then check again.`,
    }
  if (!settings.enabled)
    return {
      tone: "off",
      headline: "Switched off",
      detail: `Switch it on to use ${cli} in Enclose.`,
    }
  if (status.signedIn)
    return {
      tone: "ok",
      headline: using(status.account),
      detail: `Enclose uses the account signed in to ${cli}.`,
    }
  if (status.signedIn === false)
    return {
      tone: "warn",
      headline: "Not signed in",
      detail: `Run ${signIn} in a terminal to sign in, then check again.`,
    }
  if (provider.checking)
    return { tone: "wait", headline: "Checking…", detail: null }
  if (status.trouble)
    return { tone: "warn", headline: "Needs attention", detail: status.trouble }
  return {
    tone: "ok",
    headline: "Ready",
    detail: noAccount ?? `Enclose uses the account signed in to ${cli}.`,
  }
}

/**
 * What is wrong with one that is installed and switched on, as two lines say it: what it
 * comes to, and what to type in a terminal to see to it, with what follows that. Null
 * where nothing is.
 */
export function trouble(
  provider: Provider
): { title: string; command: string; after: string } | null {
  if (standing(provider).tone !== "warn") return null
  const { cli, command, signIn } = PROVIDER_WORDS[provider.id]
  return provider.status?.signedIn === false
    ? {
        title: `Sign in to ${cli}`,
        command: signIn,
        after: ", then check again.",
      }
    : {
        title: `${cli} is not responding`,
        command,
        after: " to see that it works, then check again.",
      }
}

/** Whether there is a newer version of one to put in: which is only ever of one in use. */
export const updatable = (provider: Provider) =>
  provider.settings.enabled && provider.update !== null

/** What came of updating one, as the app says it at the foot of the view. */
export function updatedSaid(id: ProviderId, updated: ProviderUpdated): string {
  const { cli } = PROVIDER_WORDS[id]
  const { outcome, version } = updated
  if (outcome === "updated") return `${cli} is now ${version}`
  if (outcome === "failed") return `${cli} could not be updated`
  if (outcome === "broken") return `${cli} was updated, and is not responding`
  return version ? `${cli} is still ${version}` : `${cli} was not updated`
}
