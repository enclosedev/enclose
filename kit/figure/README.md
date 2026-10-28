# The figure of a person

`person.glb`, which stands in some of Enclose's reference scenes (`kit/scenes/person`,
and `kit/scenes/table` when he is asked for), is a man 1.75 m tall (5 ft 9), standing
with his arms at his sides. A scene's script hands the file to
`enclose.Reference.mesh`, as it would any mesh that comes ready made, and keeps a copy
of it beside itself.

## Where it comes from

It is made from the realistic male body in **Human Base Meshes**, version 1.4.1, by
Blender Studio and community contributors, which is in the public domain. The bundle's
own README says: "All provided assets are public domain under the CC0 license."

- the bundle: <https://www.blender.org/download/demo-files/> (under Asset Bundles)
- the licence: <https://creativecommons.org/publicdomain/zero/1.0/>

CC0 asks for no credit. This says where the figure is from all the same.

## How it is made

`person.py`, run by Blender (4.2 or later), takes the body out of the bundle, lowers its
arms, closes over the hollows of its eyes, makes it 1.75 m tall and thins it to a few
thousand triangles:

    blender -b -Y --factory-startup --python kit/figure/person.py -- \
        human_base_meshes_bundle.blend kit/scenes/person/person.glb
    cp kit/scenes/person/person.glb kit/scenes/table/person.glb
    npm run scenes

That is only for making the figure again. What it writes is kept with the app.

## The hand

`hand.glb`, which PCB mode can show a circuit board on in 3D (beside the app's own
code, in `apps/desktop/src/components/pcb/`), is an open hand, palm up, as big as a
man's. It is the realistic hand in the same Human Base Meshes bundle, in the public
domain as the figure is. `hand.py`, run by Blender, makes its sculpted detail its mesh,
lays it down palm up with its fingers pointing away, cuts off most of its forearm, and
writes it with the middle of the palm over the origin:

    blender -b -Y --factory-startup --python kit/figure/hand.py -- \
        human_base_meshes_bundle.blend apps/desktop/src/components/pcb/hand.glb
