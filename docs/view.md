# The view

## Moving around

| | Trackpad | Mouse |
|---|---|---|
| Orbit | Move two fingers across it | Drag with the right button |
| Zoom | Pinch | Turn the wheel |
| Pan | Hold Shift | Hold Shift with either |

A pinch zooms in on whatever is under the pointer. The main button is not the camera's:
it [picks parts out](selecting.md).

Orbiting does not stop straight above the model or straight below: it carries on over
the top and round the far side, with the model upside down, as it does in Blender. A set
view, or Cmd+1, brings it back the right way up, and goes there the short way however
many times the view has been turned about. (In a [reference scene](reference-scenes.md)
it stops at the ground the scene stands on.) The [settings](settings.md) can keep the
model upright instead: orbiting then stops straight above and straight below.

The view turns about what the camera looks at, in the middle of the view. The settings
can have it turn about what is picked out, or about the place on the model the pointer
was on as the turn began, which then stays where it is while the rest goes round it.

What is out of sight is nothing to the camera: the view a model opens with, Cmd+1, the
set views and how far it zooms go by the parts on show, and what is picked out but out
of sight is not turned about or gone to. When the project's own
[tools](project-tools.md) put parts out of sight or back, the camera takes in what is on
show then, from the side it is on; parts hidden by hand leave it where it is. With some
of the model out of sight, a turn that would go about a place where none of what is on
show is goes about what is on show instead: about its middle, which stays where it is
in the view, or, where the camera looks through it, about the place half way through it
in the middle of the view.

A trackpad and a wheel send the same scroll, so which one it was is read from how the
scroll moves ([`scroll.ts`](../apps/desktop/src/lib/scroll.ts)). Holding Ctrl makes any
scroll zoom, whatever it was taken for. The settings can say which it is, how fast the
view turns and zooms, and that a wheel zooms the other way round.

### A mouse's buttons

A drag with the middle button, which is the wheel pressed down, zooms as the wheel does:
up the window to zoom in, on the place the drag began. Holding Ctrl makes a drag with
either button zoom, as it does a scroll.

What each button does is yours to say in the settings, and so is what Shift and Ctrl
make of a drag: one by one, or all at once to how another program has them.

| | Middle button | Right button | With Shift | With Ctrl |
|---|---|---|---|---|
| Enclose | Zoom | Turn | Pan | Zoom |
| Blender | Turn | Turn | Pan | Zoom |
| Fusion | Pan | Turn | Turn | Zoom |
| Onshape | Pan | Turn | Pan | Pan |
| SolidWorks | Turn | Turn | Zoom | Pan |

A key does what it does with either button, and with both keys held a drag zooms. Where
those programs give the right button to a menu of their own, it turns the view here.
([`navigation.ts`](../apps/desktop/src/lib/navigation.ts) has them.)

## Set views

The axes in the bottom right corner turn with the camera. Click the end of one to look
at the model from there, click it again for the opposite side, or drag inside it to
orbit.

| | |
|---|---|
| Cmd+1 | The view a model opens with |
| Cmd+2, Cmd+3 | Front, back |
| Cmd+4, Cmd+5 | Top, bottom |
| Cmd+6, Cmd+7 | Right, left |
| Space | What is picked out, close to, from the side the camera is on |

Those six views are flat: drawn with no perspective, so a side is seen exactly side-on,
centred and fitted to the window. Panning and zooming keep a view flat. Orbiting brings
the perspective back a little at a time, over the first 30° of the turn, and it goes the
same way over the last 30° of the turn into a flat view: the lens changes while the
model is turning, never while it is still.

From above and from below alike, the model's back is at the top of the view: the bottom
view turns the model over sideways, not end over end.

## Light

The model is lit from above. Looked at from below it would be in its own shadow, so a
light under it comes up as the camera goes below the level: from straight below, what
faces down is as light as what faces up is from straight above. From above nothing is
changed by it.

## Shading

Shading is on Z, the way it is in Blender: the key brings solid, glass, pattern,
wireframe and outline up in a circle round the pointer. Hold it, flick towards one and
let go; or tap it, and click one. A choice is pointed at by direction, so the pointer
need not reach it. Esc, Z again or a right-click puts the menu away. While the model is
cut open a tap of Z is the cut across Z instead, and the menu comes up when the key is
held.

- **Solid** draws the model as it is.
- **Glass** makes the whole model see-through, every part of it, so that what is inside
  anything shows.
- **Pattern** is wireframe with every face ruled into squares, in three of the colours
  parts are drawn in: one for the lines across each of the part's axes. Each face is
  ruled into about as many squares as any other, so a small face is ruled finely and a
  large one coarsely. Lines that would crowd one another on the screen are thinned out,
  every other one at a time, so a model seen from far off is not a blur of them.
- **Wireframe** draws the model's lines and nothing of its surfaces, which still hide
  the lines behind them.
- **Outline** draws every line, the hidden ones too.

In all of these but solid a curved face is given the line where it turns out of sight,
which is no edge of the model's and moves as the model is turned.

## How a model is drawn

The view draws each part as one mesh per colour, however many faces the CAD export
wrote, which is what keeps large assemblies smooth (the benchmark behind that is in
[`spikes/draw-calls`](../spikes/draw-calls)).

### Colours

Parts are drawn in the app's own colours: ten light ones round the whole circle of
colour (red, orange, yellow, lime, green, cyan, blue, indigo, violet, pink), and white,
a light grey and a grey. A model can name one for a part; any other colour it gives, or
its files carry, is drawn as the nearest of them, except greys, white and black, which
are drawn as they are, and bare metal. A part given no colour takes the one that falls
to its group. Circuit boards are drawn in green, and in a model with one in it green is
theirs alone: any other part that would be green is drawn in indigo, unless you give it
green yourself. Nothing in the project's files is changed
by this: it is only how the app draws them.

### Glass

A part that is made of something clear, a window or the glass over a dial, is drawn
see-through in solid and in glass alike, with no colour unless it is given one: the
model says so of the part (`finish="glass"`). In pattern, wireframe and outline it is
drawn by its lines, as any other part is. A click on it picks what is behind it, and a
blueprint draws what it covers.

### Curves

What is round is drawn round. The exporter cuts every curve into flats that keep within
a fiftieth of a millimetre of it, however big the curve is, so the rim of a dial is as
smooth as a pin; a model built before that was so is drawn in fewer, until its project's
`enclose.py` is replaced with the app's and it is built again.
