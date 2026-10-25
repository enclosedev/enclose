/** Whether this is a Mac, where the key for shortcuts is Cmd and elsewhere it is Ctrl. */
export const MAC =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")

/** Whether this is Windows, which calls some things by names of its own. */
export const WINDOWS =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")
