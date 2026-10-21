import { describe, expect, it } from "vitest"

import type { ModelChoice, Provider, ProviderSettings } from "@shared/api"
import {
  answering,
  barred,
  listedModels,
  offeredModels,
  PROVIDER_WORDS,
  standing,
  trouble,
  updatable,
  updatedSaid,
  usable,
} from "./providers"

const model = (id: string | null): ModelChoice => ({
  id,
  name: id ?? "Default",
  short: id ?? "Opus",
  detail: "",
  efforts: [],
})
const SETTINGS: ProviderSettings = {
  enabled: true,
  binary: "",
  home: "",
  args: "",
  env: [],
  hidden: [],
  favorites: [],
  custom: [],
}
const provider = (
  id: Provider["id"],
  more: Partial<Omit<Provider, "settings" | "status">> & {
    settings?: Partial<ProviderSettings>
    status?: Partial<NonNullable<Provider["status"]>> | null
  } = {}
): Provider => ({
  id,
  checking: false,
  models: [model(null), model("opus"), model("sonnet"), model("haiku")],
  ...more,
  update: more.update ?? null,
  updating: more.updating ?? false,
  settings: { ...SETTINGS, ...more.settings },
  status:
    more.status === null
      ? null
      : {
          path: `/bin/${id}`,
          version: "1.0.0",
          signedIn: true,
          account: "Max",
          trouble: null,
          checkedAt: 1,
          ...more.status,
        },
})

describe("PROVIDER_WORDS", () => {
  it("says how each is installed from its makers' own address, and where they say more", () => {
    for (const { install, docs } of Object.values(PROVIDER_WORDS)) {
      expect(install).toMatch(/^curl -fsSL https:\/\/\S+ \| (ba)?sh$/)
      expect(docs).toMatch(/^https:\/\//)
    }
  })
})

describe("offeredModels", () => {
  it("leads with leaving it to the agent, then favourites, and leaves out the hidden", () => {
    const one = provider("claude", {
      settings: {
        hidden: ["sonnet"],
        favorites: ["haiku", "sonnet"],
        custom: ["claude-next", "opus"],
      },
    })
    expect(offeredModels(one).map((m) => m.id)).toEqual([
      null,
      "haiku",
      "opus",
      "claude-next",
    ])
    expect(listedModels(one).map((m) => m.id)).toEqual([
      "opus",
      "sonnet",
      "haiku",
      "claude-next",
    ])
  })

  it("is nothing while nothing is known of the agent", () => {
    expect(offeredModels(undefined)).toEqual([])
    expect(offeredModels(provider("grok", { models: [] }))).toEqual([])
  })
})

describe("answering", () => {
  const all = [
    provider("claude"),
    provider("codex", { settings: { enabled: false } }),
    provider("grok"),
  ]

  it("is the agent a conversation is had with, whatever is picked", () => {
    expect(answering(all, "claude", { provider: "grok" })).toBe("grok")
    expect(answering(all, "grok", { provider: "codex" })).toBe("codex")
  })

  it("is the one picked for a new conversation, if a message can be put to it", () => {
    expect(answering(all, "grok", null)).toBe("grok")
    expect(answering(all, "codex", null)).toBe("claude")
    expect(answering([all[1], all[2]], "claude", null)).toBe("grok")
  })

  it("stays with what is picked while none can be used, or none are known", () => {
    expect(answering([all[1]], "codex", null)).toBe("codex")
    expect(answering([], "grok", undefined)).toBe("grok")
  })
})

describe("barred", () => {
  const off = provider("codex", { settings: { enabled: false } })
  const gone = provider("grok", { status: { path: null } })
  const neither = provider("claude", {
    settings: { enabled: false },
    status: { path: null },
  })
  const unknown = provider("codex", { status: null })

  it("is no one a message can be put to", () => {
    expect(barred(provider("claude"))).toBeNull()
    expect(barred(provider("grok"))).toBeNull()
  })

  it("says what is wanting of one that is off, or not on the machine", () => {
    expect(barred(off)).toBe("Codex is switched off. Switch it on in Settings.")
    expect(barred(gone)).toBe("Grok was not found on this machine.")
    // not found comes first: switching it on would not be enough
    expect(barred(neither)).toBe("Claude Code was not found on this machine.")
    expect(barred(unknown)).toBe("Looking for Codex…")
  })

  it("is every one a message cannot be put to, and no other", () => {
    for (const one of [provider("claude"), off, gone, neither, unknown])
      expect(barred(one) === null).toBe(usable(one))
  })
})

describe("standing", () => {
  it("says who is signed in, by what they pay for", () => {
    expect(
      standing(provider("claude", { status: { account: "Claude Max" } }))
    ).toMatchObject({ tone: "ok", headline: "You’re using Claude Max" })
    expect(
      standing(provider("grok", { status: { account: null } })).headline
    ).toBe("Signed in")
  })

  it("says how they reach it, where they pay for nothing it names", () => {
    const says = (account: string) =>
      standing(provider("codex", { status: { account } })).headline
    expect(says("API key")).toBe("You’re using an API key")
    expect(says("Grok account")).toBe("You’re using your Grok account")
    expect(says("someone@example.com")).toBe("Signed in as someone@example.com")
  })

  it("says what is wanting, and what to do about it", () => {
    expect(
      standing(provider("codex", { status: { signedIn: false } }))
    ).toEqual({
      tone: "warn",
      headline: "Not signed in",
      detail: "Run codex login in a terminal to sign in, then check again.",
    })
    expect(
      standing(
        provider("grok", {
          status: { signedIn: null, trouble: "Grok did not answer." },
        })
      )
    ).toEqual({
      tone: "warn",
      headline: "Needs attention",
      detail: "Grok did not answer.",
    })
    expect(
      standing(provider("codex", { status: { path: null } }))
    ).toMatchObject({ tone: "bad", headline: "Not installed" })
  })

  it("is quiet about one that is not in use, or is still being looked at", () => {
    const off = provider("codex", { settings: { enabled: false } })
    expect(standing(off)).toMatchObject({
      tone: "off",
      headline: "Switched off",
    })
    expect(usable(off)).toBe(false)
    expect(
      standing(
        provider("codex", {
          settings: { enabled: false },
          status: { path: null },
        })
      )
    ).toMatchObject({ tone: "off", headline: "Not installed" })
    expect(standing(provider("grok", { status: null })).tone).toBe("wait")
    expect(
      standing(provider("grok", { checking: true, status: { signedIn: null } }))
        .headline
    ).toBe("Checking…")
  })
})

describe("trouble", () => {
  it("is what to do about one that did not answer, whatever it said", () => {
    expect(
      trouble(
        provider("claude", {
          status: { signedIn: null, trouble: "Claude Code did not answer." },
        })
      )
    ).toEqual({
      title: "Claude Code is not responding",
      command: "claude",
      after: " to see that it works, then check again.",
    })
  })

  it("is how to sign in, for one nobody is signed in to", () => {
    expect(
      trouble(provider("codex", { status: { signedIn: false } }))
    ).toMatchObject({ title: "Sign in to Codex", command: "codex login" })
  })

  it("is nothing for one that is well, off, not installed, or being looked at", () => {
    expect(trouble(provider("claude"))).toBeNull()
    expect(
      trouble(
        provider("codex", {
          settings: { enabled: false },
          status: { trouble: "Codex did not answer." },
        })
      )
    ).toBeNull()
    expect(trouble(provider("grok", { status: { path: null } }))).toBeNull()
    expect(trouble(provider("grok", { status: null }))).toBeNull()
  })
})

describe("updatable", () => {
  const newer = { version: "2.1.299", command: "claude update" }

  it("is one in use with a newer version to put in", () => {
    expect(updatable(provider("claude", { update: newer }))).toBe(true)
    expect(updatable(provider("claude"))).toBe(false)
  })

  it("is not one that is switched off, whatever is newer", () => {
    expect(
      updatable(
        provider("claude", { update: newer, settings: { enabled: false } })
      )
    ).toBe(false)
  })
})

describe("updatedSaid", () => {
  it("says what came of updating one, in a line", () => {
    expect(
      updatedSaid("claude", { outcome: "updated", version: "2.1.299" })
    ).toBe("Claude Code is now 2.1.299")
    expect(updatedSaid("codex", { outcome: "same", version: "0.161.0" })).toBe(
      "Codex is still 0.161.0"
    )
    expect(updatedSaid("grok", { outcome: "failed", version: "1.0.52" })).toBe(
      "Grok could not be updated"
    )
    expect(updatedSaid("claude", { outcome: "broken", version: null })).toBe(
      "Claude Code was updated, and is not responding"
    )
  })
})
