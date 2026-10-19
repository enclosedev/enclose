# Working on Enclose

[CONTRIBUTING.md](../CONTRIBUTING.md) says what to ask before you start and what a pull
request needs.

## Running it

You need Node 22 or newer. It is tried on macOS and on Arch Linux. The app is in
[`apps/desktop`](../apps/desktop), and every command here is run from there.

```
cd apps/desktop
npm install
npm run dev                      # open the app
npm run dev -- path/to/project   # ...with that folder, or CAD file, opened as a project
```

`npm run build && npm start` runs the production build instead of the dev loop.

## Checks

```
npm run typecheck
npm run lint
npm test
npm run format      # .ts and .tsx only
```

The first three run on each pull request and each push to main, on Linux
([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

One check is of the app itself, and not of its code, so it is no part of `npm test`:

```
npm run build && npm run sandbox    # the built app
npm run sandbox -- --dev            # the app as `npm run dev` serves it
```

A [project's tool](project-tools.md) is code that came with a folder, and the app runs it
without anyone having read it. [`scripts/sandbox.mjs`](../apps/desktop/scripts/sandbox.mjs)
sees that it is shut in. It copies an example into a scratch folder, puts one tool in it
that tries every way out a worker comes with, each at a listening post on your own
machine, and runs the app on that with no window shown and none of your own projects or
settings. It passes if the post heard nothing and the tool was refused each way, and
says which was not otherwise. Run both after a change to how tools are run
(`src/lib/custom-tools`) or to the window's policy (`shared/content-policy.ts`): the two
make the tool's worker differently.

## Where things are

```
apps/
  desktop/     the app
    electron/  its own process: window, project list, the line to the agents
    src/       the window: project cards, 3D view and its tools, conversation; and
               the page an assembly guide is opened as (src/guide), built by itself
    shared/    types and the manifest format, used by both sides, and the list of
               examples
    scripts/   dev loop, production build, the installer, the icon's sizes, the
               reference scenes, and the examples' archives
    icons/     the app's icon, in the sizes each system asks for
    installer/ the picture behind the window the installer opens
  marketing/   the website, a Modulato site with its own README
docs/          how the app works, a page to a subject
examples/      projects to open and try things on: a table clock, with a tool and
               a circuit board, a counter stool, to see beside a person, a clip lamp
               on a wall shelf, with its wire, and an open-source robot arm, read
               from its CAD file and steered by a tool
kit/           the exporter a project copies in to write its model (Python), the
               screws it can put in one, the app's own reference scenes, each drawn
               in code and kept as built, the figure of a person that stands in some
               of them, how a project's own tools and its assembly guides are
               written, and how its circuit boards are made, with the script that
               builds them
spikes/        experiments kept for their measurements
themes/        the themes there are beside the app's own colours, a file to each,
               and what is changed of those (default.json)
```

Run from a checkout, the app finds `kit/`, `themes/` and `examples/` at the top of the
repository, two folders up from itself. Installed, it has the kit and the themes among
its own resources and no examples: those it fetches.

## What is built from what

| Command | What it makes |
|---|---|
| `npm run icons` | The icon's other sizes, from `icons/icon.png`, the icon of the app as it is run from a checkout, and the picture behind the installer's window (the `.icns` files and that picture take a Mac; the PNG and the ICO are made anywhere) |
| `npm run scenes` | The app's reference scenes, from [`kit/scenes`](../kit/scenes) |
| `npm run examples` | The examples' archives, from [`examples/`](../examples) |
| `npm run build` | The window in `dist/` and the Electron side in `dist-electron/`, with `THIRD-PARTY-LICENSES.txt`: every package bundled into either or loaded as it runs, with its license ([`scripts/licenses.mjs`](../apps/desktop/scripts/licenses.mjs)) |
| `npm run dist` | The app to install: a disk image for each kind of Mac, or on Linux an AppImage, a deb, a pacman package and an rpm, and what an installed app updates itself from, in `release/` |

### The icon

The icon is drawn once, as [`icons/icon.png`](../apps/desktop/icons/icon.png): 1024 pixels across, on
Apple's grid, with the margin a Mac wants round the tile. `npm run icons` makes the rest
from it: `icon.icns` for macOS, and for Windows and Linux, where an icon fills its
square, `icon.ico` and `icon-512.png` with the margin cut away.

The `.icns` files, and the picture behind the installer's window below, are made on a Mac
only: they use `sips` and `iconutil`, which come with one. `icon.ico` and `icon-512.png`
are scaled with [sharp](https://sharp.pixelplumbing.com), which `npm install` supplies, so
they can be made on any system. Run off a Mac, the command leaves the committed `.icns`
files and installer picture as they are (a different filter would change the `.icns`
files, which are signed into the app).

Run from a checkout, the app has another icon, and another name, Enclose (Dev):
[`icons/icon-dev.png`](../apps/desktop/icons/icon-dev.png) is the same mark on blue, and
`icon-dev.icns` is made from it by the same command. It is what the Dock shows, and what
the copy of Electron the app is run as carries (`scripts/electron-name.mjs`), so that a
Mac asked for Enclose by name shows the app being worked on apart from the one that is
installed. It does not go into the installer.

The same command makes the picture behind the window the
[installer](#the-installer) opens, from the drawing of it,
[`installer/background.svg`](../apps/desktop/installer/background.svg): once at a pixel
to the point and once at two.

### The reference scenes

The app's own [reference scenes](reference-scenes.md) are written the way a project's
are, in [`kit/scenes`](../kit/scenes), and kept as built. `npm run scenes` builds them
again after a change, with a Python that has build123d.

### The examples

The examples are not in the app, to keep it small. Each is one
archive (`clock.tar.br`: its folder as a tar archive, squeezed with Brotli, which makes
26 MB of the four where the folders are 194), kept with a release of the app's
repository. It is fetched when it is asked for, taken for the example only if it has the
size and the SHA-256 the app was made to expect, and unpacked. Run from a checkout, the
app has the examples in [`examples/`](../examples), at the top of the repository, and
copies one from there instead.

[`shared/examples.json`](../apps/desktop/shared/examples.json) is the list of them. `npm
run examples` packs them again after a change, into `release/examples/`, and writes their
sizes and sums into the list; the archives then go up as a release under a new name (the
list says which), since an app already made goes on fetching the ones it was made with.
`ENCLOSE_EXAMPLES_URL` has them fetched from somewhere else, a folder of them served on
your own machine say, when the app is run from a checkout.

### The installer

`npm run dist` builds the app, makes `Enclose (Alpha).app` of it with
[electron-builder](https://www.electron.build), and of that a disk image for Apple
silicon and one for Intel: `release/Enclose-<version>-arm64.dmg` and `-x64.dmg`. Beside
them it writes what an installed app [updates itself](#updates) from: the app again as a
zip archive for each kind of Mac, and `latest-mac.yml`. It needs a Mac.

On Linux it makes an AppImage, a deb, a pacman package and an rpm for the machine's own
kind instead: `release/Enclose-<version>-x86_64.AppImage` and its kin (on an aarch64
machine the AppImage and the deb end in `arm64`, and the pacman package and the rpm in
`aarch64`), with `latest-linux.yml` beside them (`latest-linux-arm64.yml` on aarch64).
One kind at a time can be made (`npm run dist -- --appimage`, and `--deb`, `--pacman`,
`--rpm` likewise). A deb takes `dpkg-deb` and `ar`, from binutils, an rpm takes
`rpmbuild`, and a pacman package `bsdtar`, from the system (`sudo pacman -S dpkg
rpm-tools` on Arch, which has `bsdtar` already; `libarchive-tools` on Ubuntu); an
AppImage needs nothing but what npm installs. Only the AppImage
[updates itself](#updates) in place, and it takes two things to keep it so. The
target-specific `publish: null` under deb, rpm and pacman keeps those three out of
`latest-linux.yml`; it does not stop the `package-type` file they are written with, and
that file is what makes an installed deb, rpm or pacman ask for an update of its own kind,
from a feed that has no file of that kind. What keeps that from happening is the app, which
asks for a newer version only where it was run as an AppImage, and then with the
AppImage's own updater, whatever file it was made with. `scripts/dist.mjs` says which step
each of the two belongs to.

[`scripts/dist.mjs`](../apps/desktop/scripts/dist.mjs) says what goes in, and three
things follow from it:

- What the Electron side loads as it runs is a `dependency` in `package.json`, and goes
  into the app as it is. What the window is made of is bundled by Vite, and is a
  `devDependency`, React among them. A package the Electron side imports has to be a
  dependency, or the installed app does not start.
- The kit goes in as files, beside the app's own archive
  (`Enclose (Alpha).app/Contents/Resources/kit`), where Python and an agent can read it.
- The git a project's history is kept with, [dugite](https://github.com/desktop/dugite),
  is fetched for the kind of machine being built for and left unpacked beside the app's
  own archive, on Linux as on a Mac (`asarUnpack` and `beforePack` in
  `scripts/dist.mjs`; `scripts/git.mjs` fetches it and takes out what is not wanted).

A Mac opens an app that was downloaded only if it is signed by a developer Apple knows
and has been notarized, which is Apple looking it over. The script signs with the
"Developer ID Application" certificate it finds in the keychain, and has the app
notarized when it is told with what:

```
APPLE_KEYCHAIN_PROFILE=<profile> npm run dist
```

The profile is one that `xcrun notarytool store-credentials <profile>` has kept. With
none, the app is made all the same and runs on the Mac that made it, which is enough to
try the installed app out.

### A release

A release is made from a Mac, and the Linux files are then added to it. Every command is
run from `apps/desktop`.

On a Mac, one command does all of it:

```
APPLE_KEYCHAIN_PROFILE=<profile> npm run release
```

[`scripts/release.mjs`](../apps/desktop/scripts/release.mjs) makes the next version
(0.0.5 after 0.0.4; `npm run release -- 0.1.0` makes that one), having first seen that
one can be made: nothing uncommitted, on main with all the remote has, the version one
nobody has, the tests passing, and a project's tool shut in (`npm run sandbox`, under
[Checks](#checks)). It asks before it goes on (`-- --yes` has it not ask), and publishes
nothing until the app is built and a Mac has been seen to take it. `-- --dry` only sees
that everything is ready. If it stops after the version was committed, run it again with
that version and it goes on from there. It also says how far behind tscircuit's newest
release the version boards are built with is (`TSCIRCUIT` in `kit/board.mjs`). That is
kept at one version so that boards build alike from day to day, and moved on by hand when
there is a reason to: a fix or a better router that is wanted, or about once a month.
Build a few boards again with it before a release.

What it does, a step at a time, which can also be done by hand:

1. Commit what is to go out, and leave nothing uncommitted. The build takes the files as
   they stand, committed or not, and a release is what its tag says it is. See that it
   is fit to go out: `npm test`, and `npm run build && npm run sandbox`.
2. Give the app its new version, in `package.json` and the lock file both, and commit
   that:

   ```
   npm version <version> --no-git-tag-version
   git commit -am "chore: <version>"
   ```

3. `APPLE_KEYCHAIN_PROFILE=<profile> npm run dist`
4. See that a Mac will take it.
   `spctl -a -t exec -vv "release/mac-arm64/Enclose (Alpha).app"` answers `accepted`,
   from `Notarized Developer ID`.
5. Fetch the source of the git the app carries into `release/`: each archive
   `gitSources()` in [`scripts/licenses.mjs`](../apps/desktop/scripts/licenses.mjs) lists,
   its `url` saved as its `file`. Git is under the GPL, version 2, which has whoever
   passes it on give its source with it, and the app's third-party licenses say it is in
   the release.
6. Tag the commit, push it with its tag, and publish the two disk images, with what an
   installed app updates itself from and the source of its git:

   ```
   git tag v<version> && git push origin main v<version>
   gh release create v<version> release/Enclose-arm64.dmg release/Enclose-x64.dmg release/Enclose-<version>-*.zip release/Enclose-<version>-*.zip.blockmap release/latest-mac.yml release/*-source.tar.gz --title "Enclose <version>" --notes "$(git log --reverse --format='- %s (%h)' v<the version before>..v<version>^)"
   ```

   What the release says has changed is the commits since the version before, a line to
   each, without the one that only gave the app its version. A commit by someone who is
   not a collaborator on the repository ends with who it is by (", by @login"), and
   anyone whose first contribution it is is named under the list ("**New
   contributors**: @login made their first contribution in #7"). (The script does both,
   and puts a link under them to where the two versions are set side by side.)

Then, on Linux, one command puts the Linux installers on that release:

```
npm run release                    # onto the latest release the Mac made
npm run release -- --tag v0.1.0    # ...onto that one instead
```

It builds the installers for the machine's own kind, sees that every one of them was
made, and uploads them, with the update feed, to the tag the Mac released
(`gh release upload <tag> … --clobber`). It gives the app no version, makes no tag,
pushes nothing, and creates no release: a Mac release and a Linux release cannot share a
version, and a release holding only the Linux files would become "latest", which would
break the Mac download and the Mac updater. What it does need is the checks that still
apply: nothing uncommitted, a checkout of the commit the Mac released (the version in
`package.json` is the tag's), the tests passing, and a project's tool shut in. `-- --dry`
sees that everything is ready, and builds nothing.

The disk images are named for the kind of Mac and not for the version
(`Enclose-arm64.dmg`, `Enclose-x64.dmg`), so that the newest is always at one address:
`https://github.com/enclosedev/enclose/releases/latest/download/Enclose-arm64.dmg`. The
site's download button and `enclose.dev/download` go there, so a release needs nothing
changed on the site. They have to go up under exactly those names.

The Linux installers keep their versions in their names
(`Enclose-<version>-x86_64.AppImage` and its kin) and go on the same release as the disk
images, so a download of the latest release finds them beside the disk images.

The README sends people to the repository's latest release, which has to be the app's:
the examples' release is made with `--latest=false`.

### Updates

An installed app looks at the same latest release for a newer version of itself, as it
starts and every four hours after, with
[electron-updater](https://www.electron.build/auto-update). It reads the release's
`latest-mac.yml`, and fetches the zip archive that file names for its kind of Mac once
the user asks for it. So a release without that file is one nobody is offered, and it
has to be the one made by a `npm run dist` for both kinds of Mac: made for one, it names
no archive for the other. The app has to be signed, or a Mac will not put the new
version in. Run from a checkout, the app looks for nothing.

On Linux it reads `latest-linux.yml` instead (or `latest-linux-arm64.yml` on aarch64),
and fetches the AppImage it names. Only the AppImage is offered a new version:
`scripts/dist.mjs` keeps the deb, pacman package and rpm out of that file, and keeps the
app from treating itself as one of those, so a deb, pacman package or rpm is replaced by
installing the newer one instead. Run from a checkout, the app looks for nothing.

To try an update before there is a release of it, serve what `npm run dist` wrote and
start an installed app that has an earlier version, telling it to look there (on this
machine: the installed app takes no other address, and none of the other variables and
flags a checkout takes, `--capture`, `--script`, `ENCLOSE_USER_DATA` and the rest):

```
python3 -m http.server 8123 --bind 127.0.0.1 --directory release
ENCLOSE_UPDATES_URL=http://127.0.0.1:8123/ "/Applications/Enclose (Alpha).app/Contents/MacOS/Enclose (Alpha)"
```

and on Linux, with the AppImage in place of the app:

```
python3 -m http.server 8123 --bind 127.0.0.1 --directory release
ENCLOSE_UPDATES_URL=http://127.0.0.1:8123/ ./release/Enclose-<version>-x86_64.AppImage --no-sandbox
```

[`electron/update.ts`](../apps/desktop/electron/update.ts) keeps where an update is, for
the window to show.

## Usage data

An installed app counts how it is used and sends that to PostHog:
[usage-data.md](usage-data.md) tells the people who use it what is sent. Run from a
checkout it counts nothing, unless it is told which PostHog project to send to, which is
how a change to this is tried out:

```
ENCLOSE_ANALYTICS_KEY=<project key> npm run dev
```

[`electron/analytics.ts`](../apps/desktop/electron/analytics.ts) has the project an
installed app sends to, and does the sending. What is counted is recorded in
[`electron/main.ts`](../apps/desktop/electron/main.ts), each thing where it happens. An
event says nothing of a project or a message, and one that is added is added to
usage-data.md with it.

## GitHub backups

A project's history is kept with the git the app brings,
[dugite](https://github.com/desktop/dugite), which `npm install` fetches into
`node_modules/dugite/git` for the machine it runs on (its download script is allowed in
`package.json`). `npm run dist` fetches it again for each kind of Mac or Linux as that
one is made, and takes Git Credential Manager out of it
([`scripts/git.mjs`](../apps/desktop/scripts/git.mjs)); dugite ships git for Linux too,
so this works the same on either system.

Backing up goes through Enclose's GitHub App. Its client ID is in
[`electron/github.ts`](../apps/desktop/electron/github.ts) (`GITHUB_APP`); a build with
none says, in the settings, that GitHub is not available. Another app is tried with:

```
ENCLOSE_GITHUB_CLIENT_ID=<client id> ENCLOSE_GITHUB_APP=<its slug> npm run dev
```

The app is registered on GitHub (Settings, Developer settings, GitHub Apps) with:

- **Enable Device Flow** on. No callback URL, webhook or client secret is needed: the
  app signs in with a code the user types, and gets its token renewed without a secret.
- User authorization tokens that expire, as GitHub has it to begin with.
- Repository permissions: **Administration**, read and write (to make and rename the
  repositories), and **Contents**, read and write (to push). Metadata, read, comes with
  them.
- Installable by any account.

[`electron/backup.ts`](../apps/desktop/electron/backup.ts) keeps a project's history,
[`electron/backups.ts`](../apps/desktop/electron/backups.ts) when, and what goes to
GitHub, [`electron/github.ts`](../apps/desktop/electron/github.ts) and
[`electron/connection.ts`](../apps/desktop/electron/connection.ts) the signing in.

## Formats a project is read by

- The model manifest:
  [`shared/manifest-format.ts`](../apps/desktop/shared/manifest-format.ts).
- A project's own tool: [`kit/tools.md`](../kit/tools.md).
- An assembly guide:
  [`shared/assembly-format.ts`](../apps/desktop/shared/assembly-format.ts), and
  [`kit/assembly.md`](../kit/assembly.md) for how one is worked out.
- A circuit board: [`shared/board-format.ts`](../apps/desktop/shared/board-format.ts),
  [`kit/pcb.md`](../kit/pcb.md) for how one is made, and
  [`kit/board.mjs`](../kit/board.mjs), which builds it, and
  [`kit/board-check.mjs`](../kit/board-check.mjs), which checks it before it is
  ordered from JLCPCB and mends its BOM and placement file.
- The inspiration board:
  [`shared/inspiration-format.ts`](../apps/desktop/shared/inspiration-format.ts).
- The exporter a project copies in: [`kit/enclose.py`](../kit/enclose.py).
