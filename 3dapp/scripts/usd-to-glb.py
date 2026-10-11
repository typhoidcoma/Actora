"""USD -> GLB for the 3D app (three.js can't play UsdSkel animation; glTF it can).

    blender -b -P scripts/usd-to-glb.py -- assets-src/character.usdz public/models/character.glb

Every animation in the USD becomes a named glTF clip. Name them to match
src/character.ts (idle, talk, think, ...) or edit the mapping there.
"""

import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(args) != 2:
    sys.exit("usage: blender -b -P usd-to-glb.py -- <in.usd[a|c|z]> <out.glb>")
src, dst = args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.usd_import(filepath=src, import_skeletons=True, import_blendshapes=True)

# USD brings in one animation per skeleton; a USD with several clips may arrive as
# separate actions. Push each onto the armature's NLA so the exporter writes them all.
for arm in (o for o in bpy.data.objects if o.type == "ARMATURE"):
    ad = arm.animation_data or arm.animation_data_create()
    for action in bpy.data.actions:
        if any(t.strips and t.strips[0].action == action for t in ad.nla_tracks):
            continue
        track = ad.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
    ad.action = None

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_skins=True,
    export_morph=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_yup=True,
)
print(f"wrote {dst}: {len(bpy.data.actions)} clip(s): {', '.join(a.name for a in bpy.data.actions)}")
