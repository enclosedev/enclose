// What the app is told of the account it is signed in to, and the most it may keep.

/** How much each account may keep, in bytes: what its projects' backups count against. */
export const STORAGE_LIMIT = 5 * 1024 ** 3

/**
 * How much the whole of Enclose Cloud may keep, in bytes, all accounts together: past
 * it, nothing more is taken from anybody, while it is looked into.
 */
export const SERVICE_LIMIT = 200 * 1024 ** 3

/** The biggest file backed up, in bytes: one request carries it, and a Worker takes 100 MB. */
export const FILE_LIMIT = 95 * 1024 ** 2

/** What the app is told of the account it is signed in to (GET /v1/account). */
export type AccountReply = {
  user: { id: string; email: string; name: string; image: string | null }
  storage: { used: number; limit: number }
  /** its projects on Enclose Cloud: how many, and when one was last backed up (ms) */
  backup: { projects: number; at: number | null }
}
