# Tools of a project's own

**Tools** (T) is the one blue button, and is there only in a project that has tools of
its own. They are not the app's: each was made for that project's model, by the agent,
because someone asked to see the model do something. The hands of a clock set to a time
and run, a lid opened by a slider, an arm steered joint by joint.

The app has no animation of its own to learn, and nobody has to wait for one to be
added: say what you want to try, and the agent builds the tool for it. What is the
project's own is blue, the button and the panel it brings up, so that it is never taken
for something the app came with.

## The panel

The panel has a tab for each tool, and under it the tool's controls, one below another:
what each is called, what it does in a few words, and beside that the control itself. A
control is one of the app's kinds, whatever the tool:

- a slider
- a pad that takes two values at once (and can spring back, as a joystick does)
- a switch
- a choice of a few
- a list of many
- a row of buttons
- a choice among the app's colours
- something the tool says

The tools are at work from when the project opens, so that what they put out of sight is
out of sight from the first, and an Esc meant for something else does not let go of
them. The panel stays up while the view is turned, since a tool is worked with the model
in sight. The button or Esc puts it away, and the tools are still at work then: once
they have been brought up, Esc again lets go of the model, which is back as it is built.

## How a tool is written

A tool is one file of JavaScript in `tools/` at the top of the project
(`tools/clock.js`, its name in lower case), a tab for each file, up to twelve, loaded
again whenever it is written. It says
what its controls are and, each time the view is drawn, where the parts are from how the
controls stand: turned about a line, carried somewhere, put out of sight, drawn in
another colour. It changes nothing in the project's files; the parts are only drawn
where it has them. [`kit/tools.md`](../kit/tools.md) says how one is written, and is
what the agent reads before it writes one.

What a tool moves, it moves as a well-made machine would: off from rest gently, up to
its pace, and gently to rest where it was going, never at a jump and never at one pace
from start to stop. The app works that out for the tool (`tool.glide`), the way a
machine's own controller does, so a lid sent open takes its second to get there, a part
under a slider follows the hand with some weight to it, and the joints of an arm sent
to a pose all arrive together. A tool written before the app could do this moves as it
did: ask the agent to have it glide.

A tool is run shut away from the rest of the app, in a worker of its own: it is told the
parts' names and sizes, and has no way to the window, to files or to the network. It
cannot bring code in from anywhere else, nor make any up to run. Nor can it keep
anything on your machine, or show you a notice from the system: and a tool its worker
could not shut in so is not run at all, and says so in its tab. So a project that came
from someone else can be opened with its tools. (Version 0.0.1 did not stop a tool that
imports a module from somewhere else: with that version, read a stranger's tools first.
Versions up to 0.0.5 kept a tool from the network, but left it the means to show a
system notice in the app's name and to reach the app's own storage.) One that goes
wrong, or never comes back from a frame, is stopped and says why in its tab, with a
button that takes that to the agent.

## On a web page

A model saved for the web (Download, Web) takes its tools with it: the page saved
beside it has their controls, and they move the model there as they do in the app (see
[Saving the model](parts.md#saving-the-model)). Making a model work a certain way on a
web page is making a tool that does it.

## Examples

[`examples/clock`](../examples/clock) is a project to try it on, and the rest of the app
with it: a table clock, an electric one in a drum case on a stand. The bezel, the dial,
the back, the movement and the stand are each screwed on, with screws from the app's
library in holes cut to fit them, and there is glass over the dial. A stepper motor on
the back of the movement turns the centre wheel once an hour, and the wheels from it to
the hands are cut to the numbers of teeth a real movement has. Behind the motor is its
[circuit board](working-with-the-agent.md#circuit-boards), screwed to the inside of the
back cover: it keeps the time and steps the motor, from a USB-C socket in the drum's
wall, and its button comes out through the back. PCB lists it, to open in PCB mode.

Its tool sets the time the hands show, runs it forwards or back at three speeds, or
keeps it to the computer's clock; at the clock's own speed the hands go on in the
motor's small steps, one every 0.88 s or so. **Set button** holds down the button on the
back, which runs the hands forward fast. Glass shows the movement in its case, and
Explode takes it apart in the order it is put together. Open the folder as a project,
or, with no projects yet, click it among the examples the window shows: that makes a
project of a copy of it, where new projects go.

[`examples/arm`](../examples/arm) is another: a robot arm that was not drawn here. It is
the SO-101, an open-source arm, read from its makers' own CAD file
([where it is from](../examples/arm/source/README.md)), and its tool steers it joint by
joint or takes it to a pose, every joint setting off and arriving with the others.
