# Picking parts out

| | |
|---|---|
| Click | A part, or the object it belongs to |
| Double click, or Cmd+click | A single part |
| Shift+click | Add a part, or take it back out |
| Shift+double click | Add a whole object |
| Drag to the right | Everything inside the box |
| Drag to the left | Everything the box touches |
| Shift+drag | Add what the box takes in |

Cmd is Ctrl off a Mac. Click where there is nothing to let go of what is picked out.

## A click

Click a part and it is picked out: it turns white, with a heavier line round it, and
three buttons appear where you clicked, with the part's name beside them, and stay on
that spot of the part as it is turned.

- One gives it another of the app's colours, which is how the app draws it from then on
  (the agent is told, when it asks what the parts are). While you choose a colour for it,
  and for a moment after, the part is seen in its own colour instead. The colours you
  give are kept in the project's folder, in `enclose.colors.json`, so they go wherever
  the project goes: into its [history and backup](projects.md#history-and-backup), and
  to another computer.
- One downloads the part as STEP, where the model hands that out.
- One opens a box to say what should change at the place you clicked.

## Objects and single parts

Where the part is one of several that make one object (the parts of a group that touch
one another, as they go when the model is pulled apart), the click picks out the whole
object, and so does the pointer light it up: a circuit board with all that is on it,
under the group's name, or under that of its widest part where it is only some of the
group. The colour is then given to all of it, what you say is said of all of it (the agent
is told which parts those are, and where on them you clicked), and there is no file of
it to download.

A click with Shift held picks out the one part, and while Shift is held the pointer
lights up just that part. So does a double click, or a click with Cmd held (Ctrl, off a
Mac). With Shift held it is the second click that goes the other way:
straight after the first, on the same spot, it takes in the whole of the object the part
belongs to.

## Saying what should change

Enter keeps what you wrote for the next message: it shows as a chip on the message box
and as a mark on the part, and you can go on to say things of other parts, which gather
there. Click a chip or a mark to change what you said. Cmd+Enter sends at once, with
everything gathered and whatever is in the message box. Each thing said goes to the agent
with its part and the point clicked, in the model's coordinates.

## On its own, close to, out of sight

With a part picked out, **I** shows it on its own and brings the camera to it, from the
side the camera is on: the part in the middle of the view, filling it. The flat views
and the opening view frame the part while it is alone. I again, or Esc, brings the rest
back, and takes the camera back to what it was looking at, as near as it was, from
whichever side it is on by then.

**Space** brings the camera to what is picked out in the same way, one part or several,
and changes nothing else: the rest stays on show, and Cmd+1 is all of the model again.

**H** is the other way about from I: it puts what is picked out, one part or several,
out of sight and leaves the rest. Pick out more and H hides those too. Esc brings back
what was hidden last, by itself, to put back what you hid to see under it; a second
Esc brings back all the rest. H with nothing picked out brings back all of it at once,
and the list of parts brings them back one at a time. Cmd+Z takes back any of these, as it does
[a change to the model](working-with-the-agent.md#taking-a-change-back).

## A box

Drag across the view and a box is drawn, which picks out several parts at once: drawn
from left to right, the parts wholly inside it; from right to left, every part it
touches, and its edge is dashed to say so. A box goes by the piece, as a click does: one
that takes in one chip takes the board it is on and all else on that. Esc drops a box
that is still being drawn.

Shift adds to what is picked out. With a box it adds what the box takes in; with a click
it adds the one part clicked, or takes it back out if it was already among what is
picked out, and on a part of an object that is picked out it picks out just that part. A
second click with Shift still held, straight after the first, adds all of the object the
part belongs to: that is how one object is picked out together with another.

What a box takes in goes right through the model, so while it is drawn the view shows
what it takes in so far solid and everything else see-through, whatever the shading. Let
go, the model is drawn as it was, and the parts picked out show through whatever is in
front of them: veiled in white where each is, with a line round it. I shows them on
their own, as it does one part.

## Add to chat

With parts picked out together, by a box or with Shift, a button at the foot of the
view, Add to chat, puts them on the message box, in a row of chips that scrolls
sideways, the last added first, and opens the conversation to go on from there. It goes by the object, as picking does. A whole object among what is picked out
is one chip, however many parts it is made of, and the button counts those as groups:
Add 2 groups to chat. It goes to the agent as one thing, with what it is called and which
parts it is, and what you write is taken as said of it; where you mean only some part of
it (the cap of a button), say so in your own words and the agent finds the part.

The parts picked out for themselves are a chip each, and go to the agent by name, ahead of
what you write, as if you had written them with @. A message that was sent shows the
objects it was about over what it said.
