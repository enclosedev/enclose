# Settings

The gear at the bottom left, or Cmd+,. They open in a panel over the left of the window,
with the app still to be seen past it. Esc, the cross at the foot of the panel, or a
click on the app puts them away.

| Section | What it holds |
|---|---|
| General | Where new projects are saved, `~/Documents/Enclose` to begin with |
| | Whether the agent [looks over](projects.md#the-agent-looks-the-model-over) the CAD files you open |
| | How much the agent [may do without asking](working-with-the-agent.md#model-effort-and-access) |
| | Whether each conversation has [a version of the project](working-with-the-agent.md#versions) of its own |
| | After how many days a [conversation](working-with-the-agent.md#conversations) left alone goes under its project's card |
| | Whether the conversation says about how many tokens Claude has used while it thinks, beside how long it has been thinking, and once it is done, how many it wrote over its steps, beside how long it worked (off to begin with) |
| | Whether a short pop is heard when an agent is done, needs you (two of the same note), fails (lower, falling), or finishes a [board](working-with-the-agent.md#circuit-boards) made in the background (rising, four notes). On to begin with; turning it on plays one |
| | What a [blueprint](blueprints.md#exploded-dimensions-and-labels)'s dimensions are in, millimetres or inches |
| | Whether what you [download](parts.md#saving-the-model) has the day before its name: `2026_10_11_table-clock.step` |
| | Whether the app sends [usage data](usage-data.md) |
| Navigation | How a scroll is read (automatic, trackpad or mouse), how fast the view turns and zooms, and whether a wheel zooms the other way round |
| | What the view [turns about](view.md#moving-around) (the middle of the view, the selection or the pointer), and whether turning stops straight above and below |
| | What [a mouse's buttons](view.md#a-mouses-buttons) do, and Shift and Ctrl with them: each by itself, or all as Blender, Fusion, Onshape or SolidWorks has them |
| Shortcuts | [The shortcuts](shortcuts.md), all but the keys for writing |
| Providers | The [agents](working-with-the-agent.md#the-agents) the app can put a message to, one under another: each says whether it is installed and who is signed in to it, and has a switch for whether it is in use. One that is not installed says, when it is opened, what to type in Terminal to install it, and links to its makers' own page on that. Claude's says **Claude Code not installed**: it is Claude Code that is run, from Terminal, and the Claude app is not enough on its own; **Check again**, beside the section's name, finds it once it is in |
| | Where there is a newer version of an agent that is switched on, **Update available** stands on its line in place of its version and switch, and the same is offered at the foot of the view. It is updated the way it was installed: by its own updater (`claude update`, `grok update`), by Homebrew, by the npm of the Node it was installed with, or, for Codex, by its installer again. The app looks for newer versions when it opens, every six hours, and on **Check again**: on npm for Claude Code and Codex (for Claude Code from Homebrew, at the stable release Homebrew has), and by asking Grok |
| | Open one for its models: the switch on each is whether the message box offers it, and a star has it come first there |
| | **Show advanced settings**, under the models, has the rest: the binary to run, the arguments and variables it is started with, a model it does not list and, for Claude and Codex, where it keeps its settings and sign-in. A variable's value, often a key, is kept by the system (the Mac's keychain, a Linux keyring); a machine with nowhere to keep it safely keeps none, and says so under the variables |
| Account | Your Enclose account, marked **NEW** in the list until you first sign in on this computer. **Sign in** opens a page in the browser where you continue with Google or Apple, or give your email and then the code sent to it: there is no password, and an email not signed in with before makes a new account (the same email, by any of the three, is the same account). Where that browser is signed in already, from before, the page offers that account instead: **Continue**, or **Use another account**. The page then hands the sign-in back to the app, which signs in that moment and comes forward, and the browser's tab closes (or, after Google or Apple, goes on to enclose.dev). Meanwhile the app shows its mark turning, as it waits; Esc or **Cancel** stops. The app keeps the sign-in with the system (the Mac's keychain, a Linux keyring): on a Linux desktop with no password store it signs in to nothing, and says to install GNOME Keyring or KWallet. Signed in, it says who, and has **Sign out**. Under **Enclose Cloud**, **Back up** sends your projects to Enclose Cloud (free, up to 5 GB): each file once, so that a backup cut short goes on where it was, and leaves out what a project's `.gitignore` does but for a build deeper in it (a circuit board's, which its model is made with): the model's own build, which is made again, stays out, and so does any file over 95 MB. It says how many files it found and how many files and megabytes are sent as they go, says when you're offline (or Enclose Cloud can't be reached) and goes on by itself once it can, and has **Stop**. Backed up, the section is **Your files**, with how much of the 5 GB they take, and the projects are backed up again by themselves every 15 minutes from then on. The files too big to back up are listed under it, five at first (**Show all** for the rest), each with **View file**, which shows it in its folder. Where there is not enough room, a bar shows what is backed up, what is to upload and what goes over (pointed at, each says how much), and **Choose projects** lists them there, each with how much it takes and a switch: one turned off is removed from Enclose Cloud and not backed up again, once **Save** is pressed. **Choose projects** is under **Your files** at any time too (as **Projects**): one turned on again is backed up again, as far as the 5 GB has room for it. On a computer that does not have them (a new one, signed in to the same account), **Not on this computer** lists the projects on Enclose Cloud, each with **Download** (and **Download all**): each comes back as it was last backed up, into a folder of its own where new projects go, with its model made again, and goes on being backed up as the same project. It says how many files and megabytes have come as they do, and has **Stop**, which leaves nothing half made. **Delete account** asks first, and deletes the account and its backups on Enclose Cloud: your files on this computer stay as they are. Deleting takes a sign-in from the last day: where yours is older, sign out and in again first |
| Connections | **GitHub**: **Connect** backs every project up to [private repositories on your GitHub account](projects.md#history-and-backup). A dialog shows a code to enter on GitHub's site (**Copy code and open GitHub**), where an account can be made on the way, and then asks for Enclose to be installed on the account; Esc or **Cancel** stops. Once connected it says which account, and **Disconnect** forgets it: what is on GitHub stays there. Where a project's history could not be kept or pushed the last time, it says which project and why, in red, until that next works |
| Appearance | Beside the section's name, the look: **System**, **Light** or **Dark** |
| | **Theme**: the app's own colours, or those of one of the [themes](#themes) beside them, each shown as the window would be drawn in it in the look chosen (light and dark side by side, for **System**) |
| About | The app's version, and beside it a button to [update the app](install.md): **Check for updates**, **Update to** a newer version once there is one, **Try again** where it did not download, and **Restart to update** once it is downloaded |

## Themes

A theme colours some of the window in its own way, in the light look and in the dark:
the projects' cards and the line round them, the words on one that is working or needs
you, and the light that runs across those while it works; the view behind the model,
and the colours its parts are drawn in; the conversation's ground, and the bubble of
what you say in it; the project's own tools; the settings' panel, its cards, what is on
or chosen in it, and its text; and a circuit board in PCB mode, in each of
its three views: its mask, traces, copper pour, pads and print in 3D (a pour is drawn
as the traces are, unless it is given a colour of its own), and the light, mid and dark
greys of the components on it; its copper on each side, print and edge in the technical
view; and the lines, fill, wires, names and values of its schematic. What a theme leaves out is the app's own. A theme is chosen in **Appearance**, and stays chosen across light and
dark: **System**, **Light** or **Dark**, beside the section's name, says which of its two
looks is shown. The app's own colours, **Default**, are always there, and cannot be
removed.

Each theme is a file in [`themes/`](../themes) at the top of the repository, and goes out
with the app. To make one, run the app from a checkout (see
[CONTRIBUTING.md](../CONTRIBUTING.md)): the palette, beside **Appearance**, opens the
theme creator over the whole window. Down its left are the colours there are to pick;
on its right, the window drawn in them, with a card in each of the ways a card can be, a
part in each of the palette's colours, and a conversation. A click on one of those parts
picks its colour to be changed. The window's own colours are under **General**; a
circuit board's under **PCB**, where the window is drawn in PCB mode with a board of its
own: it turns to the view whose colour you are picking, and PCB mode's buttons down its
right change the view too; and the settings' under **Settings**, where the window has
them open over it. **Light** and **Dark**, at the top right, say which look
is being made, and what is picked in one is that look's alone: the other keeps the
app's colours until you pick some for it too. The title is the theme's name, up to 20
characters: click it to name the theme. **Save theme**, which comes up once the theme
has a name, writes the theme under that name to `themes/<name>.json`, and the window is
drawn in it. The theme creator stays open: **Save theme** is on again once something
differs from what was saved, and saving again updates the same file, renamed with the
theme. Open a pull request with that file to put it in the app for everyone. Run from a
checkout, each theme's card has a pencil, which opens the theme creator on that theme
to change it (saving it again updates its file), and a cross to remove it, which deletes
its file.

The app's own colours are changed the same way. Run from a checkout, the **Default** card
has a pencil that opens the theme creator on the app's own colours, in the look chosen,
with its title the name the card shows. **Save default theme** writes
`themes/default.json`, which every theme is drawn over; a pull request with it changes
the app's colours for everyone.

