"""Headless Blender: build a head-and-shoulders bust, project the Picsart still, rig,
run a rigid-body falling-dummy sim, render previews, export GLB + USDZ.

blender -b --python build_bust.py -- <atlas.png> <outdir> <name>

Photo-space -> world: X=(px-384)/400, Z=(1024-py)/400, front of bust faces -Y.
Atlas = photo (768x1024) + 64px swatch strip (hair | skin | suit), see make_atlas.py.
"""
import sys
import math
import bpy
import bmesh
from mathutils import Vector

ATLAS, DEPTH, OUT, NAME = sys.argv[sys.argv.index("--") + 1:][:4]
PW, PH, SW = 768, 1024, 64
AH = PH + SW
S = 400.0  # photo px per world unit

# (centre xyz, radii xyz) fitted to formblatt neutral; tune per officer via PARAMS
PARAMS = dict(
    head=((0.03, 0.0, 1.97), (0.40, 0.46, 0.53)),
    torso=((0.0, 0.05, 0.50), (0.97, 0.38, 0.92)),
    neck=((0.02, 0.02, 1.50), 0.19, 0.5),
    relief_head=0.55,
    relief_torso=0.30,
    ear_l=((-0.385, 0.05, 1.90), (0.03, 0.06, 0.11)),
    ear_r=((0.44, 0.05, 1.90), (0.03, 0.06, 0.11)),
    base_z=-0.30,
)
SWATCH = dict(hair=0, skin=1, suit=2)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _pow(v, p):
    return math.copysign(abs(v) ** p, v)


def ellipsoid(name, c, r, seg=48, rings=24, sq=1.0, slope=0.0):
    """sq<1 squares the sphere toward a box (shoulders/chest); slope drops the top at the sides."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        x, y, z = _pow(v.co.x, sq), _pow(v.co.y, sq), _pow(v.co.z, sq)
        z -= slope * x * x * max(z, 0.0)
        v.co = Vector((c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def cylinder(name, c, radius, depth):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=radius, radius2=radius * 1.1, depth=depth)
    for v in bm.verts:
        v.co = v.co + Vector(c)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def merge(name, parts):
    """Join part meshes into one object (no boolean: overlapping shells are fine under one texture)."""
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    parts[0].data.name = name
    return parts[0]


def project_uv(ob, swatch):
    """Front-facing faces: planar photo projection. Others: flat swatch (extends colour)."""
    me = ob.data
    uv = me.uv_layers.new(name="UV")
    sw_u = (swatch + 0.5) / 3.0
    sw_v = 1.0 - (PH + SW / 2) / AH
    for poly in me.polygons:
        front = poly.normal.y < -0.45
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if front:
                px = min(max(co.x * S + 384, 2), PW - 2)
                py = min(max(PH - co.z * S, 2), PH - 2)
                uv.data[li].uv = (px / PW, 1.0 - py / AH)
            else:
                uv.data[li].uv = (sw_u, sw_v)


def vgroup(ob, group, weight_fn):
    g = ob.vertex_groups.new(name=group)
    for v in ob.data.vertices:
        w = weight_fn(v.co)
        if w > 0:
            g.add([v.index], w, "REPLACE")


def make_material():
    mat = bpy.data.materials.new("officer")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(ATLAS)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.75
    return mat


def build():
    p = PARAMS
    depth = load_depth()
    head_e = ellipsoid("head", *p["head"], seg=96, rings=48)
    ears = [ellipsoid(n, *p[n], seg=16, rings=8) for n in ("ear_l", "ear_r")]
    torso_e = ellipsoid("torso", *p["torso"], seg=96, rings=48, sq=0.5, slope=0.45)
    for v in torso_e.data.vertices:
        v.co.z = max(v.co.z, p["base_z"])  # flat base cut under the chest
        t = min(max((0.2 - v.co.z) / (0.2 - p["base_z"]), 0.0), 1.0)
        v.co.x *= 1 - 0.55 * t  # taper to a narrow plinth so the dummy can topple
        v.co.y = p["torso"][0][1] + (v.co.y - p["torso"][0][1]) * (1 - 0.3 * t)
    neck = cylinder("neck", p["neck"][0], p["neck"][1], p["neck"][2])
    # colour first (face normals are clean), then depth relief on the front
    project_uv(head_e, SWATCH["hair"])
    for e in ears:
        project_uv(e, SWATCH["skin"])
    project_uv(torso_e, SWATCH["suit"])
    project_uv(neck, SWATCH["skin"])
    displace(head_e, depth, p["relief_head"])
    displace(torso_e, depth, p["relief_torso"])
    head = merge("head", [head_e] + ears)
    torso = merge("torso", [torso_e, neck])
    mat = make_material()
    for ob in (head, torso):
        ob.data.materials.append(mat)
        for poly in ob.data.polygons:
            poly.use_smooth = True
    return head, torso


def load_depth():
    """16-bit depth PNG (near=white) -> (w, h, flat float list, row 0 = image bottom)."""
    img = bpy.data.images.load(DEPTH)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = img.pixels[:]
    return w, h, [px[i * 4] for i in range(w * h)]


def _smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def displace(ob, depth, k):
    """Push the photo-facing surface along -Y by depth-map relief (nose, brows, jaw, lapels)."""
    w, h, d = depth
    me = ob.data
    me.update()
    for v in me.vertices:
        wgt = _smooth(-0.30, -0.75, v.normal.y)
        if wgt == 0:
            continue
        ix = min(max(int(v.co.x * S + 384) * w // PW, 0), w - 1)
        iy = min(max(int((PH - v.co.z * S) * h // PH), 0), h - 1)
        val = d[(h - 1 - iy) * w + ix]
        if val > 0:
            v.co.y -= wgt * (val - 0.5) * k


def rig_export(head, torso):
    """Single skinned mesh (head/neck/torso bones) -> GLB + USDZ, rest pose."""
    bpy.ops.object.select_all(action="DESELECT")
    h2, t2 = head.copy(), torso.copy()
    h2.data, t2.data = head.data.copy(), torso.data.copy()
    for o in (h2, t2):
        bpy.context.collection.objects.link(o)
    vgroup(h2, "head", lambda c: 1.0)
    vgroup(t2, "torso", lambda c: 1.0 if c.z < 1.5 else 0.0)
    vgroup(t2, "neck", lambda c: 1.0 if c.z >= 1.5 else 0.0)
    mesh = merge(NAME, [h2, t2])

    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    torso_b = eb.new("torso"); torso_b.head, torso_b.tail = (0, 0, PARAMS["base_z"]), (0, 0, 1.5)
    neck_b = eb.new("neck"); neck_b.head, neck_b.tail = (0, 0, 1.5), (0, 0, 1.75); neck_b.parent = torso_b
    head_b = eb.new("head"); head_b.head, head_b.tail = (0, 0, 1.75), (0, 0, 2.5); head_b.parent = neck_b
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.parent = arm
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm

    for fmt, path, kw in (
        ("glb", f"{OUT}/{NAME}.glb", {}),
    ):
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True); arm.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True); arm.select_set(True)
    bpy.ops.wm.usd_export(filepath=f"{OUT}/{NAME}.usdz", selected_objects_only=True)
    return mesh, arm


def sim_scene(head, torso):
    """Falling dummy: torso + head as rigid bodies pinned at the neck, tilt then topple."""
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, PARAMS["base_z"]))
    ground = bpy.context.object
    bpy.ops.rigidbody.object_add(); ground.rigid_body.type = "PASSIVE"; ground.rigid_body.friction = 0.9
    gm = bpy.data.materials.new("floor"); gm.diffuse_color = (0.12, 0.14, 0.18, 1)
    ground.data.materials.append(gm)
    for ob, mass in ((torso, 12.0), (head, 4.0)):
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.rigidbody.object_add()
        ob.rigid_body.mass = mass
        ob.rigid_body.collision_shape = "CONVEX_HULL"
        ob.rigid_body.friction = 0.8
        ob.rigid_body.restitution = 0.05
    # torso tilts 14 deg about X (lean forward) so it topples
    torso.rotation_euler = (math.radians(-14), 0, math.radians(6))
    torso.location.z += 0.02
    bpy.ops.object.empty_add(location=(0.02, 0.02, 1.55))
    pin = bpy.context.object
    bpy.ops.rigidbody.constraint_add(); pin.rigid_body_constraint.type = "POINT"
    pin.rigid_body_constraint.object1 = torso; pin.rigid_body_constraint.object2 = head
    sc.frame_start, sc.frame_end = 1, 90
    return ground


def render(path, frame=None, cam_loc=(0, -7.5, 2.2), target=(0, 0, 1.0), res=(480, 480)):
    sc = bpy.context.scene
    if "cam" not in bpy.data.objects:
        cd = bpy.data.cameras.new("cam"); cd.lens = 55
        co = bpy.data.objects.new("cam", cd); sc.collection.objects.link(co); sc.camera = co
        ld = bpy.data.lights.new("sun", "SUN"); ld.energy = 5.0
        lo = bpy.data.objects.new("sun", ld); lo.rotation_euler = (math.radians(50), 0, math.radians(-30))
        sc.collection.objects.link(lo)
        fd = bpy.data.lights.new("fill", "SUN"); fd.energy = 3.0  # lights the back in turntable
        fo = bpy.data.objects.new("fill", fd); fo.rotation_euler = (math.radians(55), 0, math.radians(150))
        sc.collection.objects.link(fo)
        sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.8, 0.82, 0.86)
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects["cam"]
    cam.location = cam_loc
    d = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if frame is not None:
        sc.frame_set(frame)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    reset()
    head, torso = build()
    mesh, arm = rig_export(head, torso)
    # turntable strip from the exported static mesh (hide originals)
    head.hide_render = torso.hide_render = True
    for i in range(6):
        a = math.radians(i * 60)
        r = 5.5
        render(f"{OUT}/{NAME}_turn_{i}.png", cam_loc=(math.sin(a) * r, -math.cos(a) * r, 1.6), target=(0, 0, 1.0))
    # sim on the separate pieces
    mesh.hide_render = arm.hide_render = True
    head.hide_render = torso.hide_render = False
    sim_scene(head, torso)
    shots = (1, 15, 30, 45, 60, 90)
    for f in range(1, 91):  # rigid-body cache only fills when stepped frame by frame
        bpy.context.scene.frame_set(f)
        if f in shots:
            render(f"{OUT}/{NAME}_fall_{f:02d}.png", cam_loc=(5.5, -6.5, 2.4), target=(0, 0, 0.6))
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/{NAME}.blend")


main()
