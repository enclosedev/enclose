// What of other people's code goes out with the app, and under what terms: written down
// at each build, in one file the app carries beside it and opens from its settings
// (THIRD-PARTY-LICENSES.txt). It is everything that is bundled into the window and into
// the page of an assembly guide, as the bundlers say they took it, and every package the
// app's own process loads as it is, from node_modules: each one by its name, its version
// and its license, and with the license's own text, where the package has it. And the
// programs the app carries that are no package of node_modules': git and Git LFS.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const HERE = path.resolve(import.meta.dirname, "..")
/** Where it is written: beside the Electron side, which the app is packed with. */
export const LICENSES = path.join(
  HERE,
  "dist-electron",
  "THIRD-PARTY-LICENSES.txt"
)

/** What a file of a license is called, as packages name it. */
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i

/** The package a file in node_modules is of: its folder, under the last node_modules. */
export function packageOf(file) {
  const parts = file.split(/[\\/]/)
  const at = parts.lastIndexOf("node_modules")
  if (at < 0) return null
  const scoped = parts[at + 1]?.startsWith("@")
  const name = scoped ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1]
  if (!name) return null
  return path.join(parts.slice(0, at + 1).join(path.sep) || path.sep, name)
}

/**
 * The packages the app's own process loads from node_modules as it runs: the app's
 * dependencies and all of theirs, as the lockfile has them installed, but for what the
 * build leaves out (the Claude Code the agent SDK brings, which the app does not use).
 */
function shipped() {
  const lock = JSON.parse(
    fs.readFileSync(path.join(HERE, "package-lock.json"), "utf8")
  )
  return Object.entries(lock.packages ?? {})
    .filter(([where, entry]) => where && !entry.dev && !entry.link)
    .map(([where]) => path.join(HERE, where))
    .filter(
      (folder) =>
        fs.existsSync(path.join(folder, "package.json")) &&
        !/@anthropic-ai[\\/]claude-agent-sdk-/.test(folder)
    )
}

/**
 * The programs dugite brings, as dugite-native builds them: git, and Git LFS in it. Their
 * licenses' texts are kept in licenses/, as they are at these versions, since the
 * programs come with none. Where dugite brings others, the build stops until these are
 * made to say what it brings (see `checkPrograms`).
 */
export const PROGRAMS = {
  build: "v2.53.0-4",
  git: "2.53.0",
  lfs: "3.7.1",
}

const DUGITE = path.join(HERE, "node_modules", "dugite")

/** The dugite-native release dugite fetches, as its own list of them says: `v2.53.0-4`. */
export function dugiteBuild() {
  const listed = JSON.parse(
    fs.readFileSync(path.join(DUGITE, "script", "embedded-git.json"), "utf8")
  )
  const builds = new Set(
    Object.values(listed).map(
      (one) => /\/download\/(v[^/]+)\//.exec(one.url ?? "")?.[1] ?? null
    )
  )
  return builds.size === 1 ? [...builds][0] : null
}

/**
 * That what is written of git and Git LFS is what dugite brings: the release it fetches,
 * and the Git LFS in it, where that can be run here (it is fetched for one kind of Mac at
 * a time, and asked its version where it is there).
 */
export function checkPrograms() {
  const build = dugiteBuild()
  if (build !== PROGRAMS.build)
    throw new Error(
      `dugite brings git from dugite-native ${build}, and the third-party licenses say ${PROGRAMS.build}. ` +
        "Update PROGRAMS in scripts/licenses.mjs, and the texts in licenses/ to those versions."
    )
  const lfs = path.join(DUGITE, "git", "libexec", "git-core", "git-lfs")
  if (!fs.existsSync(lfs)) return
  let said
  try {
    said = execFileSync(lfs, ["version"], { encoding: "utf8" })
  } catch {
    return
  }
  const version = /git-lfs\/(\S+)/.exec(said)?.[1]
  if (version !== PROGRAMS.lfs)
    throw new Error(
      `dugite brings Git LFS ${version}, and the third-party licenses say ${PROGRAMS.lfs}. ` +
        "Update PROGRAMS in scripts/licenses.mjs, and licenses/git-lfs to that version."
    )
}

/**
 * What of git's source goes up with each release, beside the app (scripts/release.mjs):
 * Git's own, and dugite-native's, which is how it was built. Each is the archive GitHub
 * makes of the tag.
 */
export function gitSources() {
  const { build, git } = PROGRAMS
  return [
    {
      file: `git-${git}-source.tar.gz`,
      url: `https://github.com/git/git/archive/refs/tags/v${git}.tar.gz`,
    },
    {
      file: `dugite-native-${build}-source.tar.gz`,
      url: `https://github.com/desktop/dugite-native/archive/refs/tags/${build}.tar.gz`,
    },
  ]
}

const textOf = (...file) =>
  fs.readFileSync(path.join(HERE, "licenses", ...file), "utf8").trim()

/**
 * git and Git LFS as they are written down: git with where its source is, as the GPL
 * asks of whoever passes it on, which is beside the app in each release.
 */
function programs() {
  const { build, git, lfs } = PROGRAMS
  const [own, built] = gitSources()
  return [
    {
      name: "Git",
      version: git,
      license: "GPL-2.0-only",
      homepage: "https://git-scm.com",
      text: [
        "The git the app carries, with what goes with it (scalar, git-shell and the rest of",
        `git-core), is built by dugite-native ${build} from Git's own source. That source,`,
        "and how it was built, go out beside the app, as the GNU General Public License,",
        "version 2, asks: they are in each release of Enclose, with the app itself, at",
        "https://github.com/enclosedev/enclose/releases",
        "",
        `  Git's source:       ${own.file}`,
        `                      (also at https://github.com/git/git/tree/v${git})`,
        `  How it was built:   ${built.file}`,
        `                      (also at https://github.com/desktop/dugite-native/tree/${build})`,
        "",
        textOf("git", "COPYING"),
      ].join("\n"),
    },
    {
      name: "Git LFS",
      version: lfs,
      license: "MIT",
      homepage: `https://github.com/git-lfs/git-lfs/tree/v${lfs}`,
      text: textOf("git-lfs", "LICENSE.md"),
    },
  ]
}

/** A package as it is written down: its name, version, license and the license's text. */
function entryOf(folder) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "package.json"), "utf8")
  )
  const license =
    typeof manifest.license === "string"
      ? manifest.license
      : (manifest.license?.type ??
        manifest.licenses?.map((one) => one.type ?? one).join(" OR ") ??
        "not stated")
  const files = fs
    .readdirSync(folder)
    .filter((name) => LICENSE_FILE.test(name))
    .sort()
  const text = files
    .map((name) => fs.readFileSync(path.join(folder, name), "utf8").trim())
    .join("\n\n")
  return {
    name: manifest.name ?? path.basename(folder),
    version: manifest.version ?? "",
    license,
    homepage:
      manifest.homepage ??
      (typeof manifest.repository === "string"
        ? manifest.repository
        : manifest.repository?.url) ??
      "",
    text,
  }
}

/**
 * Write the file, from the files the bundlers took (`bundled`, absolute paths) and the
 * packages the app loads as it runs. Returns how many packages are in it.
 */
export function writeLicenses(bundled) {
  const folders = new Set(shipped())
  for (const file of bundled) {
    const folder = packageOf(file)
    if (folder && fs.existsSync(path.join(folder, "package.json")))
      folders.add(folder)
  }
  const entries = new Map()
  for (const folder of folders) {
    const entry = entryOf(folder)
    entries.set(`${entry.name}@${entry.version}`, entry)
  }
  checkPrograms()
  for (const entry of programs())
    entries.set(`${entry.name}@${entry.version}`, entry)
  const sorted = [...entries.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const rule = "-".repeat(78)
  const written = [
    "Enclose is free software under the GNU AGPL, version 3 (see its LICENSE). It is",
    "built with the work of others, which goes out with it under their own terms: each",
    "package and program below, by its name and version, with its license, and that",
    "license's text where it has one.",
    "",
    ...sorted.flatMap((entry) => [
      rule,
      `${entry.name} ${entry.version}`,
      `License: ${
        entry.license === "not stated" && entry.text
          ? "as its text below says"
          : entry.license
      }`,
      ...(entry.homepage ? [entry.homepage.replace(/^git\+/, "")] : []),
      ...(entry.text
        ? ["", entry.text]
        : /^[A-Za-z0-9.-]+$/.test(entry.license)
          ? [
              "",
              `It comes with no text of its license: the ${entry.license} license is at https://spdx.org/licenses/${entry.license}.html`,
            ]
          : []),
      "",
    ]),
  ].join("\n")
  fs.mkdirSync(path.dirname(LICENSES), { recursive: true })
  fs.writeFileSync(LICENSES, written)
  return sorted.length
}
