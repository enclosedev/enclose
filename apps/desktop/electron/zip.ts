// A zip archive of some files, made with nothing but what Node has: the parts of a model
// in one file, which anything opens. Each file is squeezed, and the archive ends with the
// list of what is in it, as a zip does.
//
// It is the plain kind: no file in it, and not the whole of it, as big as four gigabytes,
// which is what the plain kind can count to.
import zlib from "node:zlib"

/** A file to go into an archive: what it is called there, and what is in it. */
export type Zipped = { name: string; data: Buffer }

/** The most the plain kind of archive can say of a size, or of where something is. */
const MOST = 0xffffffff

/** A day and a time as a zip keeps them: to two seconds, and from 1980. */
function stamped(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear())
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time:
      (when.getHours() << 11) |
      (when.getMinutes() << 5) |
      (when.getSeconds() >> 1),
  }
}

/**
 * Names for an archive, each of them no other's: two files called the same would be one
 * written over the other by whatever opens it. The second is "name-2.step".
 */
function named(wanted: string[]): string[] {
  const taken = new Set<string>()
  return wanted.map((name) => {
    const dot = name.lastIndexOf(".")
    const [stem, ending] =
      dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
    let free = name
    for (let n = 2; taken.has(free.toLowerCase()); n++)
      free = `${stem}-${n}${ending}`
    taken.add(free.toLowerCase())
    return free
  })
}

/** The files as one zip archive, in the order given, as it would be written to a file. */
export function zipOf(files: Zipped[], made = new Date()): Buffer {
  const { date, time } = stamped(made)
  const names = named(files.map((file) => file.name))
  const parts: Buffer[] = []
  const listed: Buffer[] = []
  let at = 0
  files.forEach(({ data }, index) => {
    const name = Buffer.from(names[index], "utf8")
    const squeezed = zlib.deflateRawSync(data, { level: 6 })
    const stored = squeezed.length < data.length ? squeezed : data
    const how = stored === data ? 0 : 8
    if (data.length >= MOST || at + stored.length >= MOST)
      throw new Error("too big for a zip archive")
    const sum = zlib.crc32(data)

    // what both of a file's headers say of it: the one before it, and the one in the list
    const said = Buffer.alloc(26)
    said.writeUInt16LE(20, 0) // the version of zip that reads it
    said.writeUInt16LE(0x0800, 2) // its name is UTF-8
    said.writeUInt16LE(how, 4)
    said.writeUInt16LE(time, 6)
    said.writeUInt16LE(date, 8)
    said.writeUInt32LE(sum, 10)
    said.writeUInt32LE(stored.length, 14)
    said.writeUInt32LE(data.length, 18)
    said.writeUInt16LE(name.length, 22)
    said.writeUInt16LE(0, 24) // nothing extra

    const before = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      said,
      name,
    ])
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // the version of zip that made it
    said.copy(entry, 6)
    // (no comment, on the first disk, nothing of how it is kept: all noughts)
    entry.writeUInt32LE(at, 42)
    listed.push(entry, name)

    parts.push(before, stored)
    at += before.length + stored.length
  })

  const list = Buffer.concat(listed)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(list.length, 12)
  end.writeUInt32LE(at, 16)
  if (files.length > 0xffff) throw new Error("too many files for a zip archive")
  return Buffer.concat([...parts, list, end])
}
