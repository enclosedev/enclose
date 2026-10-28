# Circuit boards

A project in Enclose can have circuit boards: the boards that go in the thing that is
modelled. Each is designed with [tscircuit](https://docs.tscircuit.com), which writes a
board as React in TypeScript, and is built with the app's own script. The user finds
the boards with the PCB button beside the view, each with a picture of it, and opens
one in PCB mode, where it takes the model's place: drawn as it is made (copper, pads and
print on the board), as its schematic, or in 3D. A board that is only roughed out so far
is listed as Unfinished.

A board is also part of the model. Its 3D comes out of the build as a STEP file, which
`model.py` reads and puts where the board goes in the thing, so that the case is shaped
round the board as it will be made.

## The files

A board's files are all in `pcb/`, at the top of the project, each named for the board:
lower-case letters, figures and hyphens (`main`, `power-board`).

```
pcb/
  main.circuit.tsx      the board, which you write
  main.board.json       what it is called, and whether it is finished
  build/                what the build makes of it: never edit these by hand
    main.circuit.json   the board as tscircuit has it, which the app draws it from
    main.glb            the board in 3D, as the app shows it
    main.step           the board in 3D, for model.py to read
    main.parts.json     the makers' own 3D models of its parts, which read_board
    main.parts/         puts on the board (see Fitting it into the model)
    main.gerbers.zip    what a board house makes it from, which the user saves from
                        PCB mode: Gerbers, drill files, a BOM and where each part goes
    main.preview.json   a quick look at it, unrouted, which the app makes by itself as
                        you write it, for the user to see it come together: leave it be
    main.pcb.png        pictures of it, for you to check it by
    main.schematic.png
    main.3d.png
```

`main.board.json` is small, and written by you:

```json
{ "name": "Main board", "finished": false }
```

`name` is what the list and PCB mode call it. `finished` is false while the board is
only roughed out, and true once it is the board to be made. Write it with the board,
and change `finished` when that changes.

Keep everything a board is made of in `pcb/`: the build copies that folder, and nothing
else, to build in.

## Building

From the top of the project:

```
node "<the app's kit>/board.mjs" pcb/main.circuit.tsx
```

Your instructions give the script's path. It runs tscircuit's own `tsci build`, at the
version the app is known to work with, and writes `pcb/build/`. The app shows what it
built by itself: there is nothing to tell it. Do not copy the script into the project.

- It needs Node.js 18 or later (`node --version`). Where there is none, say that the
  boards need Node.js, and offer to install it (`brew install node`, or nodejs.org).
- The first build fetches tscircuit itself, some hundreds of megabytes, once, and takes
  a minute or two. Later builds take seconds, and longer for a board with much to route.
- It prints tscircuit's errors and warnings. On an error the build fails and what was
  built before is left as it was. Warnings that no part number was given, or that a
  pin's use is not said, matter for a detailed board, not a rough one.
- It mends the BOM and the placement file in the Gerbers' zip as JLCPCB reads them:
  each part named by its maker's number and its package, and turned the way JLCPCB's own
  footprint of it needs (see Before it is ordered). It says which parts it turned.
- A finished board's build ends with the checks it is ordered by (see Before it is
  ordered): read them. A rough board's says what is wrong with its lettering (see
  Lettering).
- Anything after the board's file goes to `tsci build` as it is. `--routing-disabled`
  builds it unrouted, whatever the board says: for the first steps of a detailed board
  (see A rough board, and a detailed one).

Look at the three pictures in `pcb/build/` before you report a board, and mend what is
wrong. Your screenshot tool shows the model's view, not PCB mode.

Build again after every change to a board, however small, before you report it: a
part number, a value, a footprint. The Gerbers' zip, with its BOM, and the STEP file
are made only by a build. While you write the board, the app redraws it in PCB mode by
itself, but that is a quick look and builds none of these. So a change made without a
build shows in PCB mode while the user would still order the board as it was before.

## Writing a board

A board is a default export that returns a `<board>`. Sizes are in millimetres. A part is
placed by its middle, from the middle of the board (`pcbX`, `pcbY`, with Y up), and
turned with `pcbRotation`, in degrees.

```tsx
export default () => (
  <board width="50mm" height="30mm" thickness="1.6mm" pcbStyle={{ silkscreenFontSize: "1.1mm" }}>
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{ pin1: "VCC", pin4: "GND", pin8: "OUT" }}
      pcbX={-10}
      pcbY={0}
    />
    <resistor name="R1" resistance="10k" footprint="0603" pcbX={6} pcbY={5} />
    <led name="D1" color="red" footprint="0805" pcbX={16} pcbY={5} />
    <trace from=".U1 > .OUT" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".D1 > .anode" />
    <trace from=".U1 > .GND" to="net.GND" />
    <hole diameter="3.2mm" pcbX={-22} pcbY={12} />
  </board>
)
```

- A board that is not a rectangle has an `outline` in place of its size: points round
  it, about its middle (`outline={[{ x: -20, y: -10 }, ...]}`). A round one is a ring of
  points, one for every degree or so (360 for a whole circle): with fewer, the model
  shows its edge as flat sides.
- Give its thickness: 1.6 mm is what most boards are made at, and tscircuit's own is
  1.4 mm.
- A mounting hole is a `<hole>` with a keep-out round it, so that no trace runs where the
  screw's head, or its washer, presses on the board (or, under it, the post it goes
  into): a circle on both sides, as wide as the head, or the washer, and 0.5 mm more all
  round. The library of screws has how wide each head is
  (`Screw("M2.5", 6, "pan").head_diameter`).

  ```tsx
  {/* an M2.5 pan head is 5 mm across: 2.5 mm, and 0.5 mm more */}
  <hole diameter="2.9mm" pcbX={20} pcbY={-13} />
  <keepout shape="circle" radius="3mm" pcbX={20} pcbY={-13} layers={["top", "bottom"]} />
  ```

  Give it its layers: without them the router runs traces through it as if it were not
  there. (`<pcbkeepout>`, which tscircuit's documentation names, is not known to the
  tscircuit the app builds with: it is `<keepout>`.)
- What is printed on the board, its names and dots, is in Lettering, below.
- A footprint is named as tscircuit names them (`0402`, `0603`, `soic8`, `sot23`,
  `qfn32`, `pinrow4`, `pushbutton`), or comes with a real part. To find one with its
  stock: `npm_config_allow_git=all npx --yes -p tscircuit tsci search --jlcpcb "ESP32-C3"`.
- The rest of what tscircuit has, and how each element is used, is in its documentation
  at https://docs.tscircuit.com. Where you have a skill for tscircuit, use it. What each
  element takes, as the tscircuit the app builds with has it, is in its own files, which
  npx keeps: `~/.npm/_npx/*/node_modules/@tscircuit/props/lib/components/`. Look there,
  and never search the whole disk or the home folder for them (`find /`, `find ~`): the
  Mac stops the user to ask whether the app may look in each of their private folders.

## Lettering

What is printed on the board is read by whoever plugs a cable into it, solders it or
mends it: what each connector is for, which way round its cable goes, and which part
is which. Print that and nothing else, each word where it is read at once.

- Lettering is 1.1 mm tall. Set it once on the `<board>`, with
  `pcbStyle={{ silkscreenFontSize: "1.1mm" }}`: every part's name and every
  `<silkscreentext>` takes it. Give a `fontSize` only to lettering that has to be
  bigger or smaller, and none under 0.8 mm.
- In capitals, always: tscircuit's font prints lower case poorly. A net whose name has a
  lower-case letter is written as what it does (`BOOT`, not `nRPIBOOT`).
- Name each connector by what plugs into it (`BATT`, `SPK`, `USB`), beside it. Put a dot
  by its pin 1, so that it is seen which way round its cable goes:
  `<silkscreencircle radius="0.2mm" strokeWidth="0.4mm" />`, which comes out a solid
  dot 0.8 mm across. (`isFilled` is not heeded: a circle of radius 0.4 mm comes out a
  ring.) Put it just outside the connector's outline, beside pin 1, and 0.2 mm or more
  clear of every pad. The dot says which
  pin is pin 1: write nothing that says it again (`pin 1 = VCC`).
- Name a connector's pins only where a cable is wired to them by hand, one short word
  each (`GND`, `TX`), beside its pin.
- Print no notes. What whoever wires it needs to know (a cable that must be
  straight-through, say) goes in your reply.
- Each word reads from the bottom of the board, or turned a quarter to read from its
  right (`pcbRotation={90}`): never upside down, or from top to bottom.
- Keep each word clear: of every other word, of every pad and hole by 0.2 mm (what is
  printed on copper is cut away when the board is made), of the parts' outlines and the
  dots, and 0.5 mm inside the board's edge.

tscircuit prints every part's name (`R1`, `J2`) by itself, beside it and turned with
it: where that is, it is often in another's way, upside down, or over the edge. A
connector named by what plugs into it needs no `J2` as well. To have a part's name
elsewhere, hide tscircuit's and print it yourself:

```tsx
<resistor name="R5" ... pcbSx={{ "& silkscreentext": { visibility: "hidden" } }} />
<silkscreentext text="R5" pcbX={21} pcbY={-28.8} />
```

(A part's own footprint can carry other lettering, which that hides too.) On a crowded
board, leave off the names of small parts with no room beside them, rather than crowd
them in, and say in your reply which.

The build measures the lettering as it is printed, and says what is wrong with it: in
lower case, running into something, over the edge or upside down. Mend everything it
says. The board's picture (`pcb/build/<name>.pcb.png`) is too small to judge lettering
by: go by what the build says, and look at the picture for where each word is.

## Artwork

A board can carry artwork in its print as well: the user's logo, a drawing, a pattern,
the name of the thing in its own lettering. Put it on when the user asks, from a picture
they give you (an SVG, a PNG or a JPEG: a file, or a path to one) or drawn by you. A
picture attached to a message is not a file you can use: ask for the file.

1. Put the picture in `pcb/art/`, named for what it is (`pcb/art/logo.svg`). To draw one
   yourself, write it there as an SVG: shapes, strokes, text and transforms all do, in
   black on nothing. Draw it at the size it is printed at, and keep every line and
   every gap 0.15 mm or more there: finer is printed broken, or filled in.
2. Make it into artwork, with the app's script beside `board.mjs`, saying how wide (or
   how tall) it is on the board in mm:

   ```
   node "<the app's kit>/board-art.mjs" pcb/art/logo.svg --width 20
   ```

   It writes `pcb/art/logo.ts`, the picture traced into outlines tscircuit prints as
   they are. `--light` prints what is light in the picture rather than what is dark (a
   logo drawn white); `--bottom` is for the underside, mirrored to read from there. It
   says where the picture is too fine to print at that size: make it bigger, or its
   lines bolder. Make it again whenever the picture or its size changes: never write
   the `.ts`, or a `<silkscreengraphic>`, by hand.
3. Print it, from the board's file:

   ```tsx
   import logo from "./art/logo"
   ...
   <silkscreengraphic {...logo} pcbX={12} pcbY={-6} />
   ```

   `pcbRotation` turns it. Put it where there is room for it: clear of every pad and
   hole by 0.2 mm, of the lettering, and 0.5 mm inside the edge, which the build checks
   with the lettering; and not under a part, which hides it. The underside, with no
   parts on it, often has the most room.

## The schematic

The user reads a board's schematic in PCB mode, as well as the board itself. Draw it on
a sheet, in sections, one for each thing the board does (its power, its controller,
each connector and what it drives), each with a title and dashed lines between them:

```tsx
<board width="50mm" height="30mm" thickness="1.6mm">
  <schematicsheet name="main" displayName="Main board">
    <schematicsection name="power" displayName="Power" />
    <schematicsection name="controller" displayName="Controller" />
  </schematicsheet>
  <chip name="U1" schSheetName="main" schSectionName="controller" ... />
  <capacitor name="C1" schSheetName="main" schSectionName="power" ... />
  ...
</board>
```

- Put the sections inside the `<schematicsheet>`: outside it, they get no titles.
- Give every part both `schSheetName` and `schSectionName`. A part without the sheet's
  name is drawn off it.
- Leave out `schX` and `schY`: tscircuit lays out each section's parts by itself, close
  together. Placed by hand, they come out far apart.
- Keep the sheet's own size (A4). Given a smaller `sheetWidth` and `sheetHeight`, its
  frame shrinks from one corner and the parts spill out of it.

## Choosing parts

The board is made by a board house and often put together by hand, and its traces are
run by tscircuit's router, which does well with parts whose pins are well apart and
badly with fine ones. So of the parts that do the job, take the one that is easiest to
route and to solder:

- a chip in a package with leads, SOIC, SOT or TSSOP, over QFN or BGA: the same chip
  usually comes in both (the ATtiny1616 as SOIC-20, ATTINY1616-SNR, as well as QFN-20);
- resistors and capacitors in 0603 or 0805, and 0402 only where there is no room;
- for USB-C that only brings power in, a socket with power pins alone (6 pins: VBUS, GND,
  CC1, CC2), not the 16 or 24 pin one, whose pins are 0.5 mm apart;
- a module (an ESP32, a Pi Pico) where it does what a chip and its parts would.

Take a finer part only where the thing needs it, and say why in your reply.

What JLCPCB charges to assemble a board goes by its parts too. Surface-mounted parts on
the top are the cheapest. Parts through the board cost extra, and so does any part on
the underside, which makes it two-sided assembly. So put every surface-mounted part on
the top where the design allows, and where a part only comes through the board (a pin
header, a terminal block, a big connector), list it in your reply, with its JLCPCB
number, for the user to buy and solder by hand, or to pay for.

## Parts that JLCPCB can assemble

JLCPCB assembles a board from the BOM in its Gerbers' zip. A part with no JLCPCB part
number there is left blank, and the user has to find each one by hand before they can
order. tscircuit gives many resistors and capacitors a number by itself. Every other
part gets one only if the board gives it, alongside the maker's own number:

```tsx
<chip
  name="U2"
  manufacturerPartNumber="AMS1117-3.3"
  supplierPartNumbers={{ jlcpcb: ["C6186"] }}
  footprint="sot223"
  ...
/>
```

- Give every part placed its JLCPCB number, not only its maker's: tscircuit fills one
  in by itself for many resistors and capacitors, but leaves chips, connectors,
  crystals and inductors blank, and JLCPCB then finds them "unmatched".
- Look each part up with `tsci search --jlcpcb` (above), and take one that JLCPCB has
  in stock, in the quantity the user is making. The search matches loosely, and can
  give a different part from the one asked for: check that the part it gives is that
  one, or does the same job in the same footprint. To look a number up by itself:
  https://jlcpcb.com/partdetail/C2040, or
  https://jlcsearch.tscircuit.com/api/search?q=C2040. That one is tscircuit's copy of
  JLCPCB's catalogue, and is missing many parts JLCPCB stocks, its basic resistors and
  capacitors among them: a part it does not find is not therefore unlisted. The build's
  checks ask JLCPCB itself for those.
- Where the maker's part is not stocked, or is discontinued, take one that does the
  same job in the same footprint, and say in your reply which part changed and why. A
  part can be listed under one variant and not another (an encoder's 4225F and not its
  4220F): look for the variants before giving up on it.
- After each build of a rough board, the build lists any part the BOM still has no
  JLCPCB number for; a finished board's checks say the same. A finished board has none.
  If no stocked part can be found for one, say which and why, so the user knows to
  source it themselves.

## 3D models of parts

Each part placed needs a 3D model, or the board in 3D, in PCB mode and in the model, has
bare pads where it is. A footprint named as tscircuit names them (`soic8`, `0603`) and a
part imported from JLCPCB come with one. A footprint written by hand in the board
(`<footprint>…</footprint>`) has none: give the part a `cadModel`, from EasyEDA, whose
library is JLCPCB's:

```tsx
<chip
  name="SW1"
  footprint={<footprint>...</footprint>}
  cadModel={{
    objUrl: "https://modelcdn.tscircuit.com/easyeda_models/download?uuid=<uuid>&pn=C<n>",
    modelOriginPosition: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
  }}
  ...
/>
```

- The uuid is in EasyEDA's data for the part,
  `https://easyeda.com/api/products/C<n>/components?version=6.4.19.5` (ask it as a
  browser does, with a browser's User-Agent, or it turns you away): the `SVGNODE` entry
  in `result.packageDetail.dataStr.shape`, `attrs.uuid`, beside `c_origin` and
  `c_rotation`.
- The OBJ is in mm, Z up. `modelOriginPosition` is the point of the model as it comes
  that is to sit at the middle of the part's pads.
- Work out its turn by matching the model's pins (its vertices below z = −1.5, in
  clusters) to the board's holes or pads, not by what the conventions should be. A part
  on the underside is where this goes wrong.
- Check it in the board's GLB (`pcb/build/<name>.glb`, which is what PCB mode shows),
  measuring where its pins or its body are: not in the STEP, which tscircuit turns
  differently for a part on the underside. And check `cad_component` in
  `pcb/build/<name>.circuit.json`, not in the preview, which can turn a part on the
  underside otherwise than the build does.

## Routing

The board is routed by tscircuit's own router, in the build. Never write a router of
your own, a script that works traces out and writes them into the board, and never
route a whole board by hand: tscircuit's router is what is kept up to date, and the app
follows it as it routes. Help it where it needs help:

- A part with many fine pins (QFN, a fine-pitch chip, a module's castellated pads) goes
  in a `<fanout>`, which brings its pins out first and has the rest routed from there:
  `<fanout padding={1}>` round the `<chip>`, with its traces outside as before. On a
  board with inner layers, `<fanout autorouter="dogbone" fanoutRoutingLayers={["inner1"]}>`
  takes each pin down a via beside it instead.
- Where the order matters, route in phases: `<autoroutingphase phaseIndex={0}
  connections={["U1.pin1", "J1.pin2"]} />` routes those first, power and the longest
  runs say, and each later phase routes round what is there. One with `reroute` and a
  `region` or a `connection` routes those again.
- A trace drawn by hand (`pcbPath`) is only for a short way out from among a part's
  pins, where the fanout does not do: as much of it as gets it clear.
- Keep traces 0.15 mm wide or more, and those that carry the current of a motor or a
  light wider. Read the build's warnings for traces that cross, or come too close: a
  board with any is not done.
- Pour ground over both sides of a detailed board, after its traces:
  `<copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" boardEdgeMargin="0.5mm" />`
  and the same with `layer="bottom"`. It joins ground up where traces would not, and
  keeps noise down. Leave a side bare only where there is a reason, such as a module's
  antenna that wants no copper under it (an `outline` keeps the pour to the rest), and
  say why. A rough board has none.

(https://docs.tscircuit.com/elements/fanout and /elements/autoroutingphase have more.)

Where the router still cannot route everything, change the board rather than the
router: give the parts more room, move or turn the ones whose connections cross, take a
part whose pins are further apart, or use four layers. If it still cannot be routed,
say which connections are left and what would free them, and leave it unfinished.

## A rough board, and a detailed one

Designing a board in detail is other work than shaping the thing, and takes a good while.
So a board is often made rough first, to keep the design of the thing going, and made in
detail later, when the user is ready for it.

A rough board (`"finished": false`) is what the shape of the thing needs to know:

- its outline, cut to the room the thing has for it, and its thickness;
- its mounting holes, where the thing's posts or screws will be, each with its keep-out;
- the parts that decide the shape, at their real footprints and where they go:
  connectors at the edge where they come through the case, buttons, lights that show,
  a display, the battery or its holder, a module such as an ESP32 or a Pi Pico;
- and nothing else: no small parts, no traces, and `routingDisabled` on the board.

Make it in minutes, build it, fit it into the model, and say in your reply that it is
rough and can be made in detail when they want.

A detailed board (`"finished": true`) is the board to be made: every part a real one,
named by its maker's part number and by the JLCPCB number of a part in stock (see Parts
that JLCPCB can assemble); every pin that is used labelled; every connection made, with
traces and nets; routed by the build; built without errors; and passing every check it
is ordered by (see Before it is ordered). Make it from the rough
one, where there is one: keep its outline, holes and the parts the thing was shaped
round where they were, unless the user agrees to move them, and say what moved.

A detailed board takes a while, and the user watches it come together in PCB mode,
which the app opens on a board made in the background when it is first built. So build
it in steps, and build after each one, rather than once at the end:

1. placing: its outline, holes and every part, placed where it goes;
2. connecting: every connection, still unrouted, which the drawing shows as straight lines;
3. routing: routed, by the build;
4. checking: the checks it is ordered by (see Before it is ordered), and putting right
   what they find.

Build the first two with `--routing-disabled` after the board's file. Where you have
the app's `step` tool, as the agent making a board in the background does, say with it
which step you are at as you begin each one, and again whenever you go back to one: to
routing again after a check failed, say. A board that is already made and is being
changed goes through the steps it needs: say the one you begin at.

Say in a few words what you are at as you go: it is how the user follows the work.

## Before it is ordered

A finished board is one the user can order from JLCPCB as it is, assembled. The build of
a finished board ends with the checks it is ordered by, which the app's script
`board-check.mjs`, beside `board.mjs`, makes; it can be run by itself on a board that is
built, the same way: `node "<the app's kit>/board-check.mjs" pcb/main.circuit.tsx`. Do
not mark a board finished, or report it finished, until every check passes, and say in
your reply how each came out:

1. Part numbers: every part placed has a JLCPCB number, of a part JLCPCB lists and has
   in stock, and the BOM names each by its maker's number and package.
2. Rotations: JLCPCB turns its own footprint of a part by the placement file's rotation,
   from that footprint's 0°, which is often not tscircuit's. The build sets each from
   EasyEDA's footprint, pin on pin. Where it cannot tell (its pins are named otherwise,
   or EasyEDA has none), say so: the user checks it by hand on JLCPCB's preview, which
   can snap a part onto pads it does not fit, so a wrong turn can still look right.
   Tell the user that the magenta dot of each part there must sit on its pin 1, and
   where that is: the check says, part by part.
3. 3D models: every part has one (see 3D models of parts).
4. Lettering: every word printed on the board is in capitals, reads upright, and is
   clear of the rest and of the edge, and so is its artwork (see Lettering, and
   Artwork).
5. Up to date: the Gerbers' zip is of the board as its file is now. Only a build makes
   it, so build again after any change; never edit the zip by hand, which the next
   build writes over.
6. tscircuit's checks: no shorts, a whole netlist, and parts placed clear of each other.
7. What the assembly costs, for the user to know: the parts through the board and those
   on the underside (see Choosing parts).

A check that could not be run, offline or turned away, is not a pass: say which, and
run the checks again (the script) before you call the board finished.

## Fitting it into the model

The board is read into `model.py` with `enclose.read_board`, by its name. It gives the
board from its STEP file, and every part on it whose maker's own 3D model tscircuit could
not put in that file (it often cannot): the build fetches those, and `read_board` puts
each where the board's layout has it. So draw no stand-in for a part that is on the board:
it is there as it is made. All of it has the board lying flat, its middle at the origin
and halfway through its thickness, the side its parts are on facing up (+Z), and the
board's own X and Y as the model's. Put it where it goes with one placing, as one part,
in the group for the electronics:

```python
from build123d import Pos, Rot
from enclose import read_board

placing = Pos(0, 0, 12) * Rot(0, 0, 90)  # where the board goes, and which way round
model.part(
    "main_board",
    [placing * found.shape for found in read_board("main")],
    label="Main board",
    group=electronics,
)
```

An `enclose.py` with no `read_board` in it is an older copy: copy the app's in again
first. The part the board is put in is known for one, and drawn in green, the colour the
app draws boards in: give it no `color`, and give green to nothing else. Give a part of the board a part of its own (`found.label` is its name on the
board, U1 or J2) only where it is to be told apart in the model: a button that comes out
through the case, say.

- Where the model had a plain block standing in for the board, the board takes its
  place: the same spot, the same way up.
- Take the numbers that the case and the board share from one place: the outline, the
  holes and the posts under them, and where a connector comes through a wall. Write
  them once, at the top of `model.py`, and copy them into the board, so that when one
  changes both are changed.
- Build the board before the model, then the model, and check them together in a
  screenshot.
- When the board needs more room than the thing has, say so, and change the one the user
  cares less about: the case to fit the board, or the board to fit the case. Say which.
- Leave each connector room to be used, not only to sit in. Room for the plug to go in
  straight and be held while it does, as wide as the plug's body and its latch, with
  0.5 mm more all round. Room for the cable to come out and bend no tighter than its
  maker's drawing allows, a flat flex cable most of all. Room for fingers where the plug is
  pushed in or pulled out by hand: about 8 mm on the side it is gripped from. An opening
  in the case for a connector is the plug's size with 0.5 mm all round. Look at each one
  in a screenshot with the model built, from the side the plug comes in from.
- Where the model needs changing for that, a small change is made without asking:
  moving or widening an opening, a post or a rib by a few millimetres, or a wall made a
  little thicker or thinner where nothing else depends on it. A large one is asked
  first: what it would change in the thing and why the board needs it. A change to the
  thing's outer size, to how it comes apart, to where its parts go, or to how it looks
  is large.
