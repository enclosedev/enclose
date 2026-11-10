// What the app is told of the account it is signed in to, and the most it may keep.

/** How much each account may keep, in bytes: what its projects' backups will count against. */
export const STORAGE_LIMIT = 5 * 1024 ** 3

/** What the app is told of the account it is signed in to (GET /v1/account). */
export type AccountReply = {
  user: { id: string; email: string; name: string; image: string | null }
  storage: { used: number; limit: number }
}
