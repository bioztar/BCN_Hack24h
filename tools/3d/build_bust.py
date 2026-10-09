"""Headless Blender: officer bust/object -> relief, baked colour, rig, falling-dummy sim, GLB+USDZ.

blender -b --python build_bust.py -- <atlas.png> <depth.png> <palette.json> <outdir> <name>

Photo-space -> world: X=(px-384)/400, Z=(1024-py)/400, front of the model faces -Y.
Params per officer live in officers.json. Colour = photo projected from the front, feathered
into per-zone palette colours (hair/skin/suit) with noise, baked once to a single texture.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ATLAS, DEPTH, PALETTE, OUT, NAME = sys.argv[sys.argv.index("--") + 1:][:5]
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "officers.json")))[NAME]
PAL = json.load(open(PALETTE))
PW, PH, STRIP = 768, 1024, 64
AH = PH + STRIP
S = 400.0  # photo px per world unit
BAKE_RES = 2048


def lin(rgb):
    return tuple((c / 255.0) ** 2.2 for c in rgb) + (1.0,)


def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def mix(c0, c1, t):
    return tuple(a + (b - a) * t for a, b in zip(c0, c1))


def _pow(v, p):
    return math.copysign(abs(v) ** p, v)


def to_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def ellipsoid(name, c, r, seg=48, rings=24, sq=1.0, slope=0.0):
    """sq<1 squares the sphere toward a box (shoulders/chest); slope drops the top at the sides."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        x, y, z = _pow(v.co.x, sq), _pow(v.co.y, sq), _pow(v.co.z, sq)
        z -= slope * x * x * max(z, 0.0)
        v.co = Vector((c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]))
    return to_object(name, bm)


def cylinder(name, c, radius, depth):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=radius, radius2=radius * 1.1, depth=depth)
    for v in bm.verts:
        v.co = v.co + Vector(c)
    return to_object(name, bm)


def box(name, x, z, front_y, depth):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=24, use_grid_fill=True)
    sx, sz = x[1] - x[0], z[1] - z[0]
    for v in bm.verts:
        v.co = Vector(((x[0] + x[1]) / 2 + v.co.x * sx, front_y + depth / 2 + v.co.y * depth,
                       (z[0] + z[1]) / 2 + v.co.z * sz))
    return to_object(name, bm)


def set_zone(ob, fn):
    """Per-vertex palette colour (linear) in colour attribute 'zone'; fn(co) -> rgba."""
    attr = ob.data.color_attributes.new("zone", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(ob.data.vertices):
        attr.data[i].color = fn(v.co)


def load_depth():
    """16-bit depth PNG (near=white) -> (w, h, flat floats, row 0 = image bottom)."""
    img = bpy.data.images.load(DEPTH)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = img.pixels[:]
    return w, h, [px[i * 4] for i in range(w * h)]


def displace(ob, depth, k):
    """Push the photo-facing surface along -Y by the depth-map relief (nose, brows, lapels)."""
    w, h, d = depth
    me = ob.data
    me.update()
    for v in me.vertices:
        wgt = smooth(-0.30, -0.75, v.normal.y)
        if wgt == 0:
            continue
        ix = min(max(int(v.co.x * S + 384) * w // PW, 0), w - 1)
        iy = min(max(int((PH - v.co.z * S) * h // PH), 0), h - 1)
        val = d[(h - 1 - iy) * w + ix]
        if val > 0:
            v.co.y -= wgt * (val - 0.5) * k


def build_person():
    h = CFG["head"]
    sh = CFG["shoulder_z"]
    hair, skin, suit = lin(PAL["hair"]), lin(PAL["skin"]), lin(PAL["suit"])
    hair_z = h["cz"] - 0.2 * h["rz"]
    head = ellipsoid("head", (h["cx"], 0.0, h["cz"]), (h["rx"], h["ry"], h["rz"]), 96, 48)
    set_zone(head, lambda c: mix(skin, hair, smooth(hair_z - 0.08, hair_z + 0.08, c.z)))
    heads = [head]
    if CFG["ears"]:
        for n, sgn in (("ear_l", -1), ("ear_r", 1)):
            e = ellipsoid(n, (h["cx"] + sgn * h["rx"], 0.05, h["cz"] - 0.13 * h["rz"]),
                          (0.03, 0.06, 0.21 * h["rz"]), 16, 8)
            set_zone(e, lambda c: skin)
            heads.append(e)
    torso = ellipsoid("torso", (0.0, 0.05, sh - 0.92), (CFG["torso_rx"], CFG["torso_ry"], 0.92),
                      96, 48, sq=0.5, slope=0.45)
    base_z = sh - 1.69
    for v in torso.data.vertices:
        v.co.z = max(v.co.z, base_z)  # flat base cut under the chest
        t = min(max((base_z + 0.5 - v.co.z) / 0.5, 0.0), 1.0)
        v.co.x *= 1 - 0.55 * t  # taper to a narrow plinth so the dummy can topple
        v.co.y = 0.05 + (v.co.y - 0.05) * (1 - 0.3 * t)
    set_zone(torso, lambda c: suit)
    n_bot, n_top = sh - 0.25, h["cz"] - 0.75 * h["rz"]
    neck = cylinder("neck", (h["cx"] * 0.5, 0.02, (n_bot + n_top) / 2), min(0.19, 0.5 * h["rx"]), n_top - n_bot)
    set_zone(neck, lambda c: skin)
    depth = load_depth()
    for p in heads:
        displace(p, depth, CFG["relief_head"])
    displace(torso, depth, CFG["relief_torso"])
    return heads + [torso, neck], base_z, sh + 0.2


def build_terminal():
    cols = [lin(PAL["hair"]), lin(PAL["skin"]), lin(PAL["suit"])]
    depth = load_depth()
    parts = []
    for i, b in enumerate(CFG["boxes"]):
        ob = box(f"box{i}", b["x"], b["z"], b["front_y"], b["depth"])
        col = cols[b["zone"]]
        set_zone(ob, lambda c, col=col: col)
        displace(ob, depth, CFG["relief_head"] if b["part"] == "head" else CFG["relief_torso"])
        parts.append(ob)
    return parts, CFG["base_z"], CFG["split_z"]


def join(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = parts[0].data.name = name
    return parts[0]


def bake_material(target):
    """Photo (front projection) feathered into noisy zone colours -> Principled; target = bake image."""
    mat = bpy.data.materials.new("bake_src")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new

    def node(t, **kw):
        n = N(t)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def math_(op, a=None, b=None, c=None, clamp=False):
        m = node("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                m.inputs[i].default_value = v
        return m

    coord = node("ShaderNodeTexCoord")
    sep = node("ShaderNodeSeparateXYZ")
    L(coord.outputs["Object"], sep.inputs[0])
    u = math_("MULTIPLY_ADD", b=S / PW, c=384.0 / PW)
    v = math_("MULTIPLY_ADD", b=S / AH, c=1.0 - PH / AH)
    L(sep.outputs["X"], u.inputs[0])
    L(sep.outputs["Z"], v.inputs[0])
    comb = node("ShaderNodeCombineXYZ")
    L(u.outputs[0], comb.inputs["X"])
    L(v.outputs[0], comb.inputs["Y"])
    photo = node("ShaderNodeTexImage", extension="EXTEND")
    photo.image = bpy.data.images.load(ATLAS)
    L(comb.outputs[0], photo.inputs["Vector"])

    # feather: full photo for normal.y <= -0.40, none at >= -0.05 (extends round the cheeks)
    geo = node("ShaderNodeNewGeometry")
    nsep = node("ShaderNodeSeparateXYZ")
    L(geo.outputs["Normal"], nsep.inputs[0])
    w = math_("MULTIPLY_ADD", b=-1.0 / 0.35, c=-0.05 / 0.35, clamp=True)
    L(nsep.outputs["Y"], w.inputs[0])

    zone = node("ShaderNodeVertexColor", layer_name="zone")
    noise = node("ShaderNodeTexNoise", noise_dimensions="3D")
    noise.inputs["Scale"].default_value = 28.0
    noise.inputs["Detail"].default_value = 6.0
    L(coord.outputs["Object"], noise.inputs["Vector"])
    nr = node("ShaderNodeMapRange")
    nr.inputs["To Min"].default_value = 0.78
    nr.inputs["To Max"].default_value = 1.05
    L(noise.outputs["Fac"], nr.inputs["Value"])
    grain = node("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    grain.inputs["Factor"].default_value = 1.0
    L(zone.outputs["Color"], grain.inputs["A"])
    L(nr.outputs["Result"], grain.inputs["B"])

    final = node("ShaderNodeMix", data_type="RGBA")
    L(w.outputs[0], final.inputs["Factor"])
    L(grain.outputs["Result"], final.inputs["A"])
    L(photo.outputs["Color"], final.inputs["B"])
    bsdf = node("ShaderNodeBsdfPrincipled")
    L(final.outputs["Result"], bsdf.inputs["Base Color"])
    out = node("ShaderNodeOutputMaterial")
    L(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tgt = node("ShaderNodeTexImage")
    tgt.image = target
    nt.nodes.active = tgt  # bake writes to the active image node
    return mat


def bake_colour(ob):
    """Smart-unwrap ob and bake the layered material into one sRGB texture; return its path."""
    sc = bpy.context.scene
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(f"{NAME}_baked", BAKE_RES, BAKE_RES, alpha=False)
    img.colorspace_settings.name = "sRGB"
    ob.data.materials.clear()
    ob.data.materials.append(bake_material(img))
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=12, use_clear=True)
    path = os.path.join(OUT, f"{NAME}_albedo.jpg")
    img.filepath_raw = path
    img.file_format = "JPEG"
    img.save()
    return path


def final_material(path):
    mat = bpy.data.materials.new(NAME)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.75
    return mat


def split_head_torso(ob, split_z):
    """Separate loose shells, regroup into 'head' (centroid above split_z) and 'torso'."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    shells = list(bpy.context.selected_objects)
    heads, torsos = [], []
    for s in shells:
        zs = [v.co.z for v in s.data.vertices]
        (heads if sum(zs) / len(zs) > split_z else torsos).append(s)
    head = join("head", heads)
    torso = join("torso", torsos)
    for o in (head, torso):
        for p in o.data.polygons:
            p.use_smooth = True
    return head, torso


def rig_export(head, torso, base_z, split_z):
    """Single skinned mesh (torso/neck/head bones) -> GLB + USDZ in rest pose."""
    h2, t2 = head.copy(), torso.copy()
    h2.data, t2.data = head.data.copy(), torso.data.copy()
    for o in (h2, t2):
        bpy.context.collection.objects.link(o)

    def vgroup(ob, group, fn):
        g = ob.vertex_groups.new(name=group)
        for v in ob.data.vertices:
            wgt = fn(v.co)
            if wgt > 0:
                g.add([v.index], wgt, "REPLACE")

    neck_z = split_z - 0.15
    vgroup(h2, "head", lambda c: 1.0)
    vgroup(t2, "torso", lambda c: 1.0 if c.z < neck_z else 0.0)
    vgroup(t2, "neck", lambda c: 1.0 if c.z >= neck_z else 0.0)
    mesh = join(NAME, [h2, t2])

    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    tb = eb.new("torso"); tb.head, tb.tail = (0, 0, base_z), (0, 0, neck_z)
    nb = eb.new("neck"); nb.head, nb.tail = (0, 0, neck_z), (0, 0, split_z); nb.parent = tb
    hb = eb.new("head"); hb.head, hb.tail = (0, 0, split_z), (0, 0, split_z + 0.8); hb.parent = nb
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.parent = arm
    mesh.modifiers.new("Armature", "ARMATURE").object = arm

    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True); arm.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/{NAME}.glb", export_format="GLB", use_selection=True)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True); arm.select_set(True)
    bpy.ops.wm.usd_export(filepath=f"{OUT}/{NAME}.usdz", selected_objects_only=True)
    return mesh, arm


def sim_scene(head, torso, base_z, split_z):
    """Falling dummy: torso + head rigid bodies pinned at the neck, tilt then topple."""
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, base_z))
    ground = bpy.context.object
    bpy.ops.rigidbody.object_add()
    ground.rigid_body.type = "PASSIVE"
    ground.rigid_body.friction = 0.9
    gm = bpy.data.materials.new("floor")
    gm.diffuse_color = (0.12, 0.14, 0.18, 1)
    ground.data.materials.append(gm)
    for ob, mass in ((torso, 12.0), (head, 4.0)):
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.rigidbody.object_add()
        ob.rigid_body.mass = mass
        ob.rigid_body.collision_shape = "CONVEX_HULL"
        ob.rigid_body.friction = 0.8
        ob.rigid_body.restitution = 0.05
    torso.rotation_euler = (math.radians(-CFG.get("tilt", 14)), 0, math.radians(6))
    torso.location.z += 0.02
    bpy.ops.object.empty_add(location=(0.0, 0.02, split_z - 0.05))
    pin = bpy.context.object
    bpy.ops.rigidbody.constraint_add()
    pin.rigid_body_constraint.type = "POINT"
    pin.rigid_body_constraint.object1 = torso
    pin.rigid_body_constraint.object2 = head
    sc.frame_start, sc.frame_end = 1, 90


def render(path, cam_loc, target=(0, 0, 1.0), res=(480, 480)):
    sc = bpy.context.scene
    if "cam" not in bpy.data.objects:
        cd = bpy.data.cameras.new("cam")
        cd.lens = 55
        co = bpy.data.objects.new("cam", cd)
        sc.collection.objects.link(co)
        sc.camera = co
        for nm, energy, rot in (("sun", 5.0, (50, 0, -30)), ("fill", 3.0, (55, 0, 150))):
            ld = bpy.data.lights.new(nm, "SUN")
            ld.energy = energy
            lo = bpy.data.objects.new(nm, ld)
            lo.rotation_euler = tuple(math.radians(a) for a in rot)
            sc.collection.objects.link(lo)
        sc.world = bpy.data.worlds.new("w")
        sc.world.color = (0.8, 0.82, 0.86)
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects["cam"]
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts, base_z, split_z = build_terminal() if CFG["kind"] == "terminal" else build_person()
    bust = join("bust", parts)
    path = bake_colour(bust)
    head, torso = split_head_torso(bust, split_z)
    mat = final_material(path)
    for o in (head, torso):
        o.data.materials.clear()
        o.data.materials.append(mat)
    mesh, arm = rig_export(head, torso, base_z, split_z)

    head.hide_render = torso.hide_render = True
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    for i in range(6):
        a = math.radians(i * 60)
        render(f"{OUT}/{NAME}_turn_{i}.png", (math.sin(a) * 5.5, -math.cos(a) * 5.5, 1.6))
    mesh.hide_render = arm.hide_render = True
    head.hide_render = torso.hide_render = False
    sim_scene(head, torso, base_z, split_z)
    for f in range(1, 91):  # rigid-body cache only fills when stepped frame by frame
        bpy.context.scene.frame_set(f)
        if f in (1, 15, 30, 45, 60, 90):
            render(f"{OUT}/{NAME}_fall_{f:02d}.png", (5.5, -6.5, 2.4), target=(0, 0, 0.6))


main()
