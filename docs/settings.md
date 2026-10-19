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
| | What a [blueprint](blueprints.md#exploded-dimensions-and-labels)'s dimensions are in, millimetres or inches |
| | Whether what you [download](parts.md#saving-the-model) has the day before its name: `2026_10_11_table-clock.step` |
| | Whether the app sends [usage data](usage-data.md) |
| Navigation | How a scroll is read (automatic, trackpad or mouse), how fast the view turns and zooms, and whether a wheel zooms the other way round |
| | What the view [turns about](view.md#moving-around) (the middle of the view, the selection or the pointer), and whether turning stops straight above and below |
| | What [a mouse's buttons](view.md#a-mouses-buttons) do, and Shift and Ctrl with them: each by itself, or all as Blender, Fusion, Onshape or SolidWorks has them |
| Shortcuts | [The shortcuts](shortcuts.md), all but the keys for writing |
| Providers | The [agents](working-with-the-agent.md#the-agents) the app can put a message to, one under another: each says whether it is installed and who is signed in to it, and has a switch for whether it is in use. One that is not installed says, when it is opened, what to type in Terminal to install it, and links to its makers' own page on that; **Check again**, beside the section's name, finds it once it is in |
| | Where there is a newer version of an agent that is switched on, **Update available** stands on its line in place of its version and switch, and the same is offered at the foot of the view. It is updated the way it was installed: by its own updater (`claude update`, `grok update`), by Homebrew, by the npm of the Node it was installed with, or, for Codex, by its installer again. The app looks for newer versions when it opens, every six hours, and on **Check again**: on npm for Claude Code and Codex (for Claude Code from Homebrew, at the stable release Homebrew has), and by asking Grok |
| | Open one for its models: the switch on each is whether the message box offers it, and a star has it come first there |
| | **Show advanced settings**, under the models, has the rest: the binary to run, the arguments and variables it is started with, a model it does not list and, for Claude and Codex, where it keeps its settings and sign-in. A variable's value, often a key, is kept by the system (the Mac's keychain, a Linux keyring); a machine with nowhere to keep it safely keeps none, and says so under the variables |
| Connections | **GitHub**: **Connect** backs every project up to [private repositories on your GitHub account](projects.md#history-and-backup). A dialog shows a code to enter on GitHub's site (**Copy code and open GitHub**), where an account can be made on the way, and then asks for Enclose to be installed on the account; Esc or **Cancel** stops. Once connected it says which account, and **Disconnect** forgets it: what is on GitHub stays there. Where a project's history could not be kept or pushed the last time, it says which project and why, in red, until that next works |
| Appearance | Beside the section's name, the look: **System**, **Light** or **Dark** |
| | **Theme**: the app's own colours, or those of one of the [themes](#themes) beside them, each shown as the window would be drawn in it in the look chosen (light and dark side by side, for **System**) |
| About | The app's version |

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

