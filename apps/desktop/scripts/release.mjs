// A release. There are two flows, one for each system, because a release is made from a
// Mac and the Linux files are added to it:
//
//   Mac     gives the app its new version and commits that, builds, signs and
//           notarizes the app for both kinds of Mac, sees that a Mac will take it,
//           tags the commit, pushes it, and publishes the release with what an
//           installed app updates itself from, and the source of the git it carries.
//   Linux   builds the Linux installers for the machine's own kind and attaches them
//           to a release the Mac has already published, with `gh release upload`. It
//           gives the app no version, makes no tag, pushes nothing and creates no
//           release: a Mac release and a Linux release cannot share a version, and a
//           release holding only Linux files would become "latest", which would break
//           the Mac download and the Mac updater.
//
// What the Mac release says has changed is the commits since the version before, a line
// to each. It needs a Mac and what notarizes the app: see scripts/dist.mjs. On Linux a
// deb takes dpkg-deb and ar, from binutils, an rpm rpmbuild, and a pacman package bsdtar
// (`sudo pacman -S dpkg rpm-tools` on Arch, which has bsdtar already).
//
//   On a Mac
//   npm run release                the next version: 0.0.4 after 0.0.3
//   npm run release -- 0.1.0       that version
//   npm run release -- --dry       see that everything is ready, and change nothing
//   npm run release -- --yes       without asking first
//
//   On Linux
//   npm run release                attach to the latest release the Mac published
//   npm run release -- --tag v0.1.0   ...to that release instead
//   npm run release -- --dry       see that everything is ready, and change nothing
//   npm run release -- --yes       without asking first
//
// Before it changes anything it sees that a release can be made at all: that nothing is
// uncommitted, that on a Mac this is main and has all that the remote has (on Linux the
// checkout is the tag the Mac released), that the tests pass, and that a project's tool
// is shut in, in the app as it is built (scripts/sandbox.mjs).
// On a Mac it also sees that the version is one nobody has, and that there is what
// notarizes the app; on Linux it sees that the release to attach to is there. Nothing is
// published until the app has been built and, on a Mac, a Mac has been seen to take it.
// If it stops after the version was committed, run it again with that version and it
// goes on from there.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"

import { gitSources } from "./licenses.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const RELEASE = path.join(ROOT, "release")

// `--tag v0.1.0` takes a value, which is not a version to release: keep it out of the
// positional arguments, where a Mac finds the version it is asked for.
const argv = process.argv.slice(2)
const valueOf = (name) => {
  const at = argv.indexOf(name)
  return at < 0 ? undefined : argv[at + 1]
}
const flags = argv.filter((arg) => arg.startsWith("--"))
const positional = []
for (let at = 0; at < argv.length; at++) {
  if (argv[at] === "--tag") {
    at++
    continue
  }
  if (!argv[at].startsWith("--")) positional.push(argv[at])
}
const [asked] = positional
const dry = flags.includes("--dry")
const sure = flags.includes("--yes")
const askedTag = valueOf("--tag")

/** Run a command and wait for it: what it said, where that is wanted, and how it ended. */
function run(command, args, { quiet = false, env } = {}) {
  const done = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: env ?? process.env,
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  })
  return {
    ok: done.status === 0,
    said: `${done.stdout ?? ""}${done.stderr ?? ""}`.trim(),
  }
}

/** The same, for a step the release cannot go on without. */
function must(command, args, options) {
  const done = run(command, args, options)
  if (!done.ok) stop(`"${command} ${args.join(" ")}" failed.`, done.said)
  return done.said
}

function stop(why, more = "") {
  console.error(`\n[release] ${why}${more ? `\n${more}` : ""}`)
  process.exit(1)
}

const step = (what) => console.log(`\n[release] ${what}`)

const pkg = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))

// --- Linux: attach the installers to the release the Mac made --------------------------

/** Build the Linux installers and put them on an already-published release. */
async function attachLinux() {
  // The names the Linux installers go up under, by the kind of machine they are made
  // on (scripts/dist.mjs names them so, and names the feed for the arch).
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const names = {
    x64: {
      appimage: "x86_64",
      deb: "amd64",
      pacman: "x64",
      rpm: "x86_64",
      feed: "latest-linux.yml",
    },
    arm64: {
      appimage: "arm64",
      deb: "arm64",
      pacman: "aarch64",
      rpm: "aarch64",
      feed: "latest-linux-arm64.yml",
    },
  }[arch]

  // The tag to attach to: the one asked for, or the newest release's. Which release is
  // newest is a Mac's to say, so on Linux it is only read.
  let tag = askedTag
  if (tag === undefined) {
    const released = run(
      "gh",
      ["release", "view", "--json", "tagName", "--jq", ".tagName"],
      { quiet: true }
    )
    if (released.ok) tag = released.said
    if (!tag) {
      tag = run("git", ["tag", "--list", "v*", "--sort=-v:refname"], {
        quiet: true,
      })
        .said.split("\n")
        .filter(Boolean)[0]
    }
  }
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? ""))
    stop(
      "There is no release to attach to. Name the tag a Mac released, as in --tag v0.1.0, or make the release from a Mac first."
    )
  const version = tag.slice(1)
  // The installers are named for the version in package.json, so the checkout has to be
  // the one the Mac released, or they would not be the files the tag is about.
  const { version: current } = pkg()
  if (current !== version)
    stop(
      `This checkout is at ${current}, but ${tag} is ${version}. Check out the commit the Mac released first: git fetch --tags && git checkout ${tag}.`
    )

  step(`Enclose ${version}: the Linux installers, onto ${tag}`)
  const wrong = []
  if (run("git", ["status", "--porcelain"], { quiet: true }).said)
    wrong.push("There are uncommitted changes: commit what is to go out first.")
  // A Mac releases from `main` and tags that commit. On Linux the checkout is the tag
  // itself, which is a detached HEAD, so `main` is not asked for here: what has to hold is
  // that the tree about to be built is the very commit ${tag} names.
  if (!run("git", ["fetch", "--quiet", "origin", "--tags"], { quiet: true }).ok)
    wrong.push("The remote could not be reached.")
  else {
    const released = run("git", ["rev-parse", `${tag}^{commit}`], {
      quiet: true,
    })
    const here = run("git", ["rev-parse", "HEAD"], { quiet: true })
    if (!released.ok || released.said !== here.said)
      wrong.push(
        `This is not the commit ${tag} names: git fetch --tags && git checkout ${tag}.`
      )
  }
  if (!run("gh", ["auth", "status"], { quiet: true }).ok)
    wrong.push("The GitHub CLI is not signed in: gh auth login.")
  if (!run("gh", ["release", "view", tag], { quiet: true }).ok)
    wrong.push(
      `There is no ${tag} release to attach to: make it from a Mac first.`
    )
  if (wrong.length > 0) stop(wrong.join("\n[release] "))

  console.log(
    `[release] ready: the tree is clean, ${tag} is checked out, and it is there to attach to`
  )

  const files = [
    `Enclose-${version}-${names.appimage}.AppImage`,
    `Enclose-${version}-${names.deb}.deb`,
    `Enclose-${version}-${names.pacman}.pacman`,
    `Enclose-${version}-${names.rpm}.rpm`,
    names.feed,
  ]
  if (dry) {
    console.log(
      `[release] (dry) would test, see that a tool is shut in, build, and upload ${files.join(", ")} to ${tag}, changing nothing`
    )
    return
  }
  if (!sure) {
    const ask = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer = await ask.question(
      `[release] Build the Linux installers and attach them to ${tag}? [y/N] `
    )
    ask.close()
    if (!/^y(es)?$/i.test(answer.trim())) stop("Nothing was done.")
  }

  step("the tests")
  must("npm", ["test"])

  // A project's tool is run without anyone having read it, and what keeps it in can only
  // be seen to hold in the app as it is built: so it is built, and a tool that tries to
  // get out is run in it. (The installers are built again below, from the same files.)
  step("that a project's tool is shut in")
  must("npm", ["run", "build"])
  must("npm", ["run", "sandbox"])

  step("the app: this takes a few minutes")
  if (!run("npm", ["run", "dist"]).ok)
    stop("The Linux installers were not made. Nothing was uploaded.")

  const missing = files.filter(
    (file) => !fs.existsSync(path.join(RELEASE, file))
  )
  if (missing.length > 0)
    stop(
      `Not everything was made: ${missing.join(", ")}. A deb takes dpkg-deb and ar (from binutils), an rpm rpmbuild, and a pacman package bsdtar. Nothing was uploaded.`
    )

  step(`${tag}: the Linux files, attached`)
  must("gh", [
    "release",
    "upload",
    tag,
    ...files.map((file) => path.join("release", file)),
    "--clobber",
  ])

  console.log(`\n[release] the Linux installers are on ${tag}.`)
}

// --- what is to be released -------------------------------------------------------------

if (process.platform === "linux") {
  await attachLinux()
} else {
  await publishMac()
}

/** On a Mac: give the app its version, build, notarize, tag, push and publish. */
async function publishMac() {
  const { version: current, productName } = pkg()
  const NUMBERED = /^\d+\.\d+\.\d+$/
  if (asked !== undefined && !NUMBERED.test(asked))
    stop(`"${asked}" is not a version: three numbers, as in 0.1.0.`)
  const next =
    asked ?? current.replace(/\d+$/, (patch) => String(Number(patch) + 1))
  // the version is this one already: it was committed by a run that then stopped
  const resumed = next === current
  const numbers = (version) => version.split(".").map(Number)
  const later = numbers(next).some(
    (number, place) =>
      number > numbers(current)[place] &&
      numbers(next)
        .slice(0, place)
        .every((earlier, at) => earlier === numbers(current)[at])
  )
  if (!resumed && !later)
    stop(`${next} is not after ${current}, which is the version now.`)
  const tag = `v${next}`
  /** the version before, which is where what has changed is listed from */
  const before = resumed
    ? run(
        "git",
        ["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD^"],
        {
          quiet: true,
        }
      ).said
    : `v${current}`

  // --- that a release can be made -------------------------------------------------------

  step(
    `Enclose ${next}${resumed ? ", going on from where it stopped" : ` (now ${current})`}`
  )
  const wrong = []
  if (process.platform !== "darwin") wrong.push("This is not a Mac.")
  const notarized =
    process.env.APPLE_KEYCHAIN_PROFILE ||
    (process.env.APPLE_API_KEY &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER)
  if (!notarized)
    wrong.push(
      "Nothing to notarize the app with: set APPLE_KEYCHAIN_PROFILE to a profile kept by `xcrun notarytool store-credentials`."
    )
  if (run("git", ["status", "--porcelain"], { quiet: true }).said)
    wrong.push("There are uncommitted changes: commit what is to go out first.")
  if (run("git", ["branch", "--show-current"], { quiet: true }).said !== "main")
    wrong.push("This is not the main branch.")
  if (
    !run("git", ["fetch", "--quiet", "origin", "main", "--tags"], {
      quiet: true,
    }).ok
  )
    wrong.push("The remote could not be reached.")
  else if (
    run("git", ["rev-list", "--count", "HEAD..origin/main"], { quiet: true })
      .said !== "0"
  )
    wrong.push("The remote's main has commits this one has not: pull first.")
  if (run("git", ["tag", "--list", tag], { quiet: true }).said)
    wrong.push(`There is a ${tag} already.`)
  if (!run("gh", ["auth", "status"], { quiet: true }).ok)
    wrong.push("The GitHub CLI is not signed in: gh auth login.")
  if (resumed && !before) wrong.push("No version before this one was found.")
  if (wrong.length > 0) stop(wrong.join("\n[release] "))

  console.log(
    `[release] ready: main is clean and up to date, and there is no ${tag} yet`
  )

  // How far behind tscircuit's own releases the one boards are built with is: it is kept
  // at one version (kit/board.mjs), so that boards build alike from one day to the next,
  // and moved on by hand, when there is a reason to, with a few boards built again to see.
  // Only said: it stops nothing.
  {
    const board = fs.readFileSync(
      path.join(ROOT, "..", "..", "kit", "board.mjs"),
      "utf8"
    )
    const kept = /const TSCIRCUIT = "tscircuit@([^"]+)"/.exec(board)?.[1]
    const versions = run("npm", ["view", "tscircuit", "versions", "--json"], {
      quiet: true,
    })
    let since = -1
    let newest = null
    try {
      // (each comes out twice, the second time as "-libonly": those are left out)
      const all = JSON.parse(versions.said).filter((one) => !one.includes("-"))
      newest = all.at(-1)
      since = all.length - 1 - all.indexOf(kept)
    } catch {
      // npm could not be asked: nothing is said
    }
    if (kept && newest && since >= 0)
      console.log(
        since === 0
          ? `[release] tscircuit: boards are built with ${kept}, the newest`
          : `[release] tscircuit: boards are built with ${kept}; ${newest} is out, ${since} release${since === 1 ? "" : "s"} on`
      )
  }
  if (dry) {
    console.log(
      `[release] (dry) would test, see that a tool is shut in, ${resumed ? "" : `commit "chore: ${next}", `}build and notarize, tag ${tag}, push, and publish, listing the commits since ${before}`
    )
    return
  }
  if (!sure) {
    const ask = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer = await ask.question(
      `[release] Build, push and publish Enclose ${next}? [y/N] `
    )
    ask.close()
    if (!/^y(es)?$/i.test(answer.trim())) stop("Nothing was done.")
  }

  // --- the release ------------------------------------------------------------------------

  step("the tests")
  must("npm", ["test"])

  // A project's tool is run without anyone having read it, and what keeps it in can only
  // be seen to hold in the app as it is built: so it is built, and a tool that tries to
  // get out is run in it. (What is given out is built again below, from the same files
  // with their new version.)
  step("that a project's tool is shut in")
  must("npm", ["run", "build"])
  must("npm", ["run", "sandbox"])

  if (!resumed) {
    step(`the version: ${next}`)
    must("npm", ["version", next, "--no-git-tag-version"])
    must("git", ["commit", "-am", `chore: ${next}`])
  }
  const again = `Run it again to go on from here: npm run release -- ${next}`

  step("the app, signed and notarized: this takes a few minutes")
  if (!run("npm", ["run", "dist"]).ok)
    stop("The app was not made. Nothing has been pushed or published.", again)

  step("that a Mac will take it")
  for (const folder of ["mac-arm64", "mac"]) {
    const app = path.join(RELEASE, folder, `${productName}.app`)
    const { said } = run("spctl", ["-a", "-t", "exec", "-vv", app], {
      quiet: true,
    })
    console.log(said)
    if (!/: accepted/.test(said) || !/Notarized Developer ID/.test(said))
      stop(
        `A Mac would not take ${folder}. Nothing has been pushed or published.`,
        again
      )
  }

  // The source of the git the app carries goes up beside it, as the GPL asks of whoever
  // passes git on: Git's own, and how dugite-native built it (see scripts/licenses.mjs,
  // whose third-party licenses say it is there).
  step("the source of the git it carries")
  const sources = gitSources()
  for (const { file, url } of sources) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`it answered ${response.status}`)
      fs.writeFileSync(
        path.join(RELEASE, file),
        Buffer.from(await response.arrayBuffer())
      )
    } catch (error) {
      stop(
        `${url} could not be fetched: ${error.message}. Nothing has been pushed or published.`,
        again
      )
    }
  }

  const archives = fs
    .readdirSync(RELEASE)
    .filter(
      (file) =>
        file.startsWith(`Enclose-${next}-`) && /\.zip(\.blockmap)?$/.test(file)
    )
  const files = [
    "Enclose-arm64.dmg",
    "Enclose-x64.dmg",
    ...archives,
    "latest-mac.yml",
    ...sources.map((source) => source.file),
  ]
  const missing = [
    ...files.filter((file) => !fs.existsSync(path.join(RELEASE, file))),
    ...(archives.length === 4
      ? []
      : ["the four archives an installed app updates from"]),
  ]
  if (missing.length > 0)
    stop(
      `Not everything was made: ${missing.join(", ")}. Nothing has been pushed or published.`,
      again
    )

  // What the release says has changed: the commits since the version before, a line to
  // each with what it is known by, the oldest first. The one that only gave the app its
  // version is not among them. A commit by someone who is not a collaborator on the
  // repository says who it is by, and someone whose first it is is named under the list,
  // as GitHub's own notes do. Under them is where the two versions are set side by side.
  // (Worked out before anything is pushed, so that nothing can stop between the two.)
  const [repository, slug] = must(
    "gh",
    [
      "repo",
      "view",
      "--json",
      "url,nameWithOwner",
      "--jq",
      ".url, .nameWithOwner",
    ],
    { quiet: true }
  ).split("\n")
  const collaborators = new Set(
    must("gh", ["api", `repos/${slug}/collaborators`, "--jq", ".[].login"], {
      quiet: true,
    }).split("\n")
  )
  /** the GitHub account a commit is by, or "" where GitHub knows of none */
  const authorOf = (sha) =>
    must(
      "gh",
      ["api", `repos/${slug}/commits/${sha}`, "--jq", '.author.login // ""'],
      {
        quiet: true,
      }
    )
  /** whether an account has a commit in the version before */
  const hadCommits = (login) =>
    must(
      "gh",
      [
        "api",
        `repos/${slug}/commits?author=${login}&sha=${before}&per_page=1`,
        "--jq",
        "length",
      ],
      { quiet: true }
    ) !== "0"
  // (GitHub knows only of those pushed: one that is not yet, as the one that gave the app
  // its version is not, is by whoever is releasing it, who is not someone outside)
  const pushed = new Set(
    must("git", ["rev-list", `${before}..origin/main`], { quiet: true }).split(
      "\n"
    )
  )
  const commits = must(
    "git",
    // (a merge is listed by what it brings in, which is listed for itself)
    [
      "log",
      "--reverse",
      "--no-merges",
      "--format=%H%x09%h%x09%s",
      `${before}..HEAD`,
    ],
    { quiet: true }
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([, , subject]) => subject !== `chore: ${next}`)
    .map(([sha, short, subject]) => {
      const login = pushed.has(sha) ? authorOf(sha) : ""
      return {
        short,
        subject,
        outside: login && !collaborators.has(login) ? login : "",
      }
    })
  const newcomers = new Map()
  for (const { short, subject, outside } of commits)
    if (outside && !newcomers.has(outside) && !hadCommits(outside))
      // the pull request it came in by, where the subject names one
      newcomers.set(
        outside,
        subject.match(/\(#\d+\)$/)?.[0].slice(1, -1) ?? short
      )
  const notes = [
    ...commits.map(
      ({ short, subject, outside }) =>
        `- ${subject} (${short})${outside ? `, by @${outside}` : ""}`
    ),
    ...(commits.length > 0 ? [""] : []),
    ...(newcomers.size > 0
      ? [
          `**New contributors**: ${[...newcomers]
            .map(
              ([login, first]) =>
                `@${login} made their first contribution in ${first}`
            )
            .join("; ")}`,
          "",
        ]
      : []),
    `**Full Changelog**: ${repository}/compare/${before}...${tag}`,
  ].join("\n")

  step(`${tag}, pushed`)
  must("git", ["tag", tag])
  must("git", ["push", "origin", "main", tag])

  step("the release, published")
  must("gh", [
    "release",
    "create",
    tag,
    ...files.map((file) => path.join("release", file)),
    "--title",
    `Enclose ${next}`,
    "--notes",
    notes,
  ])

  console.log(`\n[release] Enclose ${next} is out.`)
}
