# Keyboard shortcuts

The app has the same list in its settings (Shortcuts), all but the keys for writing. Cmd
is Ctrl off a Mac.

## Views

| | |
|---|---|
| Cmd+1 | The view a model opens with |
| Cmd+2, Cmd+3 | Front, back |
| Cmd+4, Cmd+5 | Top, bottom |
| Cmd+6, Cmd+7 | Right, left |
| Space | What is picked out, close to, from the side the camera is on |

## The model

| | |
|---|---|
| Z | [Shading](view.md#shading) |
| P | [Parts](parts.md) |
| Cmd+G | [Make a group](parts.md#changing-the-groups-by-hand) of what is picked |
| Shift+Cmd+G | Take what is picked out of its groups |
| Shift+G | [Grid](section-explode-grid.md#grid) |
| S | [Section](section-explode-grid.md#section) |
| X, Y, Z | Which way the section cuts, while the model is cut open |
| E | [Explode](section-explode-grid.md#explode): into pieces, then into every part, and back and forth between the two (Esc puts the model together) |
| Cmd+/ | [Reference scene](reference-scenes.md) |
| I | Show what is picked out [on its own](selecting.md#on-its-own-close-to-out-of-sight) |
| H | Put what is picked out out of sight, or bring everything back |
| B | [Blueprint](blueprints.md) |
| A | [Assembly guides](working-with-the-agent.md#assembly-guides) |
| Shift+P | [Circuit boards](working-with-the-agent.md#circuit-boards), to open one in PCB mode |
| Shift+I | The [inspiration board](working-with-the-agent.md#the-inspiration-board) |
| Cmd+F | [Search](parts.md#search) |
| T | [Tools of the project's own](project-tools.md) |
| Cmd+Z | [Take back](working-with-the-agent.md#taking-a-change-back) the last change to the model, or what was hidden or shown. What an agent did takes a second press |
| Cmd+Shift+Z | Put it back |
| Esc | Close, or step back |

## PCB mode

| | |
|---|---|
| 1 | The board's [technical view](working-with-the-agent.md#circuit-boards) |
| 2 | The board in 3D |
| 3 | Its schematic |
| S | Its bottom side, turned over as it is seen from under the board, and back |
| P | The parts on the board |
| Cmd+1 to 7 | In 3D, the same set views as the model's: the view it opens with, front, back, top, bottom, right, left |
| Esc | Back to the model |

## The inspiration board

| | |
|---|---|
| Click | Go up to a picture, or spread a group out; on a picture gone up to, pin a note there |
| Shift+Click | Add a picture or a group to what is picked out, or take it back out |
| Drag | Move what is picked out; across the ground, pick out what the box takes in |
| Cmd+G | Group what is picked out |
| Shift+Cmd+G | Take it out of its group |
| Delete | Take what is picked out off the board, once you say so |
| Cmd+Delete | Take it off without asking |
| Cmd+A | Pick out everything |
| N | Show every note, or only the one pointed at |
| O | Organize: everything in tidy rows |
| E | Expand all: every group spread out at once, or back in its pile |
| Cmd+F | Search |
| Cmd+1 | All of the board |
| Esc | Step back: out of a note, a picture, a group spread out, then the board |

## The app

| | |
|---|---|
| Cmd+N | [A new project](projects.md#new-projects) |
| Cmd+O | Open a file or folder as [a project](projects.md) |
| Cmd+B | The conversation |
| Cmd+. | Clear the view, a step at a time: the other projects' cards, then everything over the view, then all of it back |
| Cmd+, | [Settings](settings.md) |
| D | The light theme, or the dark |

Off a Mac the picker takes files or a folder and not both: Ctrl+O asks for files, and
Ctrl+Shift+O for a folder.

## Moving around

| | Trackpad | Mouse |
|---|---|---|
| Orbit | Two fingers | Right drag |
| Zoom | Pinch | Wheel |
| Pan | Shift and two fingers | Shift and right drag |

Holding Ctrl makes any scroll zoom, and any drag with a mouse's right or middle button.
A drag with the middle button zooms by itself. That is how a mouse's buttons come:
[what each does](view.md#a-mouses-buttons) can be set, and the list of shortcuts in the
settings follows what they are set to.

## Picking parts out

| | |
|---|---|
| Click | A part, or the object it belongs to |
| Double click, or Cmd+click | A single part |
| Shift+click | Add a part, or take it back out |
| Shift+double click | Add a whole object |
| Drag to the right | Everything inside the box |
| Drag to the left | Everything the box touches |
| Shift+drag | Add what the box takes in |

## Writing

| | |
|---|---|
| Enter | In the box at a part: keep what you wrote for the next message |
| Cmd+Enter | In the box at a part: send at once, with everything gathered |
| @ | [A part by name, or a picture of the inspiration board](messages.md#parts-skills-and-commands-by-name) |
| $ | A skill by name, where it is Claude that answers |
| / | A command, at the start of a message, where it is Claude that answers |

## What Esc steps back through

Esc puts the search away if it is up, and then the parts list, the list of reference
scenes, or the project's tools. After that it puts a model that is pulled apart back
together, at once, whatever else was gone into and whenever; and then a blueprint's
sheet that has the view to itself back among the others. Then it gets back out of the
section, the blueprint, the reference scene, the tools' hold on the model, whatever is
showing on its own and whatever was put out of sight, one press each, starting with
whichever you went into last. What was put out of sight takes two: the first brings
back what was hidden last, and the second the rest.

## With the view cleared

Cmd+. clears the view a step at a time. The first press puts away the cards of the
other projects, and the button that adds one, as a blueprint does: the open project's
card is all there is at the left. The second leaves the model the window: that card,
the settings button under it and the buttons down the right go too. The third brings
everything back. Esc does not. The conversation is not touched: open, it stays open.
Nor is a list that is up, of parts or of reference scenes, nor the search. Every key
still does what it did, so the parts list is still P and the settings still Cmd+,.

## When a key does nothing

- While a box is being written in, the plain keys are the writing's: letters, Space,
  Shift+G and Esc. The ones with Cmd still work, and Cmd+Z only in a box that is empty.
- Under a blueprint the keys of the view wait until it is back: Cmd+1 to 7, Space, Z, S,
  X and Y, Shift+G, Cmd+/ and T.
- T is there only in a project with tools of its own, and B and Cmd+F only once there
  is a model. Cmd+B and Cmd+. need a project to be open.
- In a reference scene there is no view from below, so Cmd+5 does nothing.
- No key of the view works with Settings open, or while the agent looks over files that
  were just opened. Cmd+N, Cmd+O, Cmd+B and Cmd+. wait for Settings to be closed too.
