# Tools for a model

A project in Enclose can have tools of its own: controls made for its one model, to move
it, run it and try it out. The hands of a clock set to a time, a lid opened by a slider,
a robot arm steered joint by joint. The app has no animation feature and no simulator.
A tool, written for the model in front of you, is how a model is made to do something.

A tool is one JavaScript file in `tools/` at the top of the project. The app shows each
as a tab in its Tools panel (the blue button at the right of the view), and loads a file
again whenever it is written. Nothing is installed, built or registered.

    tools/clock.js        the tab is called by the tool's name: "Clock"
    tools/lid.js

File names are lower case, with digits and dashes (`robot-arm.js`). Tabs are in the
order of the file names.

A tool changes nothing in the project's files and nothing in the model as built. It
moves the parts as they are drawn, for as long as the user has the tools up.

## The file

```js
// tools/lid.js
export default {
  name: "Lid",
  controls: {
    angle: {
      kind: "slider",
      title: "Open",
      description: "How far the lid is lifted.",
      min: 0,
      max: 110,
      value: 0,
      format: (degrees) => `${Math.round(degrees)}°`,
    },
  },
  frame(tool) {
    // the lid follows the slider as a lid with some weight to it would, and not at a jump
    const angle = tool.glide("lid", tool.values.angle, 0.3)
    // the hinge runs along X, at the back edge of the box, 40 mm up
    tool.part("lid").turn({ by: -angle, axis: "x", about: [0, 30, 40] })
  },
}
```

- `name`: what the tab says. One or two words.
- `controls`: one entry to a control, shown one under another in the order written.
  The key is the control's id.
- `frame(tool)`: called every time the view is drawn, about sixty times a second, for
  as long as the tools are up. It says where every moving part is **now**, from how the
  controls stand. Parts start each frame where the model has them, so whatever `frame`
  does not move is where it was built.

The file is an ES module, run in a sandbox: it has no `window`, no DOM, no network and
no files, and cannot `import` anything. Plain JavaScript, `Math` and `Date` are there.
Keep state in variables at the top of the file.

## Controls

Every control takes a `title` (one or two words) and a `description` (one short
sentence, shown under the title: what the control does, not how to use a slider). The
user reads these at a glance, so keep both short.

| kind      | what it is                         | takes                                              | its value            |
| --------- | ---------------------------------- | -------------------------------------------------- | -------------------- |
| `slider`  | a number along a line              | `min`, `max`, `step`, `value`, `format(value)`     | a number             |
| `pad`     | two numbers in a square, by a knob | `x: {min, max}`, `y: {min, max}`, `value`, `springs`, `format([x, y])` | `[x, y]` |
| `toggle`  | on or off                          | `value`                                            | `true` or `false`    |
| `choice`  | one of a few, side by side         | `options`, `value`                                 | an option's id       |
| `list`    | one of many, one under another     | `options`, `value`                                 | an option's id       |
| `palette` | one of the app's colours           | `options` (colour names; all of them if left out), `value` | a colour's name |
| `buttons` | things to press                    | `options`, `press(id, tool)`                       | none                 |
| `readout` | something the tool says            | `value`                                            | a string             |

- `options` is a list. Each is a word (`"Open"`), or `{ id, label, icon }` with either
  or both of `label` and `icon`. The icons: play, pause, stop, rewind, forward, back,
  next, reset, plus, minus, up, down, left, right, home, clock, loop, shuffle.
- `format` words a slider's or a pad's value for the user: `(v) => v.toFixed(1) + " mm"`.
- A `pad` with `springs: true` goes back to rest when it is let go of, as a joystick
  does. Up is more, as on a graph.
- A `palette` offers the app's own colours and no others: red, orange, yellow, lime,
  green, cyan, blue, indigo, violet, pink, white, grey.
- Any control with a value can have `change(value, tool)`, called when the user sets it
  by hand (not when the tool sets it itself).

There are no other kinds, and a tool cannot draw a control of its own or change how
these look: they are the app's, the same in every project. Make what is needed out of
these: a four-way control is a `pad` or four `buttons`. Where the user asks for a kind
there is not, build the nearest thing from these and tell them so; adding a kind is a
change to Enclose itself, which is not made from a project.

## What `tool` is

`frame`, `press` and `change` are all handed the same `tool`.

- `tool.values`: the controls' values by id. Read them (`tool.values.angle`) and set
  them (`tool.values.angle = 30`, or `tool.set("angle", 30)`): a tool moves its own
  slider this way, and says what a `readout` shows. A value that the control cannot
  take is an error.
- `tool.dt`: seconds since the frame before, never more than a tenth. Multiply speeds
  by it. `tool.elapsed`: seconds the tool has been running.
- `tool.glide(name, to, seconds)`: a number on its way to `to`, as a machine would take
  it there: where it has got to by this frame. It is how nearly everything is moved
  (see "Moving as a machine does").
- `tool.part(id)`: one part of the model, by its id in the manifest.
  `tool.parts(id, id, ...)`: several, held as one. `tool.group(id)`: all the parts of a
  group. An id the model does not have is an error that names the ones it has.
- `tool.model.parts`: every part, each with `id`, `label`, `group`, and where it is as
  built: `min`, `max`, `center`, `size`, in mm. `tool.model` has the same four for the
  whole model.

What a part (or several held as one) can be told, in `frame` only:

- `.turn({ by, axis, about })`: turned `by` degrees about the line through the point
  `about` that runs along `axis`. `axis` is `"x"`, `"y"`, `"z"` or a direction
  `[x, y, z]`; left out, it is Z. `about` is a point `[x, y, z]` in mm; left out, it is
  the middle of the part's own box, which is right for a wheel and wrong for a hand, a
  lid or anything else that turns about its end. Positive is anticlockwise seen from
  where the axis points to.
- `.move([x, y, z])`: carried that far, in mm.
- `.hide()`, `.show()`: out of sight for this frame, or back.
- `.color(name)`: drawn in one of the app's colours for this frame.
- It also has `id`, `label`, `group`, `min`, `max`, `center` and `size`, as built.

They chain, and are done in the order written: `tool.part("arm").turn({...}).move([...])`.
Coordinates are the model's own: millimetres, Z up, as built, whatever has been moved.

Moving parts in `press` or `change` is an error: those happen once, and every frame is
drawn afresh. Have them change a variable or a control's value, and move the parts by
it in `frame`.

## Moving as a machine does

Nothing a well-made machine moves is at its full pace the instant it starts, or stops
dead where it arrives. It sets off gently, comes up to its pace, and comes gently to
rest. So a tool does not put a part straight where a control says, and does not step it
there at one pace (`angle += SPEED * tool.dt` until it arrives). It asks `tool.glide`
where the part has got to, and puts it there:

```js
frame(tool) {
  // a button or a toggle says where the lid is to be; the lid takes a second to go
  const angle = tool.glide("lid", tool.values.open ? 110 : 0, 1)
  tool.part("lid").turn({ by: -angle, axis: "x", about: [0, 30, 40] })
}
```

`tool.glide(name, to, seconds)` gives back a number that is on its way to `to`. `name`
is a word of your own for that number, the same every frame; `seconds` is how long the
move takes (0.6 if left out). Call it in `frame`, every frame, whether or not anything
is moving, and move the part by what it gives back. It starts at rest, wherever it is
first told to be, so the tool starts as built.

- **When `to` jumps** (a button, a toggle, a choice, a pose) the number takes `seconds`
  to get there, all of it and no more, from rest to rest. Sent somewhere else on the
  way, it comes round without a jerk.
- **When `to` wanders** (a slider or a pad under the user's hand) the number follows
  half of `seconds` behind, and the stops and starts of the hand are rounded off.
- **It is never past where it was told to be.** A part its control keeps within a range
  stays within it.
- **Several sent at once, with the same `seconds`, arrive together**, however far each
  has to go. That is how the joints of an arm go to a pose as one move: glide each
  joint's angle, all with the one time.

Give a move the time the real thing would take. A catch or a button, a quarter of a
second. A lid, a door or a drawer, about a second. An arm going to a pose, a second or
two. What is bigger and heavier takes longer. Under the user's hand, 0.2 to 0.4, so
that the part still answers at once. `seconds` can be different from one frame to the
next (short under a hand, long on the way to a pose): a move under way comes round to
it.

Something that runs comes up to its speed and runs down from it. Glide the speed, and
step the angle by it (see "Something that runs").

What does not glide is what is exact by its nature, or sudden: the hands of a clock
that shows the time it is set to, the tick of an escapement, a part hidden or coloured.
A press, a catch let go or a blow is quick, but still takes its tenth of a second.

## Things that ride on other things

A part that is carried by another has to be told both moves, its own first and then
its carrier's. For an arm with a shoulder, an elbow and a wrist, start at the hand and
work inwards, each time taking everything further out along:

```js
frame(tool) {
  const { shoulder, elbow, wrist } = tool.values
  tool.part("hand").turn({ by: wrist, axis: "y", about: WRIST })
  tool.parts("forearm", "hand").turn({ by: elbow, axis: "y", about: ELBOW })
  tool.parts("upper-arm", "forearm", "hand").turn({ by: shoulder, axis: "y", about: SHOULDER })
}
```

The points are where the joints are as built: each later turn carries the earlier ones
round with it. (Each of those angles would be glided first, all in the same time:
`tool.glide("elbow", elbow, 0.3)`.)

## Something that runs

Keep the state in a variable, and step it by `tool.dt`:

```js
let angle = 0
export default {
  name: "Fan",
  controls: {
    run: { kind: "toggle", title: "Run", description: "Spin the blades.", value: true },
    speed: { kind: "slider", title: "Speed", description: "Turns a second.", min: 0, max: 5, value: 1 },
  },
  frame(tool) {
    // it spins up to its speed over a second and a half, and runs down as long
    const speed = tool.glide("speed", tool.values.run ? tool.values.speed : 0, 1.5)
    angle += 360 * speed * tool.dt
    tool.part("blades").turn({ by: angle, about: [0, 0, 120] })
  },
}
```

A tool is started again whenever its file is written or the model is built, with its
controls as the user left them and its variables as the file sets them. So what has to
survive that goes in a control's value, not only in a variable.

## Before you write one

- **What moves has to be a part of its own.** A hand drawn in one piece with its dial
  cannot turn. If the model has the moving thing fused to something that stays, change
  the model first so that it is separate, and build it.
- **Get the pivots from the model.** Take each joint's point and axis from the model's
  script, or from the parts' boxes (the app's parts tool gives them), never by eye. If
  the model's script computes them, have it print them and copy the numbers in.
- **Gears and anything else that drives another** turn by their ratio, in opposite
  directions where they mesh. Work the ratios out from the model, and say them in a
  comment.
- **Nothing jumps, and nothing goes at one pace.** Whatever goes from one place to
  another glides there (`tool.glide`), in the time the real thing would take; whatever
  runs spins up and runs down. A model that snaps from shut to open, or is carried at
  the same pace from start to stop, looks drawn and not made.
- **Few controls, well named.** Three good controls beat ten. Give each the range the
  real thing has: a lid that opens to 110°, not a slider from 0 to 360.
- **Start as built.** With its controls as the file sets them, a tool should leave the
  model as it is built, or at a sensible rest: the user has not touched anything yet.

## Check it

After writing or changing a tool, check it the way you check a change to the model:

1. Ask the app how the tools stand (its `tools` tool). A file that did not load, or
   failed while running, comes back with its error and the line.
2. Work a control (its `tool` tool: set a value or press a button), and take a
   screenshot. Look at whether the part went where it should, about the right point and
   the right way round. Try both ends of a slider. The app waits for what the control
   set gliding to come to rest before it answers, up to six seconds, so the screenshot
   is of the model where the tool leaves it.

An error stops the tool until its file is written again; the user sees it in the tab,
with a button that brings it to you.
