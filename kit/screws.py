"""Screws, nuts and washers in their standard sizes, for a model made with Enclose
(https://enclose.dev).

This file belongs to Enclose. Copy it into a project beside enclose.py and leave it as
it is: a later version of the app may replace it. It draws metric fasteners as they are
made and sold, each to the sizes its standard gives and with its thread cut, so that a
model shows the screw that will be bought, in the hole that fits it:

    from build123d import Pos
    from screws import Screw

    screw = Screw("M3", 8)                    # a socket head screw, 8 mm long
    # where each one goes: on its axis, at the face its head comes down on
    spots = [Pos(x, y, 12) for x in (-26, 26) for y in (-16, 16)]
    for spot in spots:
        lid -= spot * screw.hole()            # the hole it passes through
        body -= spot * screw.thread_hole()    # the hole it screws into
    model.part(
        "lid_screws",
        [spot * screw.shape for spot in spots],
        label=f"Lid screws, {screw.size}",    # "Lid screws, M3 × 8"
        group=fixings,
        finish="metal",
    )

A screw stands on Z with its head up and its thread down. Its origin is where the head
comes to rest: the underside of the head, or the top of a countersunk one, which sits
flush. The holes are drawn about the same origin, so one placing does for a screw and
for all that is cut for it. Turn it to drive it in from elsewhere: Rot(X=180) from
below, Rot(Y=90) from the side.

A head can be let into the part and not stand on it. Place the screw that much lower
and say how much: Pos(x, y, 12 - screw.head_height) with
screw.hole(sunk=screw.head_height) leaves the head flush with a face at 12.

In plastic a screw holds by about twice its own width of thread, and wants as much
plastic round its hole as it is wide: a post two and a half to three times the screw
across.

The sizes, with what each measures in mm. Few people know them by name, so say the
measure with the name when one is put to the user:

    size    thread    socket head    hole it passes through    hole it screws into
    M1.6    1.6       3.0            1.8                       1.25
    M2      2         3.8            2.4                       1.6
    M2.5    2.5       4.5            2.9                       2.05
    M3      3         5.5            3.4                       2.5
    M4      4         7              4.5                       3.3
    M5      5         8.5            5.5                       4.2
    M6      6         10             6.6                       5
    M8      8         13             9                         6.8
    M10     10        16             11                        8.5
    M12     12        18             13.5                      10.2

M3 is the usual one for a thing that is held in the hand or stands on a desk, M2 and
M2.5 for what is small or thin, as most circuit boards are held, and M4 and up for what
is large or carries weight. A board's own mounting holes say which it takes: the screw
whose clearance hole is nearest them.

The heads, by what `head` is given as:

    "socket"         a tall round head with a hex socket (ISO 4762): the usual one
    "button"         a low domed head with a hex socket (ISO 7380), M3 and up
    "countersunk"    a flat head that sinks flush, with a hex socket (ISO 10642), M3 and up
    "pan"            a rounded head with a Phillips cross (ISO 7045), up to M8
    "hex"            a hexagon head, for a spanner (ISO 4017)

A screw is made in certain lengths only, and `Screw` says which when given another:
`lengths("M3")` lists them. The length is what goes into the hole: measured from under
the head, or for a countersunk screw from its top.

What a `Screw` says of itself: `size` ("M3 × 8"), `name` ("M3 × 8 socket head screw",
what to ask for when buying it), `standard`, `drive` (what turns it), and in mm
`diameter`, `pitch`, `length`, `head_diameter`, `head_height`, `clearance` (the hole it
passes through), `tap` (the hole it screws into) and `recess` (the hole its head sinks
into, where it is let in).

`Nut("M3")` and `Washer("M3")` are the hex nut (ISO 4032) and plain washer (ISO 7089)
that go with a thread, each with a `shape` and a `name` as a screw has. Each lies on Z
with its underside at the origin. `nut.pocket()` is what to cut for a nut to sit in and
not turn.

Run this file to have the sizes listed: python3 screws.py. With --check it draws every
fastener it has and says what is wrong with any, which is for whoever changes it.

Needs build123d (pip install build123d).
"""

from __future__ import annotations

import copy
import math

from build123d import Compound, Solid
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_MakeEdge,
    BRepBuilderAPI_MakeFace,
    BRepBuilderAPI_MakeSolid,
    BRepBuilderAPI_MakeWire,
    BRepBuilderAPI_Sewing,
)
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepLib import BRepLib
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism, BRepPrimAPI_MakeRevol
from OCP.Bnd import Bnd_Box
from OCP.GC import GC_MakeArcOfCircle
from OCP.Geom import Geom_BSplineSurface
from OCP.GeomAbs import GeomAbs_Plane
from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Pnt2d, gp_Vec
from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
from OCP.ShapeFix import ShapeFix_Face
from OCP.TopAbs import TopAbs_FACE, TopAbs_SHELL, TopAbs_SOLID, TopAbs_WIRE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS

# What build123d is built on changed some of its names with its version 8, which
# build123d 0.13 brought in: these are known by either.
try:
    from OCP.GCE2d import GCE2d_MakeSegment
    from OCP.TColgp import TColgp_Array2OfPnt
    from OCP.TColStd import TColStd_Array1OfInteger, TColStd_Array1OfReal
except ImportError:
    from OCP.collections import Array1_double as TColStd_Array1OfReal
    from OCP.collections import Array1_int as TColStd_Array1OfInteger
    from OCP.collections import Array2_gp_Pnt as TColgp_Array2OfPnt
    from OCP.GC import GC_MakeSegment2d as GCE2d_MakeSegment


def _as(kind: str):
    """What takes a shape for the kind it is known to be, by whichever name it has."""
    return getattr(TopoDS, f"{kind}_s", None) or getattr(TopoDS, kind)


_as_face, _as_shell, _as_solid, _as_wire = (
    _as("Face"),
    _as("Shell"),
    _as("Solid"),
    _as("Wire"),
)

__all__ = ["Nut", "Screw", "Washer", "lengths"]

# --- what the standards say -------------------------------------------------------------

# A coarse metric thread: how far across it is and from one turn to the next (ISO 261),
# the hole it passes through (ISO 273, medium) and the hole that is tapped for it.
_THREADS: dict[str, tuple[float, float, float, float]] = {
    "M1.6": (1.6, 0.35, 1.8, 1.25),
    "M2": (2.0, 0.4, 2.4, 1.6),
    "M2.5": (2.5, 0.45, 2.9, 2.05),
    "M3": (3.0, 0.5, 3.4, 2.5),
    "M4": (4.0, 0.7, 4.5, 3.3),
    "M5": (5.0, 0.8, 5.5, 4.2),
    "M6": (6.0, 1.0, 6.6, 5.0),
    "M8": (8.0, 1.25, 9.0, 6.8),
    "M10": (10.0, 1.5, 11.0, 8.5),
    "M12": (12.0, 1.75, 13.5, 10.2),
}

# The lengths screws are made in (ISO 888), and for each thread the shortest and the
# longest that are commonly kept.
_LENGTHS = (2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65)
_LENGTHS += (70, 80, 90, 100)
_KEPT: dict[str, tuple[float, float]] = {
    "M1.6": (2, 16),
    "M2": (3, 20),
    "M2.5": (3, 25),
    "M3": (4, 40),
    "M4": (5, 50),
    "M5": (6, 60),
    "M6": (8, 80),
    "M8": (10, 100),
    "M10": (12, 100),
    "M12": (16, 100),
}

# ISO 4762, a socket head: how far across the head is, how high, the hex key it takes
# and how deep the socket goes.
_SOCKET: dict[str, tuple[float, float, float, float]] = {
    "M1.6": (3.0, 1.6, 1.5, 0.7),
    "M2": (3.8, 2.0, 1.5, 1.0),
    "M2.5": (4.5, 2.5, 2.0, 1.1),
    "M3": (5.5, 3.0, 2.5, 1.3),
    "M4": (7.0, 4.0, 3.0, 2.0),
    "M5": (8.5, 5.0, 4.0, 2.5),
    "M6": (10.0, 6.0, 5.0, 3.0),
    "M8": (13.0, 8.0, 6.0, 4.0),
    "M10": (16.0, 10.0, 8.0, 5.0),
    "M12": (18.0, 12.0, 10.0, 6.0),
}
# ISO 7380-1, a button head: the same four.
_BUTTON: dict[str, tuple[float, float, float, float]] = {
    "M3": (5.7, 1.65, 2.0, 1.04),
    "M4": (7.6, 2.2, 2.5, 1.3),
    "M5": (9.5, 2.75, 3.0, 1.56),
    "M6": (10.5, 3.3, 4.0, 2.08),
    "M8": (14.0, 4.4, 5.0, 2.6),
    "M10": (17.5, 5.5, 6.0, 3.12),
    "M12": (21.0, 6.6, 8.0, 4.16),
}
# ISO 10642, a countersunk head: the hex key and the depth of the socket. The head is a
# cone of 90 degrees, 2.24 times as far across as the thread and 0.62 times as high.
_COUNTERSUNK: dict[str, tuple[float, float]] = {
    "M3": (2.0, 1.1),
    "M4": (2.5, 1.5),
    "M5": (3.0, 1.9),
    "M6": (4.0, 2.2),
    "M8": (5.0, 3.0),
    "M10": (6.0, 3.6),
    "M12": (8.0, 4.3),
}
# ISO 7045, a pan head: how far across, how high, which Phillips driver it takes and how
# far across the cross is.
_PAN: dict[str, tuple[float, float, int, float]] = {
    "M1.6": (3.2, 1.3, 0, 1.7),
    "M2": (4.0, 1.6, 0, 1.9),
    "M2.5": (5.0, 2.1, 1, 2.7),
    "M3": (5.6, 2.4, 1, 3.0),
    "M4": (8.0, 3.1, 2, 4.4),
    "M5": (9.5, 3.7, 2, 4.9),
    "M6": (12.0, 4.6, 3, 6.9),
    "M8": (16.0, 6.0, 4, 9.0),
}
# ISO 4017, a hexagon head: how far across its flats, and how high.
_HEX: dict[str, tuple[float, float]] = {
    "M1.6": (3.2, 1.1),
    "M2": (4.0, 1.4),
    "M2.5": (5.0, 1.7),
    "M3": (5.5, 2.0),
    "M4": (7.0, 2.8),
    "M5": (8.0, 3.5),
    "M6": (10.0, 4.0),
    "M8": (13.0, 5.3),
    "M10": (16.0, 6.4),
    "M12": (18.0, 7.5),
}
# ISO 4032, a hexagon nut: how far across its flats, and how high.
_NUTS: dict[str, tuple[float, float]] = {
    "M1.6": (3.2, 1.3),
    "M2": (4.0, 1.6),
    "M2.5": (5.0, 2.0),
    "M3": (5.5, 2.4),
    "M4": (7.0, 3.2),
    "M5": (8.0, 4.7),
    "M6": (10.0, 5.2),
    "M8": (13.0, 6.8),
    "M10": (16.0, 8.4),
    "M12": (18.0, 10.8),
}
# ISO 7089, a plain washer: its hole, how far across it is, and how thick.
_WASHERS: dict[str, tuple[float, float, float]] = {
    "M1.6": (1.7, 4.0, 0.3),
    "M2": (2.2, 5.0, 0.3),
    "M2.5": (2.7, 6.0, 0.5),
    "M3": (3.2, 7.0, 0.5),
    "M4": (4.3, 9.0, 0.8),
    "M5": (5.3, 10.0, 1.0),
    "M6": (6.4, 12.0, 1.6),
    "M8": (8.4, 16.0, 1.6),
    "M10": (10.5, 20.0, 2.0),
    "M12": (13.0, 24.0, 2.5),
}

# what each head goes by, the standard it is made to, and the table it is in
_HEADS: dict[str, tuple[str, str, dict]] = {
    "socket": ("socket head screw", "ISO 4762", _SOCKET),
    "button": ("button head screw", "ISO 7380", _BUTTON),
    "countersunk": ("countersunk screw", "ISO 10642", _COUNTERSUNK),
    "pan": ("pan head screw", "ISO 7045", _PAN),
    "hex": ("hex head screw", "ISO 4017", _HEX),
}


def _number(value: float) -> str:
    """A size as it is written: 8, not 8.0."""
    return f"{value:g}"


def _thread(size) -> str:
    """The name of a thread, from however it was given: "M3", "m2.5", 3."""
    text = str(size).strip().upper().replace(",", ".").removeprefix("M")
    try:
        name = f"M{_number(float(text))}"
    except ValueError:
        name = ""
    if name not in _THREADS:
        raise ValueError(f"{size!r} is not a thread this has: {', '.join(_THREADS)}.")
    return name


def _made_in(thread: str, head: str) -> dict:
    """The table a head is in, having seen that it is made with this thread."""
    if head not in _HEADS:
        raise ValueError(f"{head!r} is not a head this has: {', '.join(_HEADS)}.")
    words, standard, table = _HEADS[head]
    if thread not in table:
        others = [name for name, (_, _, has) in _HEADS.items() if thread in has]
        raise ValueError(
            f"No {words} is made in {thread}: {standard} has {', '.join(table)}. "
            f"In {thread} there is {', '.join(others)}."
        )
    return table


def lengths(size, head: str = "socket") -> tuple[float, ...]:
    """The lengths a screw of this thread and head is made in, in mm."""
    thread = _thread(size)
    _made_in(thread, head)
    shortest, longest = _KEPT[thread]
    if head == "countersunk":
        # its head is part of its length, and there has to be thread under it
        diameter, pitch = _THREADS[thread][:2]
        shortest = max(shortest, 0.62 * diameter + 5 * pitch)
    return tuple(n for n in _LENGTHS if shortest <= n <= longest)


# --- shapes -----------------------------------------------------------------------------

_Z = gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1))


def _whole(shape):
    """What an operation left, as build123d has it: the one solid, or all there are."""
    solids = []
    found = TopExp_Explorer(shape, TopAbs_SOLID)
    while found.More():
        solids.append(Solid(_as_solid(found.Current())))
        found.Next()
    if not solids:
        raise ValueError("a fastener came out with nothing in it")
    return solids[0] if len(solids) == 1 else Compound(children=solids)


def _turned(*outline) -> object:
    """A solid turned about Z, as on a lathe: its outline to one side of the axis, as
    (radius, height) corners in order, each joined to the next by a straight line, or by
    an arc where a corner has a third thing with it, the point the arc passes through
    on its way there."""
    wire = BRepBuilderAPI_MakeWire()
    corners = [gp_Pnt(float(corner[0]), 0, float(corner[1])) for corner in outline]
    for index, corner in enumerate(outline):
        a, b = corners[index - 1], corners[index]
        if a.Distance(b) < 1e-9:
            continue
        if len(corner) > 2:
            through = gp_Pnt(float(corner[2][0]), 0, float(corner[2][1]))
            edge = BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(a, through, b).Value())
        else:
            edge = BRepBuilderAPI_MakeEdge(a, b)
        wire.Add(edge.Edge())
    face = BRepBuilderAPI_MakeFace(wire.Wire(), True).Face()
    return BRepPrimAPI_MakeRevol(face, _Z).Shape()


def _prism(corners: list[tuple[float, float]], low: float, high: float) -> object:
    """A flat outline in the XY plane, drawn up from one height to another."""
    wire = BRepBuilderAPI_MakeWire()
    points = [gp_Pnt(x, y, low) for x, y in corners]
    for index, point in enumerate(points):
        wire.Add(BRepBuilderAPI_MakeEdge(points[index - 1], point).Edge())
    face = BRepBuilderAPI_MakeFace(wire.Wire(), True).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, 0, high - low)).Shape()


def _hexagon(flats: float, low: float, high: float) -> object:
    """A hexagon so far across its flats, from one height to another."""
    out = flats / math.sqrt(3)
    corners = [
        (out * math.cos(math.radians(60 * n)), out * math.sin(math.radians(60 * n)))
        for n in range(6)
    ]
    return _prism(corners, low, high)


def _socket(key: float, top: float, depth: float, room: float) -> object:
    """What is taken out of a head for a hex key: the hexagon, down from the top, and
    under it the point the drill left, as far as there is `room` for."""
    # (a little narrower than the hexagon, so that it comes out through its floor)
    bit = 0.45 * key
    point = min(bit * math.tan(math.radians(30)), room)
    hexagon = _hexagon(key, top - depth, top + key)
    low = top - depth
    drilled = _turned((0, low - point), (bit, low), (bit, top), (0, top))
    return BRepAlgoAPI_Fuse(hexagon, drilled).Shape()


def _cross(across: float, top: float, depth: float) -> object:
    """What is taken out of a head for a Phillips driver: four wings that narrow towards
    the bottom, as the driver's do."""
    wing = 0.12 * across
    reach = across / 2 + wing
    plus = [
        (reach, wing), (wing, wing), (wing, reach), (-wing, reach),
        (-wing, wing), (-reach, wing), (-reach, -wing), (-wing, -wing),
        (-wing, -reach), (wing, -reach), (wing, -wing), (reach, -wing),
    ]  # fmt: skip
    foot = max(across / 2 - depth * math.tan(math.radians(26.5)), wing * 1.2)
    slope = (across / 2 - foot) / depth
    over = across / 2
    cone = _turned(
        (0, top - depth - foot * 0.35),
        (foot, top - depth),
        (across / 2 + over * slope, top + over),
        (0, top + over),
    )
    wings = _prism(plus, top - depth - foot, top + over)
    return BRepAlgoAPI_Common(wings, cone).Shape()


# A helix is drawn as a smooth curve through this many points to the turn. It is out
# from a true one by about a thousandth of how far across it is.
_PER_TURN = 8
_STEP = 2 * math.pi / _PER_TURN
# such a curve runs a little inside the points it is drawn by: this much
_INSIDE = (
    (4 + 2 * math.cos(_STEP)) / 6
    + (46 * math.cos(_STEP / 2) + 2 * math.cos(1.5 * _STEP)) / 48
) / 2


def _tube(
    crest: float,
    root: float,
    pitch: float,
    low: float,
    high: float,
    *,
    point: float = 0.0,
    fade: float = 0.0,
) -> tuple[object, object, object]:
    """A length of thread on Z, from `low` to `high`: right-handed, with the 60 degree
    form of a metric thread, `crest` and `root` being how far out from the axis the tops
    and bottoms of it are. What comes back is the surface of it, open at both ends, and
    the outline of each end, the low one first.

    It is made face by face and not swept or cut, which is slower and fails more
    often: the four faces of a thread (root, flank, crest, flank) each lie between two
    helices, as straight lines from one to the other.

    `point` cuts the low end back at 45 degrees to a blunt point so far below the root,
    as the end of a screw is. `fade` lets the thread run out over that length at the
    high end, its root coming up to its crest, as it does where it stops under a head.
    """
    depth = crest - root
    flank = depth * math.tan(math.radians(30))
    flat = pitch / 8
    # the helices, each by how far up the pitch it starts, and whether it is a crest
    rails = [
        (0.0, False),
        (pitch - 2 * flank - flat, False),
        (pitch - flank - flat, True),
        (pitch - flank, True),
        (pitch, False),
    ]
    rise = pitch / _PER_TURN
    # (a curve only keeps to its points some way in from its ends: four more each way)
    first = math.floor((low - pitch) / rise) - 4
    last = math.ceil(high / rise) + 4
    count = last - first + 1
    # the fade is over a little before the end, where the thread is then all crest
    faded = high - min(0.25 * pitch, fade)

    def out(z: float, is_crest: bool) -> float:
        """How far from the axis a helix is at this height."""
        radius = crest if is_crest else root
        if fade > 0:
            radius = max(radius, min(crest, crest - (faded - z) * depth / fade))
        if point > 0:
            radius = min(radius, root - point + max(0.0, z - low))
        return radius

    knots = TColStd_Array1OfReal(1, count - 2)
    mults = TColStd_Array1OfInteger(1, count - 2)
    for index in range(count - 2):
        knots.SetValue(index + 1, float(index))
        mults.SetValue(index + 1, 4 if index in (0, count - 3) else 1)
    across = TColStd_Array1OfReal(1, 2)
    across.SetValue(1, 0.0)
    across.SetValue(2, 1.0)
    twice = TColStd_Array1OfInteger(1, 2)
    twice.SetValue(1, 2)
    twice.SetValue(2, 2)

    sewing = BRepBuilderAPI_Sewing(1e-4)
    for a, b in zip(rails, rails[1:]):
        poles = TColgp_Array2OfPnt(1, count, 1, 2)
        for index in range(count):
            turn = (first + index) * _STEP
            for side, (start, is_crest) in enumerate((a, b)):
                z = (first + index) * rise + start
                radius = out(z, is_crest) / _INSIDE
                poles.SetValue(
                    index + 1,
                    side + 1,
                    gp_Pnt(radius * math.cos(turn), radius * math.sin(turn), z),
                )
        surface = Geom_BSplineSurface(poles, knots, across, mults, twice, 3, 1)

        # the face is the part of that between the two heights: on the surface's own
        # map of itself, four straight lines
        def where(z: float, side: int) -> gp_Pnt2d:
            return gp_Pnt2d((z - (a, b)[side][0]) / rise - first - 1, float(side))

        corners = [where(low, 0), where(low, 1), where(high, 1), where(high, 0)]
        wire = BRepBuilderAPI_MakeWire()
        for p, q in zip(corners, corners[1:] + corners[:1]):
            edge = BRepBuilderAPI_MakeEdge(GCE2d_MakeSegment(p, q).Value(), surface)
            BRepLib.BuildCurves3d_s(edge.Edge())
            wire.Add(edge.Edge())
        sewing.Add(BRepBuilderAPI_MakeFace(surface, wire.Wire(), True).Face())
    sewing.Perform()
    tube = sewing.SewedShape()

    ends = []
    open_ends = ShapeAnalysis_FreeBounds(tube, 1e-4, False, False).GetClosedWires()
    found = TopExp_Explorer(open_ends, TopAbs_WIRE)
    while found.More():
        ends.append(_as_wire(found.Current()))
        found.Next()
    if len(ends) != 2:
        raise ValueError("a thread came out with its surface not whole")
    ends.sort(key=lambda end: _span(end)[0])
    return tube, ends[0], ends[1]


def _span(shape) -> tuple[float, float]:
    """How low and how high something reaches."""
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box)
    return box.CornerMin().Z(), box.CornerMax().Z()


def _flat_at(solid, height: float):
    """The flat face a solid has at this height, lying across Z."""
    faces = TopExp_Explorer(solid, TopAbs_FACE)
    while faces.More():
        face = _as_face(faces.Current())
        if BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane:
            low, high = _span(face)
            if abs(low - height) < 1e-4 and abs(high - height) < 1e-4:
                return face
        faces.Next()
    raise ValueError(f"a fastener has no flat face at {height} for its thread")


def _sewn(solid, pierced: dict, *more):
    """A solid with holes let into some of its flat faces, and what goes in or comes
    out there sewn on as part of it. `pierced` gives each such face, by its height,
    the outlines of its holes. This is how a thread is joined to a head, and cut
    through a nut, in a fraction of the time that fusing and cutting them takes."""
    faces = {height: _flat_at(solid, height) for height in pierced}
    sewing = BRepBuilderAPI_Sewing(1e-4)
    found = TopExp_Explorer(solid, TopAbs_FACE)
    while found.More():
        if not any(found.Current().IsSame(face) for face in faces.values()):
            sewing.Add(found.Current())
        found.Next()
    for height, face in faces.items():
        holed = BRepBuilderAPI_MakeFace(face)
        for outline in pierced[height]:
            holed.Add(outline)
        # (which way round a hole's outline has to go is for this to see to)
        right = ShapeFix_Face(holed.Face())
        right.FixOrientation()
        sewing.Add(right.Face())
    for thing in more:
        sewing.Add(thing)
    sewing.Perform()
    sewed = sewing.SewedShape()
    if sewed.ShapeType() != TopAbs_SHELL:
        raise ValueError("a fastener did not close up")
    whole = BRepBuilderAPI_MakeSolid(_as_shell(sewed)).Solid()
    BRepLib.OrientClosedSolid_s(whole)
    if not BRepCheck_Analyzer(whole).IsValid():
        raise ValueError("a fastener came out wrong")
    return Solid(whole)


def _flat(outline):
    """The flat face that fills an outline."""
    return BRepBuilderAPI_MakeFace(outline, True).Face()


class Screw:
    """A metric screw of a standard size, with what has to be cut for it.

    `size` is its thread ("M3"), `length` how long it is in mm, and `head` which kind
    it is: "socket", "button", "countersunk", "pan" or "hex". A size, a length or a head
    that no such screw is made in is an error, which says what there is instead."""

    _made: dict[tuple[str, float, str], object] = {}

    def __init__(self, size, length: float, head: str = "socket"):
        self.thread = _thread(size)
        self.head = head
        table = _made_in(self.thread, head)
        made = lengths(self.thread, head)
        if length not in made:
            under = [n for n in made if n < length]
            over = [n for n in made if n > length]
            near = [_number(n) for n in (under[-1:] + over[:1])]
            raise ValueError(
                f"No {self.thread} {_HEADS[head][0]} is made {_number(length)} mm "
                f"long: the nearest {'are' if len(near) > 1 else 'is'} "
                f"{' and '.join(near)}. lengths({self.thread!r}, {head!r}) lists them all."
            )
        self.length = float(length)
        self.diameter, self.pitch, self.clearance, self.tap = _THREADS[self.thread]
        self.standard = _HEADS[head][1]
        self.size = f"{self.thread} × {_number(length)}"
        self.name = f"{self.size} {_HEADS[head][0]}"

        d = self.diameter
        if head == "countersunk":
            self._key, self._socket = table[self.thread]
            self.head_diameter = round(2.24 * d, 2)
            self.head_height = round(0.62 * d, 2)
            self.drive = f"{_number(self._key)} mm hex key"
        elif head == "pan":
            self.head_diameter, self.head_height, driver, self._cross = table[
                self.thread
            ]
            self.drive = f"PH{driver} Phillips"
        elif head == "hex":
            self._flats, self.head_height = table[self.thread]
            # how far across its corners it is: what it needs room to turn in
            self.head_diameter = round(self._flats * 2 / math.sqrt(3), 2)
            self.drive = f"{_number(self._flats)} mm spanner"
        else:
            self.head_diameter, self.head_height, self._key, self._socket = table[
                self.thread
            ]
            self.drive = f"{_number(self._key)} mm hex key"
        # the recess a head is let into: the head and a little room round it, or for a
        # hexagon head room for the socket that turns it. A countersunk head has its seat.
        if head == "countersunk":
            self.recess = self.head_diameter
        elif head == "hex":
            self.recess = round(1.6 * self._flats + 2, 1)
        else:
            self.recess = round(
                self.head_diameter + max(0.5, 0.15 * self.head_diameter), 1
            )

    def __repr__(self) -> str:
        return f"Screw({self.thread!r}, {_number(self.length)}, head={self.head!r})"

    @property
    def shape(self):
        """The screw, as a build123d solid: on Z, head up, with its origin where the head
        comes to rest. Every one asked for is a copy to place where it goes."""
        key = (self.thread, self.length, self.head)
        if key not in Screw._made:
            Screw._made[key] = self._build()
        return copy.copy(Screw._made[key])

    def _build(self):
        d, pitch, k = self.diameter, self.pitch, self.head_height
        # a countersunk head is under the origin, and part of the length
        under = k if self.head == "countersunk" else 0.0
        # A long screw is threaded only so far up from its end (ISO 4762), and plain
        # above that. The kinds that are threaded all the way are so at any length.
        bare = 0.0
        if self.head in ("socket", "countersunk"):
            unthreaded = self.length - under - (2 * d + 12)
            if unthreaded >= 1.5 * d:
                bare = unthreaded
        neck = -under - bare

        # the thread: a little under its name across, as a real one is, which also
        # keeps its end clear of the edge of what it is joined to
        crest = d / 2 - 0.06 * pitch
        root = d / 2 - 0.6 * pitch
        thread, end, top = _tube(
            crest,
            root,
            pitch,
            -self.length,
            neck,
            point=0.1 * pitch,
            fade=min(1.25 * pitch, 0.3 * (self.length + neck)),
        )

        r = self.head_diameter / 2
        # what the head is turned from, with the plain length of the screw under it
        shank = [(d / 2, 0), (d / 2, neck), (0, neck)] if bare else [(0, neck)]
        if self.head == "socket":
            edge = 0.08 * d
            body = _turned(*shank, (0, k), (r - edge, k), (r, k - edge), (r, 0))
            body = BRepAlgoAPI_Cut(
                body, _socket(self._key, k, self._socket, (k - self._socket) * 0.8)
            ).Shape()
        elif self.head == "button":
            # a dome, off a low edge: part of a ball whose top is the top of the head
            edge = 0.12 * k
            ball = (r * r + (k - edge) ** 2) / (2 * (k - edge))
            half = (math.pi / 2 + math.asin((edge - (k - ball)) / ball)) / 2
            through = (ball * math.cos(half), k - ball + ball * math.sin(half))
            body = _turned(*shank, (0, k), (r, edge, through), (r, 0))
            body = BRepAlgoAPI_Cut(
                body, _socket(self._key, k, self._socket, (k - self._socket) * 0.8)
            ).Shape()
        elif self.head == "countersunk":
            shank = [(d / 2, neck), (0, neck)] if bare else [(0, neck)]
            body = _turned(*shank, (0, 0), (r, 0), (d / 2, -k))
            body = BRepAlgoAPI_Cut(
                body, _socket(self._key, 0, self._socket, (k - self._socket) * 0.8)
            ).Shape()
        elif self.head == "pan":
            round_ = 0.5 * k
            through = (
                r - round_ + round_ * math.cos(math.pi / 4),
                k - round_ + round_ * math.sin(math.pi / 4),
            )
            body = _turned(
                *shank,
                (0, k),
                (r - round_, k),
                (r, k - round_, through),
                (r, 0),
            )
            body = BRepAlgoAPI_Cut(body, _cross(self._cross, k, 0.68 * k)).Shape()
        else:
            # a hexagon, its corners taken off at 30 degrees on top
            flat = 0.475 * self._flats
            body = BRepAlgoAPI_Common(
                _hexagon(self._flats, 0, k),
                _turned(
                    (0, 0),
                    (0, k),
                    (flat, k),
                    (r + 0.01, k - (r + 0.01 - flat) * math.tan(math.radians(30))),
                    (r + 0.01, 0),
                ),
            ).Shape()
        # the thread goes on where the head, or the plain length under it, ends flat
        return _sewn(body, {neck: [top]}, thread, _flat(end))

    def hole(self, depth: float | None = None, *, sunk: float = 0.0):
        """What to cut out of the part the screw passes through, placed as the screw is:
        a hole it goes through freely, `depth` mm down from where its head rests (as
        far as the screw goes, if not said), and room over it for the head.

        `sunk` is how far below the surface the head rests, for one that is let into
        the part: then the screw is placed that much under the surface, and this cuts a
        recess for the head from there up. `screw.head_height` sinks a head flush. A
        countersunk screw has its own seat cut and sits flush as it is."""
        depth = self.length if depth is None else depth
        d, k = self.clearance / 2, self.head_height
        if self.head == "countersunk":
            # its seat, and over that only what a head let in deeper would need
            r = self.head_diameter / 2
            return _whole(
                _turned(
                    (0, -max(depth, k)),
                    (0, sunk + k),
                    (r, sunk + k),
                    (r, 0),
                    (d, d - r),
                    (d, -max(depth, k)),
                )
            )
        r = self.recess / 2
        if sunk <= 0:
            return _whole(_turned((0, -depth), (0, k), (d, k), (d, -depth)))
        return _whole(
            _turned(
                (0, -depth), (0, sunk + k), (r, sunk + k), (r, 0), (d, 0), (d, -depth)
            )
        )

    def thread_hole(self, depth: float | None = None):
        """What to cut out of the part the screw screws into, placed as the screw is: a
        hole of the size that is tapped for it, which in plastic the screw cuts its own
        thread in. It goes `depth` mm down from where the head rests: a little past the
        end of the screw, if not said."""
        if depth is None:
            depth = self.length + max(1.0, 2 * self.pitch)
        d = self.tap / 2
        return _whole(_turned((0, -depth), (0, 0), (d, 0), (d, -depth)))


class Nut:
    """A hexagon nut (ISO 4032) for a thread: Nut("M3"). It lies on Z with its underside
    at the origin. `width` is how far across its flats it is, and `height` how high."""

    _made: dict[str, object] = {}

    def __init__(self, size):
        self.thread = _thread(size)
        self.diameter, self.pitch = _THREADS[self.thread][:2]
        self.width, self.height = _NUTS[self.thread]
        self.standard = "ISO 4032"
        self.size = self.thread
        self.name = f"{self.thread} hex nut"
        self.drive = f"{_number(self.width)} mm spanner"

    def __repr__(self) -> str:
        return f"Nut({self.thread!r})"

    @property
    def shape(self):
        """The nut, as a build123d solid, with its thread cut."""
        if self.thread not in Nut._made:
            s, m, d, pitch = self.width, self.height, self.diameter, self.pitch
            out = s / math.sqrt(3) + 0.01
            flat = 0.475 * s
            slope = (out - flat) * math.tan(math.radians(30))
            blank = BRepAlgoAPI_Common(
                _hexagon(s, 0, m),
                _turned(
                    (0, 0), (0, m), (flat, m), (out, m - slope), (out, slope), (flat, 0)
                ),
            ).Shape()
            # the thread a screw turns in, right through it: a hole in each face, and
            # the surface of the thread between them
            thread, under, over = _tube(d / 2, d / 2 - 0.54 * pitch, pitch, 0, m)
            Nut._made[self.thread] = _sewn(blank, {0: [under], m: [over]}, thread)
        return copy.copy(Nut._made[self.thread])

    def pocket(self, depth: float | None = None, *, slack: float = 0.2):
        """What to cut out of a part for the nut to sit in and not turn, placed as the
        nut is: a hexagon `slack` mm wider than the nut across its flats, `depth` mm up
        from the nut's underside (the nut's own height, if not said)."""
        return _whole(_hexagon(self.width + slack, 0, depth or self.height))


class Washer:
    """A plain washer (ISO 7089) for a thread: Washer("M3"). It lies on Z with its
    underside at the origin. `inner` and `outer` are how far across its hole and the
    whole of it are, and `thickness` how thick."""

    def __init__(self, size):
        self.thread = _thread(size)
        self.inner, self.outer, self.thickness = _WASHERS[self.thread]
        self.standard = "ISO 7089"
        self.size = self.thread
        self.name = f"{self.thread} washer"

    def __repr__(self) -> str:
        return f"Washer({self.thread!r})"

    @property
    def shape(self):
        """The washer, as a build123d solid."""
        a, b, h = self.inner / 2, self.outer / 2, self.thickness
        return _whole(_turned((a, 0), (a, h), (b, h), (b, 0)))


def _amiss(thing, shape) -> str:
    """What is wrong with a fastener as it was drawn, if anything is."""
    if not isinstance(shape, Solid):
        return "not one solid"
    if not shape.is_valid:
        return "not a sound solid"
    box = shape.bounding_box()
    if isinstance(thing, Screw):
        sunk = thing.head == "countersunk"
        top = 0.0 if sunk else thing.head_height
        # (the top of a dome is where its socket is: what is left of it is lower)
        give = 0.14 * thing.head_height if thing.head == "button" else 0.02
        if not top - give <= box.max.Z <= top + 0.02:
            return f"its top is at {box.max.Z:.3f}, not {top:g}"
        if abs(box.min.Z + thing.length) > 0.02:
            return f"its end is at {box.min.Z:.3f}, not {-thing.length:g}"
        across = max(box.size.X, box.size.Y)
        if abs(across - thing.head_diameter) > 0.03 * thing.head_diameter + 0.02:
            return f"it is {across:.3f} across, not {thing.head_diameter:g}"
        # more of it than the core of its thread, less than a plain rod and a full head
        threaded = thing.length - (thing.head_height if sunk else 0.0)
        least = math.pi * (thing.diameter / 2 - 0.6 * thing.pitch) ** 2 * threaded
        most = math.pi * (
            thing.diameter**2 * thing.length
            + thing.head_diameter**2 * thing.head_height
        )
        if not least < shape.volume < most / 4:
            return f"there is {shape.volume:.2f} mm3 of it"
    elif isinstance(thing, Nut):
        if abs(box.size.Z - thing.height) > 0.01:
            return f"it is {box.size.Z:.3f} high, not {thing.height:g}"
        if len(shape.faces()) < 12:
            return "it has no thread"
    return ""


def _check() -> int:
    """Draw every fastener there is and say what is wrong with any: for whoever has
    changed this file. Comes to how many were wrong."""
    things: list = [Nut(size) for size in _NUTS] + [Washer(size) for size in _WASHERS]
    for head, (_, _, table) in _HEADS.items():
        for size in table:
            things += [Screw(size, length, head) for length in lengths(size, head)]
    wrong = 0
    for thing in things:
        try:
            said = _amiss(thing, thing.shape)
            if not said and isinstance(thing, Screw):
                for cut in (thing.hole(), thing.hole(sunk=1.0), thing.thread_hole()):
                    said = said or _amiss(None, cut)
        except Exception as error:  # whatever it is, it is this one that is wrong
            said = f"{type(error).__name__}: {error}"
        if said:
            wrong += 1
            print(f"{thing.name}: {said}")
    print(f"{len(things)} drawn, {wrong} wrong")
    return wrong


if __name__ == "__main__":
    import sys

    if "--check" in sys.argv:
        sys.exit(1 if _check() else 0)
    print("size   thread  pitch  socket head  passes through  screws into  lengths")
    for name, (across, turn, passes, taps) in _THREADS.items():
        made = lengths(name)
        print(
            f"{name:<6} {_number(across):<7} {_number(turn):<6} "
            f"{_number(_SOCKET[name][0]):<12} {_number(passes):<15} "
            f"{_number(taps):<12} {_number(made[0])} to {_number(made[-1])}"
        )
    print()
    for head, (words, standard, table) in _HEADS.items():
        sizes = list(table)
        print(f'head="{head}": {words}, {standard}, {sizes[0]} to {sizes[-1]}')
