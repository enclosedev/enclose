"""Makes the hand that PCB mode can show a circuit board on, for how big the board is
next to one: hand.glb, an open hand, palm up, as big as a man's.

It is the realistic hand in Blender Studio's Human Base Meshes, which are in the public
domain (CC0): see README.md, beside this. The hand there stands with its fingers down
and its palm to the front, with its sculpted detail one level up from its mesh. So here
that detail is made its mesh, the hand is laid down palm up, with its fingers pointing
away and its wrist to the front, and most of the forearm it comes with is cut off.

It is written in metres, as glTF has it (the app reads it in mm, as it does any glTF
file), with the middle of the palm over the origin and the highest of it (the pads
either side, which a board rests on) at nothing.

It is run by Blender, not by Python, and only when the hand is to be made again: what
it writes is kept with the app.

    blender -b -Y --factory-startup --python kit/figure/hand.py -- \\
        human_base_meshes_bundle.blend apps/desktop/src/components/pcb/hand.glb
"""

import sys

import bmesh
import bpy
import numpy as np

HAND = "Hand  - Realistic"
# where the middle of the palm is, across and along the hand laid down, in the hand's
# own metres from the middle of the forearm's end (as `laid` has it): halfway from the
# wrist to the knuckles, between the first finger and the little one
PALM = (-0.008, 0.142)
# how far round the middle of the palm its highest is looked for, and how much of the
# forearm is kept past the wrist (at about 0.085 along)
PADS = 0.035
FOREARM_FROM = 0.045


def laid(points):
    """The hand's points, palm up and fingers pointing away: its palm faces +Y and its
    fingers -Z as it comes, and are turned to face +Z and point +Y. With the middle of
    the forearm's end over the origin."""
    out = np.stack([points[:, 0], -points[:, 2], points[:, 1]], axis=1)
    out[:, 0] -= out[:, 0].mean()
    out[:, 1] -= out[:, 1].min()
    return out


bundle, to = sys.argv[sys.argv.index("--") + 1 :][:2]
for other in list(bpy.data.objects):
    bpy.data.objects.remove(other)
with bpy.data.libraries.load(bundle, link=False) as (theirs, ours):
    ours.objects = [HAND]
hand = ours.objects[0]
bpy.context.scene.collection.objects.link(hand)
bpy.context.view_layer.objects.active = hand
hand.select_set(True)
# its detail, which is sculpted, made its mesh
for modifier in list(hand.modifiers):
    bpy.ops.object.modifier_apply(modifier=modifier.name)
hand.matrix_world.identity()
mesh = hand.data

points = np.empty(len(mesh.vertices) * 3)
mesh.vertices.foreach_get("co", points)
points = laid(points.reshape(-1, 3))
# the middle of the palm over the origin, and the highest of it round there at nothing
points[:, :2] -= PALM
round_palm = np.hypot(points[:, 0], points[:, 1]) < PADS
points[:, 2] -= points[round_palm, 2].max()
mesh.vertices.foreach_set("co", points.ravel())
mesh.update()

# the forearm cut off a little past the wrist, and its end closed
cut = bmesh.new()
cut.from_mesh(mesh)
bmesh.ops.bisect_plane(
    cut,
    geom=cut.verts[:] + cut.edges[:] + cut.faces[:],
    plane_co=(0, FOREARM_FROM - PALM[1], 0),
    plane_no=(0, -1, 0),
    clear_outer=True,
)
rim = [edge for edge in cut.edges if edge.is_boundary]
bmesh.ops.holes_fill(cut, edges=rim, sides=0)
bmesh.ops.triangulate(cut, faces=cut.faces[:])
cut.to_mesh(mesh)
cut.free()

for layer in list(mesh.uv_layers):
    mesh.uv_layers.remove(layer)
mesh.materials.clear()
bpy.ops.object.shade_smooth()
bpy.ops.export_scene.gltf(
    filepath=to,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="NONE",
    export_animations=False,
    export_skins=False,
    export_morph=False,
)
print(f"wrote {len(mesh.polygons)} faces to {to}")
