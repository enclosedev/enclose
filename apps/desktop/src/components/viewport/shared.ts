// What is made once and had by as many as want it: the meshes of a part, read from its
// file, which a rebuilt model has again wherever the file is just as it was.

/**
 * Things made once for each key and shared by whoever takes them, for as long as any of
 * them has one: each taking is let go of in its turn, and once the last of a thing is,
 * the thing is done with (`free`) and forgotten. Nothing is kept that nothing has.
 */
export function sharing<T>(free: (value: T) => void) {
  const entries = new Map<string, { value: Promise<T>; users: number }>()
  return {
    /**
     * The thing for this key: the one there is, or one made now (`make`). Taken, it is
     * to be let go of (see give), unless it could not be made.
     */
    take(key: string, make: () => Promise<T>): Promise<T> {
      const known = entries.get(key)
      if (known) {
        known.users++
        return known.value
      }
      const value = make()
      const entry = { value, users: 1 }
      entries.set(key, entry)
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key)
      })
      return value
    },
    /** Let go of the thing taken for this key: the last to, and it is done with. */
    give(key: string) {
      const entry = entries.get(key)
      if (!entry || --entry.users > 0) return
      entries.delete(key)
      void entry.value.then(free, () => {})
    },
    /** How many things there are, of all that were made and are still had. */
    get size() {
      return entries.size
    },
  }
}
