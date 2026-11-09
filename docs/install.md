# Installing Enclose

Enclose is for macOS, 13 (Ventura) or newer, and for Linux (x86_64 and aarch64).

## What it needs

- An agent it can put your messages to, installed and signed in:
  [Claude Code](https://code.claude.com/docs/en/overview) (the Claude app is not
  enough on its own: Claude Code is what is run, from Terminal),
  [Codex](https://learn.chatgpt.com/docs/codex/cli), [Grok](https://x.ai/cli) or
  [opencode](https://opencode.ai/docs). Enclose has no login of its own: the
  conversation is with the agent on your machine. Claude is switched on to begin with,
  and another is switched on in the [settings](settings.md) (Providers): see
  [The agents](working-with-the-agent.md#the-agents). opencode answers with an account
  signed in or without one, on its free models.
- Nothing for Python. Models are built with Python and
  [build123d](https://build123d.readthedocs.io): where the `python3` your terminal runs
  has build123d, Enclose uses it. Where it has not, Enclose makes a Python of its own with
  build123d in it the first time it opens, once (a few hundred MB to download, kept in its
  own folder), and builds with that: the build123d it is known to work with (0.11.1), not
  whichever is newest.
- For circuit boards, [Node.js](https://nodejs.org) 18 or later. Boards are designed
  with [tscircuit](https://tscircuit.com), which the first board fetches, once.

## On macOS

Take the disk image for your Mac from
[GitHub Releases](https://github.com/enclosedev/enclose/releases/latest):

| Your Mac                     | The file            |
| ---------------------------- | ------------------- |
| Apple silicon (M1 and later) | `Enclose-arm64.dmg` |
| Intel                        | `Enclose-x64.dmg`   |

About This Mac, in the Apple menu, says which yours is: it names a chip that is Apple's,
or a processor that is Intel's. Open the disk image and drag the app into Applications,
where it is called Enclose (Alpha).

## On Linux

Take the file for your distribution from
[GitHub Releases](https://github.com/enclosedev/enclose/releases/latest):

| The file                            | How it goes in                                                    |
| ----------------------------------- | ----------------------------------------------------------------- |
| `Enclose-<version>-x86_64.AppImage` | Make it executable (`chmod +x`) and run it: nothing is installed  |
| `Enclose-<version>-amd64.deb`       | `sudo apt install ./Enclose-<version>-amd64.deb` (Debian, Ubuntu) |
| `Enclose-<version>-x64.pacman`      | `sudo pacman -U Enclose-<version>-x64.pacman` (Arch)              |
| `Enclose-<version>-x86_64.rpm`      | `sudo dnf install ./Enclose-<version>-x86_64.rpm` (Fedora)        |

The names above are for x86_64; on an aarch64 machine the AppImage and the deb end in
`arm64`, and the pacman package and the rpm in `aarch64`. Only the AppImage updates
itself (see [A new version](#a-new-version)); a deb, pacman package or rpm is replaced by
installing the newer one the same way.

Run from a terminal the first time with `--no-sandbox` where the sandbox refuses to
start: `./Enclose-<version>-x86_64.AppImage --no-sandbox`. This turns the sandbox off, so
use it only to get the app started, and not with a project you were not given by someone
you trust.

The app is called Enclose (Alpha), and keeps its state in `~/.config/Enclose`. New
projects go in `~/Documents/Enclose`, unless the [settings](settings.md) say elsewhere.

## The first time it is opened

On a Mac:

- macOS says that Enclose was downloaded from the internet and asks whether to open it.
  The app is signed and has been checked by Apple, so Open is all there is to it.
- macOS asks whether Enclose may reach your Documents folder. New projects are kept
  there, in `~/Documents/Enclose`, unless the [settings](settings.md) say elsewhere. It
  asks the same of Desktop and Downloads the first time a project or a CAD file is
  opened from one of them.

On Linux, a deb, pacman package or rpm is installed with the file manager or the command
above, and the AppImage is run where it is.

On either:

- With no project yet, start from one of the
  [examples](projects.md#starting-from-an-example): it is downloaded when you pick it.
- Enclose counts how it is used from the first time it is opened, and sends that count
  on: which features, and nothing from your projects or messages.
  [Usage data](usage-data.md) says what is sent, and how to switch it off.

If a message gets no answer, look at Providers in the [settings](settings.md): it shows
which agents the app found, and takes the path to one it did not find.

## A new version

Enclose looks for a newer version of itself when it is opened, and every few hours
after. When there is one, it says so at the bottom of the window, in the middle, as it
does for a newer version of an agent. **Update** downloads it, and shows how far along
that is; then **Restart** starts Enclose again as the new version. **Not now** puts it
away, and it is not offered there again (the settings still offer it). Your projects and
conversations are not in the app, and stay as they were.

About, in the settings, says which version you have, with a button beside it that does
the same: **Check for updates** looks for a newer version now, and says whether you are up
to date; once there is one, it downloads it (**Update to** that version), and then starts
Enclose again as it (**Restart to update**).

A download that the server or the connection lets down is tried once more on its own.
If that fails too, Enclose says the version did not download, and **Try again** asks for
it again. What Enclose did to update itself, and why a download failed, is written to
`updates.log`: in `~/Library/Logs/Enclose` on a Mac, and `~/.config/Enclose/logs` on
Linux.

On Linux only the AppImage updates itself this way, in place. A deb, pacman package or
rpm is updated by downloading the newer one and installing it as before.

Version 0.0.1 does not update itself. Download the new disk image and drag the app into
Applications. (0.0.1 is called Enclose there, with no Alpha, and is not replaced: drag it
to the Trash.)

## Removing it

On a Mac, drag Enclose (Alpha) from Applications to the Trash. What it kept of your
projects (the list of them, the conversations and the settings) is in
`~/Library/Application Support/Enclose`. The projects themselves are folders of yours,
and are left where they are.

What is kept there is written whole or not at all, so quitting or losing power while it
is written leaves it as it was. A file of it that cannot be read all the same (the list
of projects, the settings, a conversation) is not written over: it is moved aside as it
was, beside where it was, as `<name>.corrupt-<time>`; for the list of projects and the
settings the app says so when it opens.

On Linux, remove the package (`sudo pacman -R enclose`, or the like for yours), or throw
away the AppImage. What it kept is in `~/.config/Enclose`.
