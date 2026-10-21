# Section, explode and grid

Three of the buttons down the right-hand edge of the view.

## Section

**Section** (S) cuts the model open. Three squares appear by the axes, one per direction
to cut across, which the X, Y and Z keys choose too; in the view, drag the arrow to push
the cut through the model and the arcs to tilt it. While the pointer is on either, or
has hold of it, a faint square shows where the cut lies and how it is tilted. Once it
has been dragged and let go of, or a click lands on nothing, the arrow and arcs go, so
as not to stand in the middle of what was cut open; a cut chosen afresh brings them back
(S off and on again, Esc and S, an axis, or Reset cut).

It is what is on show that is cut open. With some of the model out of sight, by hand
(H), by the project's own [tools](project-tools.md), or with the view cut down to a part
or a group, a cut chosen afresh goes through the middle of the rest, and the arrow and
arcs stand on the cut where it comes nearest that, at a size to go with it.

Two more buttons appear to the left of this one: one shows the other half, the other
starts the cut again. A cut is kept as it is left: cut open again, the model is cut the
same way, until it is started again, or until it would miss all that is on show, when
it is chosen afresh. While the model is cut open a tap of Z is the cut
across Z, and holding the key, or flicking with it down, brings up the shading.

Where the cut passes through a solid part it leaves a face in the part's colour, with
lines across it, the way a drawing marks what has been cut through. Where two parts are
in the same place by more than a tenth of a millimetre, the cut shows it in red. (A part
whose surfaces do not close, and anything drawn as glass or by its lines, is left open.)

## Explode

**Explode** (E) pulls the parts apart by the distances the manifest gives (or straight
out from the middle, if it gives none), and a slider along the bottom pulls them
further.

A model that gives its parts no `explode` of their own comes apart by its groups, not
part by part: the parts of a group that touch one another go as one piece, so a circuit
board keeps its components and a switch its pins. The outside (a group marked `shell`)
still comes apart part by part, as do parts in no group and a model that is all one
group.

Such a model comes apart twice. E pulls it apart into those pieces; a second time, with
the model still apart, it pulls the pieces apart too, every part by itself; and from
there E goes from the one to the other, turn about. Beside the slider there is a button
for the same: **2x** pulls the pieces apart into their parts, and **1x** puts them back
as pieces. Neither puts the model together: Esc does, and the Explode button. A model
that says where its own parts go, or one with no piece of more than a part, has nothing
further to come apart into: it has no such button, and E a second time puts it together.

Pieces that would still be in one another are then moved clear, up and down where that
is about as short a way as any. That is how far such a model can come apart, and to
begin with it is pulled half of the way there: far enough to see what it is made of,
and not yet all over the view. The slider takes it the rest of the way, and as far
again. (A model that says where its own parts go is pulled apart to where it says.) What was plainly over something in the model stays over
it: a face ends up above the works it covers, however far the works had to be lifted to
come out of the case.

It is what is on show that comes apart. With some of the model out of sight, by hand
(H), by the project's own [tools](project-tools.md), or with the view cut down to a part
or a group, the rest comes apart by itself: out from its own middle, and clear of
itself only. A power lead put out of sight, which hangs far below the rest, no longer
sends all of the rest the other way. Put back, or found by name, what was out of sight
comes apart with the rest again. (A model that says where its own parts go is pulled
apart to where it says, whatever is on show.)

## Grid

**Grid** (Shift+G, as in Figma) rules the ground into squares and draws the world's
three axes through its origin, in the colours they have in the corner of the view. Both
go on as far as can be seen, however far out the view is taken. The squares are a power
of ten millimetres across, whichever suits how near the view is, with every tenth line
heavier: zoom out and they give way to squares ten times the size. It stays on, or off,
from one model to the next.
