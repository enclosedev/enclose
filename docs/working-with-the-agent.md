# Working with the agent

The agent is a command-line agent already on your machine, signed in there and run in
the project's folder: Claude Code (through its
[Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)), Codex, Grok or
opencode, whichever you [pick](#the-agents). The app has no login of its own, and keeps
no credentials but a key you give it yourself as a variable in the settings (Providers);
if you need to sign in again, do it in the agent. Cmd+B shows the conversation, and puts
it away again.

## The agents

Each is its maker's command-line agent, and answers once it is switched on: only Claude
is on to begin with. The [settings](settings.md) show which of them the app found
(Providers), switch each on or off, and hold what each is started with. opencode answers
with an account signed in or without one, on its free models; looking at it leaves one
empty session behind in its list, which is where its models come from.

The marks of all of them are in a row over the [choices](#model-effort-and-access)
under the message. Click one and the next conversation is had with that agent, with its
models to choose from. A conversation under way is carried on by the agent it began
with, so there another's mark begins a new one, [from the model as it is](#versions),
and keeps what you were writing. A mark drawn grey cannot be picked, and says why with
the pointer on it: the agent is switched off, or was not found on the machine.

What this page says is so whichever of them answers, but for a few things:

- Only Claude asks its [questions](#questions) as a form to click through: the others
  ask them in what they say.
- The skills and commands that $ and / [bring up](messages.md#parts-skills-and-commands-by-name)
  are Claude Code's.
- Only Claude passes on what you say of a board while it is
  [made in the background](#circuit-boards).
- Grok and opencode cannot see [pictures](messages.md#pictures).
- A few short things are written by the quickest of Claude Code's models, whichever agent
  answers, where Claude is switched on: what a [card](#conversations) says of a long
  message, the name of a [group you make](parts.md#changing-the-groups-by-hand), and what
  a [commit](projects.md#history-and-backup) says of a turn. What is made of each picture
  on the [inspiration board](#the-inspiration-board) is written by Claude Code too, with
  one of its models that sees pictures well; with Claude switched off, by Codex, with the
  model chosen for it under the message. With neither, the pictures go unlooked at, and
  the agent opens them itself when it needs to.

## What the agent works on

The agent works on the project, and not on the app. What it makes for you is made in
the project's folder: the model, a reference scene, tools. It is told that Enclose itself
is not its to change, whoever asks: not its code or the files it keeps for projects to
copy, and not how its view, its panels or a tool's controls look and work. Asked for
that, it says so and offers what can be done in the project. The app is open source:
fork it to make it otherwise.

## What the agent is given

On top of what the agent can already do, the app gives it three tools: a screenshot of
the view as you see it, the list of parts with their groups and sizes, and your current
selection. It has two more for a project's own tools, the ones it makes for you to work
the model with: how they stand, with the error of one that did not load, and a hand on
one of their controls, so that it can try what it made and look at the model before it
says it is done. It has one that an [assembly guide](#assembly-guides) is written with:
the agent gives the guide, and the app checks it against the model and files it. And it
has one that begins [a new version](#asking-for-a-new-version) of the project, when you
ask for one.

## What the agent has just made

The model changes on screen as the agent writes it, and not only when it builds it.
While the agent is at work, each time it saves the model's script the app builds the
model again by itself, into a folder of its own and without the STEP downloads, and
shows that until the agent's own build is newer. What it builds is no part of the
project: when the turn is over the view shows the project's own build again. It builds
with the project's build command, from its `enclose.json`, which is run as a command
line. Short of Full access, a command that does more than run a Python file of the
project's, and that is not what the project had when the turn began, is asked about in
the conversation first ("Build the model with this command?"), once in a turn: until you
say yes, no draft is built with it. A project whose `enclose.py` is an older copy has
the agent copy in the app's before it changes the model; until then the model shows
only when it is built.

Parts that the agent adds to a model are shown coming. When the model it built is on
screen they are all light for a moment, where they stand; a light goes across them,
once, and leaves them as they are; and then the camera goes to them, as
[Space](selecting.md#on-its-own-close-to-out-of-sight) takes it to what is picked out.
What of them is behind another part shows more faintly. The first model a project has
comes like this all at once, and is framed whole as any model is when it opens.

It is only what is new that comes so: not a part that was changed, and not parts that
come back when [a change is taken back](#taking-a-change-back) or another conversation
is turned to. If the window was out of sight, it waits until the window is back. Under a
blueprint, and for a part that is not on show, nothing happens; and if your system is
set for less motion, the camera goes and nothing else.

## Assembly guides

**Assembly** (A) puts the model's assembly guides where the view was, as
[Blueprint](blueprints.md) puts its sheets there: A again, the button or Esc brings the
view back. The cards of the other projects close up meanwhile, as they do for the
sheets. A guide says how the thing is put together, a step at a time, for whoever has
its parts on the table. The agent writes it, and the app makes it a page.

### Asking for one

At the foot of the guides is **New assembly guide**, and where a model has no guide yet
the empty sheet in the middle of the view asks for one too. The agent looks at the parts,
their sizes and places, and at how the model is built, works out an order they can go
on in, and writes the steps: what is done in each, which parts it puts on and where they
come from, and what is needed to hand. With something picked out of the model before the
guides are turned to, the button offers a guide to that alone, how it is put together
and fitted, with **Whole model** beside it.

A guide goes down to the single part, and not to the model's groups: a step puts on one
kind of part, in one way. What is put together before it goes on, as a dot is pressed
into its ring or two gears go on the carrier they turn in, is a sub-assembly. It has
steps of its own, and then one that fits it. Only a thing that comes in one piece, like
a bought movement, goes on as one, however many parts the model has it as.

It is asked in the conversation, as a message would be. It can be asked for there in
words too, and changed the same way ("split step 3 in two"). While the agent is at it,
the foot of the view says how long it has been and what it is doing, with a button that
stops it. Writing a guide changes nothing in the model.

### The covers

Each guide has a cover, the one written last first. At its top left, small, is what it
is a guide to, the day it was written and how many steps and parts it has, and at its
top right which version it is. All of the sheet is a line drawing of the thing, which
the agent composes as an advertisement would show it: from the angle it looks its best,
and as big as fills the sheet with the parts that make it what it is, the rest running
off the sheet's edge. A guide written again is the next version, and the ones before
are kept.

Click a cover and the guide opens in your browser. The arrow over it saves it as a zip,
and the red button beside that moves the guide to the Trash, where it can be had back
from.

### The page

A guide is a page: the steps down the left, and the model beside them, drawn as the app
draws it and looked at as a blueprint is, from one of its corners and with no
perspective. A turn of the wheel, a swipe or an arrow key goes on one step, or back
one. The parts of each step come in and go on, lit, over the ones that are on already,
and going back takes the thing apart again. The model fills the window with what is on
so far: the first part is seen close to, and the view draws back as the rest go on. A
sub-assembly is shown alone while it is made up, filling the window, with what it is
called beside the step's number; then the rest comes back, and it goes on as one piece.
A part that goes on behind something shows through it faintly. The model is turned by
pulling it, moved across the window by pulling it with Shift held, and brought nearer
with a pinch. The round button at the top right puts it back as the page had it.

Before the first step the page says what is needed to hand, each thing with a small
picture of it: a hex key, glue, a clamp. Every guide says, and one for a thing that goes
together by hand alone says that.

Opened from the app, the page is served from your own machine and shows the model as it
is now: nothing is copied for it, and it is there for as long as the app is open. The
zip is what to send to someone or to put on a site: a folder with the page and the
parts it shows in it, which opens from its `index.html` with nothing else needed. It
has the model as it was when the zip was saved.

### Where they are kept

In `assembly/` at the top of the project, a small file to a guide
(`assembly/counter-stool-v1.json`), which names the model's parts and holds no copy of
them. So a guide follows the model: a part that has been changed is shown as it now is,
and one the model no longer has is left out, which the cover says. The files are the
project's own, so [each conversation has its own](#versions), and a turn that wrote one
can be [taken back](#taking-a-change-back). [`kit/assembly.md`](../kit/assembly.md)
says how a guide is written, and is what the agent reads before it writes one.

## Circuit boards

The boards that go in the thing are designed with [tscircuit](https://tscircuit.com),
and the agent makes them when a board comes up in what you ask: a PCB, the electronics,
how it is wired. A board in detail, every part chosen and wired and routed, takes a
while, so the agent first asks whether you want that now. If not, it makes a rough one,
the outline the thing has room for, its mounting holes and the parts that decide its
shape, so that the design goes on round it. A rough board is marked **Unfinished**, to be
made in detail when you are ready. Either way the board is put into the model, where it
goes.

**PCB**, beside the view, lists the project's boards, each with a picture of it in 3D,
its name and its size; with none yet, it says to ask for one. Pick one and the view is
in PCB mode, with the board where the model was (its copper in KiCad's colours): the buttons down the
right change over to the board's, and the cards of the other projects are put away. A board opens in
3D; the buttons, or 1, 2 and 3, show it as it is made (**Technical view**), in **3D**, or as its
**Schematic**. Beside **Technical view**, **Bottom side** (S) turns the board over, to show its bottom as it is seen from under it. A drawing is moved with a swipe or a drag and zoomed with a pinch or the
wheel, and a double click shows all of it again. The 3D is looked round as the model is,
with the same camera, with the edges drawn as the model's are, and in the app's own
colours for a board: two greens for its mask, the lighter over copper, a yellow for its
pads, and white for its lettering and for where nothing may go; a theme can change them,
and the pictures of boards and of their parts are drawn in the same colours. **Parts** (P) lists what is on the board, each kind of part once in a small square
with a picture of it in 3D, what it is, and how many of it there are with their names on
the board (C1, C2); a part the board has no 3D of is a grey block its size. Pointing at
one lights those parts on the board in 3D, with the rest of the board darkened round them,
and a click on one brings the camera to them. A click on a part of the board in 3D picks
it out, with its name and what it is beside it and a button to say something of it, as
a part of the model has: what is said goes with the next message, as a chip on the
message box, and the agent is told which part of which board it is about. A message written in PCB mode is about the board on screen. The red **Exit PCB mode**,
last of the buttons down the right, or Esc, brings the model back.

A detailed board is made in the background, by another agent, while the conversation
goes on: it has a card of its own in the conversation, which says what it is at as it
goes, with **Show**, which opens the board in PCB mode, and **Stop**. The card shows
only the last thing the agent said and the step it is on, and once it is done, what came
of it; **See all**, at its foot, opens everything it did and said on the way. Meanwhile the model
is locked. The conversation's agent still answers what you ask; Claude passes on to the
board's agent what you say of the board, where the others ask you to say it again once
the board is done. Asked to change the model, it offers to stop the board or to make the
change when it is done. Cmd+Z waits for the board too, and so does what is said in
another conversation, which goes on once the board is done or stopped. What was made
of a stopped board stays in its files.

When the agent builds a board, PCB mode opens on it, and the model comes back once the
agent is done (unless you picked another board or left PCB mode meanwhile). A detailed
board is built in steps: its parts placed, then connected, then routed. Each build shows
as it comes in, and as the agent writes the board the app makes a quick look at it by itself, unrouted,
so that its parts appear as they are put on it: even while what is written breaks
tscircuit's rules, as a board half written does. While it is routed, the line under the
board's name says how far that has got, and the technical view has what the router is
trying drawn over the board as it goes, a few times a second: the ways it is trying, in
amber, the places it is going between, and the room it has cut the board into. A board made in detail in the background has
its steps at the foot of PCB mode instead, in a row: **Placing parts**, **Connecting**,
**Routing** and **Checking**, each with how long it took, how long it has been going,
or that it has not started yet; and small, on its card in the conversation, how far it
has got. The agent says which step it is at as it begins each.
It often goes back, to routing again after a check failed, say: then the steps after
that one are to come again. (An agent that says nothing of its steps has them gone by
how far each build of the board got.) While it is routed, how far that has got goes
round the step. In the technical view, each trace a build brings draws itself in along
its way as the build comes in, and while the board is being checked a line scans across
it.

For as long as a board is still being made, PCB mode shows it in the technical view,
where what changes is seen first, and goes back to the view you had once nothing is at
work on it any more (unless you picked another meanwhile). The 3D is made only by a full
build, so a board written since its last one says so under its name in 3D: **As last
built, 4m ago**. It looks it too: a light goes
across it, over and over, in each of the three views and on its card in the list; and **Working**
stands in place of **Unfinished**, on its card and beside its name in PCB mode. A board with
nothing of it to show yet turns round slowly in its place. When the light stops, the
board is done.

The download button in PCB mode saves the board's **Gerbers**, the zip a board house makes
it from, with its drill files, what goes on it and where each part goes; or the board in
3D, as **STEP**. An unfinished board's Gerbers are for looking at, not for ordering.
Where the board was changed after it was last built, its Gerbers are outdated, and
**Refresh Gerbers** there asks the agent to build it again.

The BOM and the placement file in the zip are written as JLCPCB reads them: each part
named by its maker's number and its package, and turned the way JLCPCB's own footprint of
it needs. A finished board is checked as it would be ordered each time it is built, and
the agent says how the checks came out: every part has a JLCPCB number of a part in stock,
sits on its pads as JLCPCB turns it, and has a 3D model; the zip is of the board as it is
now; tscircuit finds no shorts and no parts in each other's way; and which parts cost
more to assemble, through the board or on its underside. Before you order, ask the agent
whether the board is ready: it checks it again, with
[`kit/board-check.mjs`](../kit/board-check.mjs), and says what to look at yourself on
JLCPCB's site.

A board is kept in `pcb/` at the top of the project: its tscircuit file
(`pcb/main.circuit.tsx`), a small file with its name and whether it is finished, and in
`pcb/build/` what is built of it, which the agent builds with the app's
[`kit/board.mjs`](../kit/board.mjs). That needs [Node.js](https://nodejs.org), and
fetches tscircuit the first time. The parts on it come with their makers' own 3D models,
which the build fetches, so that the board in the model is the board as it will be made. [`kit/pcb.md`](../kit/pcb.md) says how a board is
written and fitted into the model, and is what the agent reads before it makes one.

The [Table clock](projects.md#starting-from-an-example) example has a board to try all
this on: the one that keeps its time and steps its motor, built and fitted into the case
behind the motor.

## The inspiration board

**Inspiration Board** (Shift+I), beside the view, puts the project's board of pictures
where the view was: the pictures of what you want the thing to be like, for the agent to
design by. Products whose style you are after, materials, details, the rooms and places
it is to live in. It is there before there is any model, which is when it is most use:
gather the pictures first, and the first thing the agent makes is made by them. The
buttons down the right change over to the board's, the cards of the other projects are
put away, and the red **Exit Inspiration Board**, or Esc, brings the view back.

Drop pictures on it, paste them, or choose them from the empty board. Pasting a link
does too: a link to a picture puts that picture on the board, and a link to a page puts
the picture the page is shared with, named by the page's title. Each is kept as a PNG or
a JPEG, made smaller where it is bigger than the agent takes, and lies where it was
dropped, where it covers no other. The board goes on as far as it is wanted: two
fingers or a drag with the right or middle button move over it, a pinch or the wheel
zooms, and a double click on the ground, or Cmd+1, shows all of it. A drag moves a
picture, or all that are picked out; a drag across the ground picks out what the box
takes in, as it does in the view of the model, and Shift with a click adds a picture or
takes it back out. **Organize** (O) tidies the board when it has got messy: the groups
first, then every other picture in rows, in the order they are read in now, each row as
wide as the rest and its pictures all one height.

A click on a picture goes up to it: it comes to the middle of the view, close, and the
rest are pushed aside to give it room. A click on it then pins a note to that place, a
dot, with what you say of it: "this joint", "the grille, not the colour". Pointing at a
dot shows its note, and **Notes** (N) shows them all; a click on one changes it or
deletes it. Esc, or a click on the ground, puts the picture back.

Cmd+G puts the pictures picked out in a group, after asking what they stand for
together, in at most 50 letters: "Material inspirations", "Look & feel". They lie in a
pile under that title; a click on the pile spreads them out, pushing the rest aside, and
a click on the title renames it. Shift+Cmd+G takes them out of the group again. A
picture dragged over a group opens the pile up; let go there, and it goes into the
group first, and the group spreads out to show it. In a pile the tallest pictures lie at
the back and the shortest on top, so that each shows over the one behind it.
**Search** (Cmd+F) looks through the pictures by name, by group, by what was noted on
them and by what the agent made of them.

Delete takes what is picked out off the board, once you say it is to go; Cmd+Delete
takes it off without asking. Its file goes to the Trash, and what was noted on it with
it.

As each picture is put on the board the agent looks at it, as an industrial designer
would: what it is, its form, its materials and finish, how it looks to be made, and what
to take from it. A small ring turns beside the picture's top left corner meanwhile, and at the foot of
the view is how long it has been at it, with a button to stop it. What it says is not
shown: it is kept for the agent. With each message, where the board has changed since
the agent last heard of it, the agent is told of the whole board: each picture with what
was made of it and your notes on it, and each group by its title. It designs by it: in
the manner the pictures share, adapted to the thing; for the places in them, the kind of
object that would belong there, and not their details; and for the materials they keep
pointing to, though the app draws every part in a plain colour, which Claude asks about
before it first designs for one.

The board is kept in `inspiration/` at the top of the project: a copy of each picture,
and `board.json`, with where each lies, your notes, the groups and what the agent made
of each picture ([`shared/inspiration-format.ts`](../apps/desktop/shared/inspiration-format.ts)).
It is the project's, whichever conversation is had: every [version](#versions) has the
same, and taking a change back leaves it as it is.

## Conversations

A project can have any number of conversations, and none of them is deleted while the
project is in the app. Its card is the one being carried on. A conversation left alone
for three days (the settings say how many) settles: it goes under the card with the
earlier ones, and the card offers a new session. The edge of the card that shows beneath
is what spreads them out, and any of them can be opened and carried on where it left
off. One thing at a time is done in a project's folder, so only one of them runs at
once.

At the top of a conversation is which version of the project it is: **Version 1** for the
first conversation had about it, **Version 2** for the next, and so on, by when each
began. Click it to give the conversation a name instead; left empty, it goes back to its
version. Under a project's card, one with no name goes by the first thing said in it.

A card says the last of its conversation in two lines: what was asked, while the agent
is at work on it, and otherwise what was last said, which of a reply is the short part.
A message too long for that is summed up in a few words by the quickest of Claude Code's
models, which is given the message and nothing else; with Claude switched off, the card
shows as much of the message as fits. If the agent is at work in a conversation under
the card, the edge of the card says so.

## Versions

Each conversation has the project its own way. A new one begins from the model as it is
on screen, and what is done from there, by the agent or by you, is done to its version
alone: the conversation it began from keeps the model as it was left. Turn to a
conversation, on a project's card or under it, and the view shows the model as that
conversation left it, with the colours and groups you gave its parts there.

It is the project's folder that changes. There is one, and it holds the version of the
conversation you turned to last: when you turn to another, the app copies the folder
aside for the one you leave, and puts it as it was copied for the other. (On a Mac's own
disk a copy takes no room until one of the two is written to.) So what you open in
Finder or in an editor is the version on screen, and what you change there is that
conversation's. What is not the project's own is the same for all of them, and left
alone: `.git`, `node_modules`, a Python environment. Two versions are not brought
together: to have in one what another has, ask for it there.

The folder is not put another way while the agent is at work in it: turn to another
conversation meanwhile, and its model is shown when the turn is over. A folder with more
than 20,000 files in it, or 4 GB, is not copied aside, and has the one version.

A folder that cannot be read just then (on a drive that is not plugged in, say) is not
taken for an empty one: it stays the version it was, and the conversation you turned to
says why. So does one that could be copied aside but not put as the other conversation
left it, part of the way through it may be: nothing is lost, as both versions are kept,
and it is put the rest of the way the next time a conversation is turned to. A message
sent in that conversation meanwhile is not answered in the other's version: it says why
instead.

The [settings](settings.md) switch this off (Versions). The conversations then all
change the one model, and turning to one changes nothing. The versions kept until then
stay as they were, for when it is switched on again.

### Asking for a new version

A new version can be asked for in words, in the conversation you are in: "try this as a
new version, with the seat 15 mm thicker". The agent changes nothing there. It sums up
what you asked for, and the foot of the conversation says **Creating a new version**
while its turn comes to an end, with a faint light going across the conversation behind
what is said in it. Then the app begins a new conversation, says in it what the agent
summed up as your own message, marked **New version**, and turns to it, with the agent
already at work. The pictures that came with your message go with it. Nothing else of
the conversation you asked in is known in the new one, which is answered as that one
was: by the same agent, with the same model, effort and access.

The conversation you asked in keeps the model as it was, and says that a new version
was created from there. What was waiting to be said in it waits to be sent by hand.

Stop the agent while the new version is being created, and none is. The agent begins one
only when asked. With versions switched off, or in a folder too big to have them, there
is none to begin: the agent says so, and changes nothing.

## Replies

What the agent says at the end of a turn is short: a sentence or two, since what it did
is already there in the view. It says what you could not tell by looking (something it
could not do, a guess that decided what you got, a question for you) and keeps the rest,
how it went about it and the sizes and clearances, under a Details line beneath the
reply, which opens as the steps above it do. A question is answered outright, at the
length it needs.

What the agent says on the way, between one step and the next, is not its answer: it
shows while the agent is at work and is then kept with the steps, under the line that
says how long it worked.

The agent is told to answer so, and sets the rest off in a `<details>` block for the app
to fold away; a reply with nothing set off is shown whole, as every earlier one is.

## Sizes

What the agent makes is drawn at the size it is to be made, so it is told where sizes
come from: what you said, what is already in the model, the standard for a thing that
has one (looked up, not made up), and only then what such a thing commonly measures. It
says which sizes decided the shape, and leads with any that were its own guess.

## Questions

Mostly the agent shows its guess and lets you correct it. Where a wrong guess would
waste the build (the thing has to fit something of yours whose size it cannot know, or
what you asked for could be quite different things) it asks first.

Claude asks in the conversation, one question at a time: a few likely answers to click,
and a line to write your own. A click goes on to the next question, and the last one
sends them all (a question that takes several answers waits for Next); **Skip** leaves a
question to Claude, which goes by its best guess and says what it was. The other agents
ask in what they say, and are answered in a message. Whatever access the agent has, what
it asks is put to you: a question is no leave to do something.

## Model, effort and access

Under the message, one line says how it will be answered: "Using Opus 5.5, High,
Auto". Click it for the three choices behind it: which of the agent's models answers,
how hard it thinks, and what it may do without asking. The models are the ones the agent
offers; "Default" leaves the model, and how hard it thinks, as the agent is set.

The agent starts out on Auto: it does what is routine and asks about the rest. Full
access, where it never asks leave, is yours to give it; once chosen, a choice is kept.

| Access            | What the agent does                                              |
| ----------------- | ---------------------------------------------------------------- |
| Full access       | Never asks                                                       |
| Auto              | Does what is routine and asks about the rest                     |
| Auto-accept edits | Edits the project's files freely and asks before anything else   |
| Supervised        | Asks before it changes a file or runs anything                   |

With Auto-accept edits, an edit outside the project's folder is still asked about: for
Grok and opencode the app looks at every file an edit changes, and a link in the folder
that leads out of it does not count as in it.

A folder you opened can have settings of its own for Claude Code
(`.claude/settings.json`, `.claude/settings.local.json` or `.mcp.json`), which can have
it run commands without asking, whatever its access: hooks, servers of tools, what it is
let do. Until you say to trust them, Claude goes by your own settings alone, and so
leaves out the folder's `CLAUDE.md`, skills and commands as well. A pill at the foot of
the view asks, once: **Trust this folder's settings**, or **Ignore them**. A folder the
app made, from nothing or from an example, goes by its own without asking, and so does
one with none of those files.

## Taking a change back

Cmd+Z takes back the last thing done to the model, and Cmd+Shift+Z puts it back. That is
a colour you gave a part, a group you made, broke up or renamed, parts you
[hid or brought back](selecting.md#on-its-own-close-to-out-of-sight), or what the agent
did in a turn, whichever was done later; press it again for the one before.

What the agent did takes a second press. The first leaves everything as it is and says,
at the foot of the view, how long that turn was at work and what it was asked: Cmd+Z
again within a few seconds takes it back. Anything else done in between, a key or a
click, and the next Cmd+Z asks again. What you did yourself goes at the first press.

What the agent did is taken back whole and at once, without asking it for anything and
without building anything: before each turn the app puts the project's files aside, and
keeps of them whatever the turn then wrote to, made or took away, the built model with
the rest. A turn you stopped part of the way is taken back like any other. So is one the
app was quit in the middle of: quitting while the agent is at work asks first, then
stops it and keeps what it did, and its commit, before the app goes (waiting ten seconds
at most). The
conversation says that it was done, and how to put it back, and the agent is told with
your next message, so that it does not go on as though its change were still there.

Nothing the agent did is taken back while it is at work, or over a file that has been
changed since the turn, by you in an editor say: the app names the file that is in the way and
leaves all of it as it is. What you changed in the project's files while the turn was
going on is part of the turn, though, and goes back with it. Where the files cannot all
be written (a full disk, say), the foot of the view says that only part of it was done,
and why: the files are then part of the way back, and the model is shown as they are. The last twelve turns that changed anything are kept for each
conversation, which are the ones Cmd+Z takes back in [its version](#versions) of the
project; with versions switched off, for each project. What is not the project's own is
left out, and left alone: `.git`,
`node_modules`, a Python environment. A folder with more than 20,000 files in it, or
4 GB, is not put aside at all, and nothing the agent does in it can be taken back.

In a box you are writing in, Cmd+Z is the writing's for as long as there is any; in an
empty one, as the message box is after a message is sent, it is the model's.
