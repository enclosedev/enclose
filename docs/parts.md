# Parts and groups

## The list of parts

**Parts** (P) lists what the model is made of: a card for each group the model puts its
parts in, and in it a row of the group's parts, each a picture with its name and, where
STEP is what is [saved](#saving-the-model), the size of its STEP file. A row with more parts than fit scrolls sideways.

Pick a part or a group and the view shows it on its own, with the camera brought to it,
in the middle of what the list leaves of the view; pick it again and the rest comes
back, and the camera goes back to where it was. (A group is picked by a click on its
card, anywhere but on its name.) Esc, or a press anywhere else, puts the list away and
leaves what you picked showing, and the button stays lit while it is.

A part put out of sight with H is dim in the list, as is a group all of whose parts are,
and picking it there brings it back; the button stays lit while anything is out of
sight.

## Saving the model

- **Download**, at the top of the right-hand edge, brings up the two ways there are to
  have the whole model. **Full model** saves it as one file, with every part in its
  place. **Zip with parts** saves one zip archive with a file of each part in it. A
  model of a single part has only the first.
- At the top of it, choose what they are saved as:
  - **STEP**, for CAD programs: the files the build wrote, with how big each is. The size
    given for the zip is what the files in it come to; the archive is smaller.
  - **STL**, for a slicer: one mesh of all that is saved, in millimetres with Z up.
  - **OBJ**, for a 3D program: each part an object of its own, under its name, in
    millimetres with Z up.
  - **Web**, for a web page: the model as one GLB file, as three.js or `<model-viewer>`
    takes it, in the colours and materials it has in the app. It goes into the project
    itself, in its `web` folder, under the model's name, and not where you choose. The
    whole model is saved with two more files beside it:
    - `web/table-clock.glb`: the model. Each part is a node named by its id under a
      node for its group, in metres with Y up, as glTF has it; the name each goes by is
      in its extras. A material's grain (oak, felt) is left out: the part is the
      material's colour.
    - `web/table-clock.js`: the project's [tools](project-tools.md), which move the
      model on a page as they do in the app, and what runs them. A page loads the GLB,
      hands its scene to `enclose()` from this file, and has the tools' controls to set
      and press; the file's first lines say how.
    - `web/table-clock.html`: a page of the model with the tools' controls beside it, to
      see the model at work as a site would show it, and to take from for a page of
      your own.

    **Full model** saves them and opens Finder, or the file manager, on them. **Preview**
    saves them and opens the page in your browser: the app serves the folder to this
    machine for that, since a browser will not run the page opened as a file. Each save
    writes over what was saved under that name before, so a page that has them from
    the folder has the model as it is now.

  STL and OBJ are made of what the view draws, which keeps within a fiftieth of a
  millimetre of every curve, and every part has them. A part made of a mesh has no STEP
  file (see [Meshes](projects.md#meshes)).
  What is chosen stays chosen, for every project, and is what every other download
  button saves too: the Download button has it written inside, above its arrow; its
  tooltip and those of the arrows below say it (Download part (STEP)); and a group's
  card shows it beside the group's size.
- The arrow that comes up beside a part's name, in the list, saves that part, in what
  was chosen there.
- The arrow beside a group's name saves the files of all its parts, in a folder named
  after the group, inside one you choose. A group of one part saves that part's file,
  as the part's own arrow does.
  For the web, a part or a group is one GLB of its own in the `web` folder, under the
  part's id or the group's name, without the tools or a page.

What is saved, other than for the web, has the day it was saved before its name, the year, the month and the
day: `2026_10_11_table-clock.step`. So do the folder a group's files go in, the zip
archive, and a [blueprint](blueprints.md#saving)'s sheets; the files inside a folder or
an archive keep their own names. The settings turn this off (General, Downloads).

Where to save opens in the folder you last saved into, whatever it was (a part, a
board, an assembly guide, a blueprint), and in Downloads until you have saved anything
or if that folder has gone. The app remembers it after it is closed, too.

## Changing the groups by hand

Several parts are picked in the list as in any list, and shown together: hold Cmd and
click parts to add them one by one (or take one back out), or click one and hold Shift
on another for every part from the one to the other, across groups. Hold either key and
click a group's card for the whole group, which is how two groups are picked to be made
one. Or pick parts out in the view.

| | |
|---|---|
| Cmd+G | Makes a group of what is picked, which goes to the top of the list. Claude Code's quickest model is asked what to call it, where Claude is switched on: the card glimmers while the name is on its way |
| Shift+Cmd+G | Takes them out of their groups, to be listed last as in none. With a whole group picked, by a click on its card, that is the end of the group |
| Click a group's name | Write another over it. Enter keeps it, Esc does not, and nothing written gives back the name it had before it was written over by hand |
| Cmd+Z | Takes any of this back |

It is kept by the app, not in the project's files: the agent is told how you have the parts
when it asks what they are, and is to write the same groups into the model the next time
it changes it. Should a build put a part in some other group, or call a group something
else, the build is what is shown.

## Where the groups come from

Nobody has to arrange the groups by hand. They come from the manifest, which the
project's build writes, and the agent is told that grouping is its job: when it adds or
removes parts it puts each where a person would look for it, and makes a group when none
fits.

## Search

**Search** (Cmd+F) finds parts and groups by name. A box comes up at the top of the
view, and as you type in it the whole model goes see-through but for what goes by the
name, which turns white the way a part does when it is picked out, wherever in the model
it is.

Each thing found, the sixty nearest to what you typed at the most, has its name on a tag
beside it: a part's by the part, and a group's,
with the sign of the parts list on it, by the group. Where they would lie over one
another, the nearest to what you typed are the ones shown, and turning the view makes
room for others. Click a tag and what it names is shown on its own, with the camera
brought to it, as I does with what is picked out; Enter does the same with all that was
found. Esc, the cross in the box or the button again puts the box away and leaves the
view as it was.

All of the model is looked through, whatever the view was cut down to and whatever was
put out of sight. While the box is up nothing is picked out, and what you type goes into
it wherever the pointer has been since, so the view can be turned between one letter and
the next; a click on a part picks it out as ever, and that is the end of the search.
