// The app as something to install. On a Mac: the production build made into
// Enclose (Alpha).app, and that into a disk image to download, one for each kind of Mac.
// On Linux: an AppImage, a deb, a pacman package and an rpm, for the machine's own kind
// (or the one asked for). Both write release/, and with the installers what an installed
// app makes itself the next version from: latest-mac.yml on a Mac, latest-linux.yml on
// Linux (latest-linux-arm64.yml where the machine is aarch64).
//   npm run dist                build, then make installers for this system
//   npm run dist -- --arm64     ...only the one for Apple silicon (--x64: for Intel);
//                               on Linux, only the installers for an aarch64 machine
//   npm run dist -- --appimage  on Linux, only the AppImage (--deb, --pacman, --rpm:
//                               likewise)
// (made, and no more: a release is made from a Mac, as docs/development.md says; the
// Linux files are then uploaded to that release, and it is not a release of their own.)
//
// Only the AppImage updates itself in place. On Linux, electron-updater tells
// DebUpdater, RpmUpdater or PacmanUpdater from the `package-type` file electron-builder
// writes into the app for those targets, and writes each of them into latest-linux.yml,
// which an installed app reads.
//
// Two things keep it to the AppImage, and they are at two different steps.
//
// The `publish: null` under deb, rpm and pacman below keeps those three out of the feed:
// the step that writes latest-linux.yml does ask a target for its own options, so they get
// no entry and the feed names the AppImage alone.
//
// It does not reach the step before that one. FpmTarget hands
// getAppUpdatePublishConfiguration its own options, and that function asks for the
// platform's instead, so the platform's GitHub provider resolves there: all three are
// still written with a `package-type` file naming their own kind and an app-update.yml
// beside it (app-builder-lib 26.15.3: FpmTarget.js, PublishManager.js). On Linux
// electron-updater reads that file before anything else, and DebUpdater, RpmUpdater or
// PacmanUpdater is what it then uses in place of the AppImage updater. So an installed
// deb, rpm or pacman asks for an update of its own kind, in a feed that has no file of
// that kind.
//
// What keeps that from happening is the app: it asks for a newer version only where it was
// run as an AppImage (`process.env.APPIMAGE`, electron/main.ts), and then with the
// AppImage's own updater, named, rather than the one the file would pick. The AppImage
// goes out without the file as it is: the three are made one at a time, once it is
// finished (FpmTarget is not built alongside the others: packageInDistributableFormat in
// platformPackager.js). Naming the updater keeps that from resting on the order.
//
// A Mac opens an app that was downloaded only if a developer Apple knows has signed it
// and Apple has looked it over (notarized it). Both are done here where they can be:
//   signed      with the "Developer ID Application" certificate in the keychain, which
//               is found by itself
//   notarized   with what APPLE_KEYCHAIN_PROFILE names, a profile kept by `xcrun
//               notarytool store-credentials`; or with an App Store Connect key, given
//               as APPLE_API_KEY (its file), APPLE_API_KEY_ID and APPLE_API_ISSUER
// With neither the app is still made, and runs on the Mac that made it.
import { arch as here } from "node:os"
import { resolve } from "node:path"

import { Arch, Platform, build } from "electron-builder"

import { prepareGit } from "./git.mjs"

if (process.platform !== "darwin" && process.platform !== "linux") {
  console.error(
    "[dist] installers are made for macOS and Linux only: run this on one of those."
  )
  process.exit(1)
}

const ROOT = resolve(import.meta.dirname, "..")

const asked = ["arm64", "x64"].filter((arch) =>
  process.argv.includes(`--${arch}`)
)
const host = process.arch === "arm64" ? "arm64" : "x64"
const archs =
  asked.length > 0
    ? asked
    : process.platform === "darwin"
      ? ["arm64", "x64"]
      : [host]

const notarized = Boolean(
  process.env.APPLE_KEYCHAIN_PROFILE ||
  (process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER)
)

const linuxKinds = ["AppImage", "deb", "pacman", "rpm"]
const askedKinds = linuxKinds.filter((kind) =>
  process.argv.includes(`--${kind.toLowerCase()}`)
)
let kinds = linuxKinds

/** the update feed electron-builder writes for a Linux arch */
function feedFor(arch) {
  return arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml"
}

// what every system knows the app by, and files what it lets the app do under: not to be
// changed once people have the app. It is shared by both systems, so that the publish
// provider (which is why latest-mac.yml and latest-linux.yml are made) and the build's
// own files are the same wherever it is made.
const shared = {
  appId: "dev.enclose.desktop",
  copyright: "Copyright © 2026 Glauber",
  directories: { output: "release" },
  // The build, and of the icons the ones a window is given. Of node_modules, what the
  // Electron side loads as it runs comes along by itself: the package's dependencies,
  // which is why what Vite bundles into the window is listed as a devDependency.
  files: [
    "dist",
    "dist-electron",
    "icons/icon-512.png",
    "icons/icon.ico",
    "!**/*.map",
    // The agent SDK brings a Claude Code of its own, a quarter of a gigabyte of it.
    // The app runs the one on the user's machine (see `running` in electron/claude.ts).
    "!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**",
  ],
  // The git a project's history is kept with is a program, run from where it is: out
  // of the app's archive, as a folder beside it. It is fetched for each kind of Mac or
  // Linux as that one is made (scripts/git.mjs). dugite ships git for Linux too, so the
  // same beforePack and the same `prepareGit` serve both systems; the files
  // `prepareGit` takes out (Git Credential Manager and its libraries) are named for
  // macOS and Windows, so on Linux it fetches git and leaves it much as it is, which is
  // only ever more than is wanted.
  asarUnpack: ["**/node_modules/dugite/git/**"],
  beforePack: async ({ arch }) => prepareGit(Arch[arch]),
  // The kit goes in as it is, beside the app's archive and not in it: Python reads it,
  // and an agent copies from it (`TOP` in electron/main.ts is where it is looked for).
  extraResources: [
    {
      from: "../../kit",
      to: "kit",
      filter: ["**/*", "!**/__pycache__", "!**/.DS_Store"],
    },
    { from: "../../themes", to: "themes", filter: ["*.json"] },
    // what of other people's code goes out with the app, and under what terms:
    // written by the build (scripts/licenses.mjs), and opened from the settings
    {
      from: "dist-electron/THIRD-PARTY-LICENSES.txt",
      to: "THIRD-PARTY-LICENSES.txt",
    },
  ],
  // Where an app that is installed looks for the versions after it: the releases of
  // the app's repository, the latest of them. It is written into the app, and is why
  // latest-mac.yml (or latest-linux.yml) is made.
  publish: { provider: "github", owner: "enclosedev", repo: "enclose" },
  // What the app's own Electron is let do, set in it for good (its fuses): it is never
  // Node for whoever starts it with ELECTRON_RUN_AS_NODE, takes no NODE_OPTIONS and no
  // --inspect, and loads the app from its archive alone. (Nothing of the app runs
  // itself as Node: the agents are the user's own programs, and git is git.) Checking
  // the archive against what the app was signed with is left out for now: it has not
  // been tried with a release yet, and on Linux Electron cannot do it at all.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },
}

let made
let feeds
try {
  if (process.platform === "darwin") {
    made = await build({
      projectDir: ROOT,
      targets: Platform.MAC.createTarget(
        ["dmg", "zip"],
        ...archs.map((arch) => Arch[arch])
      ),
      publish: "never",
      config: {
        ...shared,
        mac: {
          category: "public.app-category.graphics-design",
          icon: "icons/icon.icns",
          // (by the name alone: what the app is shown as has spaces in it, and a download
          // is linked to by this)
          artifactName: "Enclose-${version}-${arch}.${ext}",
          notarize: notarized,
          // A Mac asks its user before an app, or anything the app runs, reads one of these
          // folders, and shows them this as the reason.
          extendInfo: {
            NSDocumentsFolderUsageDescription:
              "Enclose keeps its projects in your Documents folder, and opens the ones you have there.",
            NSDesktopFolderUsageDescription:
              "Enclose opens the projects and CAD files you have on your Desktop.",
            NSDownloadsFolderUsageDescription:
              "Enclose opens the projects and CAD files you have in Downloads.",
          },
        },
        // The window the disk image opens: the app, and the Applications folder it is
        // dragged to, with an arrow between them. The arrow is in the picture behind
        // (installer/background.svg, which `npm run icons` makes pictures of), and the
        // window is the size of that picture. It is a light one: Finder writes the names
        // under the icons in black whatever is behind them.
        dmg: {
          // The disk images are named for the kind of Mac and not for the version, so that
          // the newest of each is always at one address: the site's download button, and
          // enclose.dev/download, go to
          //   github.com/enclosedev/enclose/releases/latest/download/Enclose-arm64.dmg
          // (and -x64), which GitHub answers with whichever release is the latest. The
          // archives an installed app updates from keep their versions: latest-mac.yml
          // names them, and nothing else has to find them.
          artifactName: "Enclose-${arch}.${ext}",
          title: "${productName}",
          background: "installer/background.png",
          iconSize: 128,
          iconTextSize: 13,
          contents: [
            { x: 180, y: 166, type: "file" },
            { x: 480, y: 166, type: "link", path: "/Applications" },
          ],
        },
      },
    })
    feeds = ["latest-mac.yml"]
  } else {
    // Building a deb takes dpkg-deb and ar (from binutils), an rpm takes rpmbuild, and a
    // pacman package takes bsdtar (from libarchive, which Arch has already): on Arch the
    // rest come from the system (`sudo pacman -S dpkg rpm-tools`). An AppImage needs
    // nothing but what npm installs.
    kinds = askedKinds.length > 0 ? askedKinds : linuxKinds
    made = await build({
      projectDir: ROOT,
      targets: Platform.LINUX.createTarget(
        kinds,
        ...archs.map((arch) => Arch[arch])
      ),
      publish: "never",
      config: {
        ...shared,
        // The AppImage's own launcher. The one electron-builder uses unless told otherwise
        // needs libfuse2, which Ubuntu 22.04 and later leave out, and on arm64 it is linked
        // to an unversioned libz.so, which only the zlib development packages carry: on a
        // stock Ubuntu, Debian or Fedora the arm64 AppImage would not start. This one is
        // static, and needs neither: only the fusermount a desktop already has.
        toolsets: { appimage: "1.0.3" },
        linux: {
          category: "Graphics",
          icon: "icons/icon-512.png",
          // What the app is run as, and what the file manager knows the window by: the
          // desktop entry is named after `desktopName` in package.json and the window is
          // linked to it (syncDesktopName), instead of showing a second icon.
          executableName: "enclose",
          syncDesktopName: true,
          // The contact stamped into the deb, pacman and rpm metadata. fpm takes it
          // as it is; without it (or an author email in package.json) those targets
          // refuse to build.
          maintainer: "Enclose (https://enclose.dev)",
          // The names keep their versions: latest-linux.yml names the archives an
          // installed app updates from, and nothing else has to find them.
          artifactName: "Enclose-${version}-${arch}.${ext}",
          // The entry the desktop shows the app under. `desktopName` in package.json
          // names the entry, so a running window is linked to it. (No `MimeType`: the
          // app does not open a CAD file handed to it by the file manager, so it does
          // not claim to.)
          desktop: {
            entry: {
              Name: "Enclose (Alpha)",
              Comment: "CAD workbench with a Claude handoff",
            },
          },
        },
        // Only the AppImage updates itself in place. This keeps these three out of the
        // update feed and does not keep them out of the `package-type` file they are
        // written with, which is written at a step this does not reach (see the top of this
        // file). What keeps a deb, rpm or pacman install from asking for an update of its
        // own kind is the app.
        deb: { publish: null },
        rpm: { publish: null },
        pacman: {
          publish: null,
          // electron-builder's own pacman dependencies (app-builder-lib FpmTarget, the
          // `getDefaultDepends` list) name `http-parser` and `libappindicator-gtk3`,
          // neither of which Arch's repositories still carry: http-parser was dropped,
          // and the app sets no status icon, so no indicator library is needed. This is
          // that list with those two left out, and nothing else changed. It is written
          // out only because there is no way to add to the defaults, only to replace
          // them; when electron-builder's list changes, this has to change with it.
          depends: [
            "c-ares",
            "ffmpeg",
            "gtk3",
            "libevent",
            "libvpx",
            "libxslt",
            "libxss",
            "minizip",
            "nss",
            "re2",
            "snappy",
            "libnotify",
          ],
        },
      },
    })
    // electron-updater reads latest-linux.yml on x64 and latest-linux-arm64.yml on
    // arm64 (app-builder-lib names the file for the arch: updateInfoBuilder.js).
    feeds = [...new Set(archs.map(feedFor))]
  }
} finally {
  // and the git of this machine's own kind again, for running the app from the checkout
  prepareGit(here())
}

for (const file of [
  ...made.filter((one) => !/\.(yml|yaml)$/.test(one)),
  ...feeds.map((feed) => resolve(ROOT, `release/${feed}`)),
])
  console.log(`[dist] ${file}`)
if (process.platform === "darwin") {
  if (archs.length < 2)
    console.warn(
      "[dist] made for one kind of Mac only: latest-mac.yml names no update for the other, and is not one to release"
    )
  if (!notarized)
    console.warn(
      "[dist] not notarized: a Mac that downloads this will not open it. Set APPLE_KEYCHAIN_PROFILE, or the APPLE_API_KEY three (see the top of scripts/dist.mjs)"
    )
} else {
  if (!kinds.includes("AppImage"))
    console.warn(
      "[dist] no AppImage: no update feed was written, so nothing here offers an in-app update"
    )
  if (asked.length > 0 && archs.length < 2)
    console.warn(
      `[dist] made for ${archs.join(", ")} only: there is no feed for the other Linux arch here, and these files are not one to release`
    )
}
