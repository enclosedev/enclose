# Projects

A project is a folder. Drop one on the window, or use the + under the project cards to
open one (Cmd+O) or to start a new project (Cmd+N). STEP, STL and OBJ files can be
dropped and opened the same way: see [Starting from CAD files](#starting-from-cad-files).

The cards are in the order the projects were added, the newest at the top. With more of
them than the window has room for, the cards scroll and the + stays where it can be
reached, over the settings button.

## New projects

A new project is given a stand-in name to begin with ("Quiet heron") and a folder to
match, in `~/Documents/Enclose` unless the settings say elsewhere:
`2026-10-05-2336-quiet-heron`, which is when it was made and then the name in lower case
with dashes. Once something has been made in it and the agent has finished, the project
takes the name of its model and its folder is renamed to match:
`2026-10-05-2336-pill-box`. A folder you opened yourself is never renamed.

## Renaming a project

Right-click a project's card for **Rename**, and write over its name where it is
on the card: Enter, or a click anywhere else, keeps what is written, and Esc leaves the
name as it was. It is the project that is renamed, in the app: what its card says, and
what the agent is told it is called. Its folder keeps the name it has. A project that still
goes by its stand-in keeps the name you give it, and no longer takes its model's.

## Recoloring a project

A project keeps its own copy of the app's exporter, so a project made before the app
changed how it draws a model goes on being drawn the old way: one made before circuit
boards were drawn in green, for one. Right-click its card for **Recolor**, and
the agent brings it up to date, in the conversation its panel shows: it copies the app's
exporter in again, takes out the colours that now go against the app's (green on
anything that is not a board), builds the model again and checks it. Nothing else about
the model is changed. See [How a model is drawn](view.md#colours).

## Removing a project

The × on a card removes the project from the app. Its folder stays, with everything in
it, but what was said about it is forgotten, which the app asks about first: open the
folder again and it is a new project. The one folder it clears away is one that came to
nothing, which the app made and nothing was put in.

A project whose folder is not where it was, on a drive that is not plugged in say, or
moved or deleted, stays on the list, dimmed, after the others, and says **Folder not
found**; where it was is on the pointer. Nothing can be done in it but removing it,
with its ×. Its conversations and all else the app kept of it are kept as they were:
put the folder back where it was, or open it again from there, and it is the same
project, with them. The app looks again each time its window is turned to.

## History and backup

Every project the app makes keeps its history in git, and so does a folder you open
that was not a git repository already, nor inside one. A folder that was one, or is in
one, is yours, kept your own way, and the app commits nothing in it. The app remembers
which repositories it set up itself, and goes by that alone: a folder that comes with a
repository the app made somewhere else (sent by somebody, say) is theirs, and is not
committed to or pushed. Nor does the app's git run anything a repository names of its
own, its hooks or a filter of its own: a repository whose config names a filter, other
than Git LFS's, has nothing committed in it.

After each turn of the agent's, and each Cmd+Z, the app commits what the folder holds. A
turn's commit says what it changed, as a change log written by Claude Code's quickest
model, whichever agent answered, from what was asked, what the agent said and the files that changed ("Added: a
circuit board and a USB-C socket", "Changed: …", "Fixed: …", "Removed: …"); where that
cannot be had, it says what was asked. Colours you give parts go in too, a few seconds
after the last of them ("Recolored parts by hand"), or with the turn the agent is at. Each
conversation that has [its own version](working-with-the-agent.md#versions) of the project
has a branch of its own: the first is `main`, and each after it `version/<what it began
with>`, from where the project was when it began. A commit goes on the branch of the
conversation whose version the folder holds: turning to another waits for the commit of
the turn that just ended, and the backup the app makes as it opens goes on the branch of
the conversation turned to last. With versions off, everything is on `main`. What the build writes
(`build/`), a Python of the project's own, Python's caches and `.env` files are left
out, in `.gitignore`; a file of 50 MB or more is kept with Git LFS. A folder too big to
have [versions](working-with-the-agent.md#versions) has no history kept either. The app brings its own git,
with Git LFS, so nothing has to be installed for it.

Connect GitHub in the settings (Connections) and every project is backed up as well:
each to a private repository of its own on your account, `enclose-<project name>`, made
the first time the project has a model, and pushed to after each commit, every branch of
it. Nothing is asked. Connecting backs up every project there is at once, with a pill at
the foot of the view saying how far it has got. A project renamed renames its repository.
A push that fails, with no connection say, is tried again a few minutes later; one that
has not got through in two minutes is stopped, and tried again the same way. Where a
project's last commit or push failed, the settings say so under GitHub, in red, with
why, until it next works. A lock git left behind in the middle of a commit (the app
quit, or the machine going off), which would have every commit after it fail, is taken
away once it is ten minutes old.

The agent is told that the app does this, and leaves git alone unless you ask it otherwise.

## Starting from nothing

A project can be an empty folder. It opens as any project does, in the viewer, with a
plain cube standing in for the model there is not yet and the conversation open beside
it. Say what you want made and the agent sets it up: it copies the app's exporter,
[`kit/enclose.py`](../kit/enclose.py), into the folder, writes a `model.py` that builds
the parts with [build123d](https://build123d.readthedocs.io) and hands them to it, and
runs it. Meanwhile the camera goes slowly round the cube and a light passes across it, as
over a model being looked over. The exporter writes the meshes, the edges, a STEP file of each part and the
manifest, and the model takes the cube's place as soon as it has. The build runs with the
`python3` a terminal would, where that has build123d, and otherwise with the Python the
app makes of its own (see [Install](install.md#what-it-needs)), which it puts first on
the `PATH` of the build and of the agent.

## Starting from an example

With no projects yet, the window says how one is started and, beside that, shows the
app's examples in a row that scrolls along, each with its picture and how much there is
to download. Click one and a project is made of it where new projects go, yours to
change.

| Example | What it is |
|---|---|
| [Table clock](../examples/clock) | An electric clock in a drum case on a stand, its hands turned by a stepper motor and [its circuit board](working-with-the-agent.md#circuit-boards) behind it, with [a tool that sets it and runs it](project-tools.md#examples) |
| [Robot arm](../examples/arm) | The SO-101, an open-source arm, read from its makers' own CAD file, with [a tool that steers it](project-tools.md#examples) |
| [Clip lamp](../examples/lamp) | A clip lamp on a wall shelf, with its wire |
| [Counter stool](../examples/stool) | A counter stool, drawn to the sizes it is sold by, [to see beside a person](reference-scenes.md#an-example) |

The examples are not in the app, to keep it small. Each is
fetched when it is asked for, taken for the example only if it has the size and the
SHA-256 the app was made to expect, and unpacked. Run from a checkout, the app has the
examples in [`examples/`](../examples), at the top of the repository, and copies one
from there instead.
[How they are packed](development.md#the-examples) is with the notes on working on the
app.

## Starting from CAD files

Open a STEP file (`.step`, `.stp`), a mesh (`.stl`, `.obj`), several at once, or a
folder that has some in it, and the app makes a project of them. It does not work in the folder they came from,
which could be laid out any way at all: it copies the files into a new folder beside its
other projects, named for the file or the folder, and sets that up the way its own
projects are. The copies go in `source/`; a `model.py` reads every body in them as a
part with `read_step` (or `read_files`, where there are meshes), from the same
[`kit/enclose.py`](../kit/enclose.py); and the build runs by itself, so the model is on
screen a few seconds later.

A file that is an assembly gives a part for each component, and a component that is
several solids (how Shapr3D exports its bodies) gives a part for each, under the names
the file has for them. From there it is a project like any other: ask the agent for a
change and it edits `model.py`. What was opened is left as it was.

### Meshes

An STL or OBJ file is only triangles. Each body in one that closes on itself is made a
solid as it is read, so it can be cut into, added to and cut in two like any other part;
its flat faces are whole faces again. An OBJ file's objects, an STL file's solids, and
pieces that do not touch the rest are parts of their own. A mesh says nothing of its
units: it is taken to be in millimetres, unless the whole of it is less than one across,
when it is taken to be in metres, as 3D programs write it.

What was curved in it stays a run of flat faces, though, and nothing of it is a size any
more: a hole cannot be made wider, nor an edge rounded. So beside the conversation the
app offers to **Rebuild as editable design**. The agent then builds each part again with
build123d, as its designer would have drawn it: it measures the mesh, takes its sizes
from that, checks the new part against the mesh, and puts it in the mesh's place. From
then on its sizes are in `model.py`, to be changed like any other project's. A scan or
a sculpted figure is no shape a designer drew, and is left a mesh. **Keep the mesh**
puts the offer away for that project.

A part made of a mesh is drawn smooth where its triangles meet at a slight angle, and
with an edge where they meet at more. It is in no STEP file, where its many faces would
come to hundreds of megabytes: it is saved as STL or OBJ (see
[Saving the model](parts.md#saving-the-model)).

A folder that already holds a model the app can show, or an `enclose.json`, is a project
as it stands and is opened where it is. So is a folder with no CAD file in it.

The build needs a Python with build123d. Where the app is still making its own, the
files wait for it, and the view says so; where it could not make one (with no connection,
say), the project is still made, with the files in it, and says why: ask the agent to set it
up and it makes a virtual environment in the folder.

### The agent looks the model over

While the files are read and the model is made, the middle of the view says how far
along it is, under the mark, with a bar that fills as it goes. Then the agent looks the model over, while a
light goes across all of its parts and the camera goes slowly round it, from a little
further back than a model opens at; when the agent is through, the view comes in to the
model again.

The app draws it pictures of the model (put together, from the other side, pulled apart,
and each part by itself) and it says what it takes the thing to be, and names and groups
the parts, keeping the names the files gave where they are good ones. That is a
conversation of the project's, begun by the app, and it ends with what the agent made of
the model and what it was unsure of.

It names the project as well, which until then goes by what the file was called, or the
folder the files were in. It keeps what in that is the thing's name and leaves out the
rest: a project made of `cloque-v4.step` is called Cloque. Where the file's name says
nothing of the thing, it is named for what it is. That is the model's title too. The
folder keeps the name it was made under, and a name you gave the project yourself
[meanwhile](#renaming-a-project) stands.

For this one turn the agent has none of its own tools: it can look at the view,
and name the project and name and group the parts, which the app writes into `model.py`
and builds. It can change nothing else. It can be stopped, and the settings can turn it
off (General, Opened files); with no agent on the machine it waits until there is one.

## The model manifest

The app looks in the folder for a model manifest: a JSON file listing the parts, the
mesh file of each, and the groups they are listed under. A part is any separate
component: a thing made, bought or fitted on its own. The manifest and its files are
build output; the project's own script writes them. When the manifest is rewritten, the
view reloads and keeps your camera where it was. While the agent is at work the view can
show a draft of it as well, which the app builds by itself as the agent writes the script
(see [Working with the agent](working-with-the-agent.md#what-the-agent-has-just-made)). `enclose.py`
writes that to the folder the app names in `ENCLOSE_DRAFT`, in place of `build/`.

The manifest format is in
[`manifest-format.ts`](../apps/desktop/shared/manifest-format.ts). A `enclose.json` at
the top of the project can say where the manifest is and how to build:

```json
{ "model": "viewer/public/model/report.json", "build": "python3 make_enclosure.py" }
```

Without it, the nearest file named `enclose.model.json`, `report.json` or `model.json`
that lists parts is used.
