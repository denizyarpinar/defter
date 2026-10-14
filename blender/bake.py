"""Defter – Faz 2.3: light bake and oda.glb export.

Opens blender/oda.blend (made by build_room.py), bakes day and evening light into two lightmaps
(light only, no colour) and exports the static room as public/models/oda.glb.

Steps:
  1. Cycles OptiX on the NVIDIA GPU only.
  2. Shadow-only bookcase box (Sadece_Golge / KITAPLIK): casts shadows, is not baked or exported.
  3. Second UV map "Lightmap" on every baked object, one shared 2048 atlas.
  4. Diffuse bake (Direct + Indirect, no Color) with only Isik_Gunduz on, then only Isik_Aksam.
  5. Compositor Denoise (the evening map stays grainy even at 512 samples without it).
  6. Own scale per map → lightmap_gunduz.png, lightmap_aksam.png (sRGB, 0–1) and lightmap.json.
  7. glTF export (both UV maps, +Y up, no lights/camera/bookcase, lightmaps not embedded).
  8. Check renders from the preview camera: blender/out/kontrol-gunduz.png, kontrol-aksam.png.

Run (from the project folder, in the background):
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b blender/oda.blend -P blender/bake.py
Progress: blender/out/bake.log
Optional: -- --gunduz 256 --aksam 2048   (samples per bake; these are the defaults)
Only one map again (the other map, its scale and oda.glb stay as they are; same Lightmap UVs):
  blender.exe -b blender/out/oda-bake.blend -P blender/bake.py -- --sadece aksam
Then compress (keep names, hierarchy, geometry and the unused-by-materials TEXCOORD_1):
  npx @gltf-transform/cli optimize public/models/oda.glb public/models/oda.glb --compress meshopt
      --texture-compress webp --texture-size 2048 --join false --flatten false --simplify false
      --instance false --palette false --prune-attributes false
Then the 1024 px files for iPad/phone (also puts the "mobil" block back into lightmap.json):
  blender.exe -b -P blender/mobil.py
"""
import json
import math
import os
import sys
import time
import traceback

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out")
MODELS = os.path.join(ROOT, "public", "models")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MODELS, exist_ok=True)

_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAMPLES = {name: int(_args[_args.index(f"--{name}") + 1]) if f"--{name}" in _args else default
           for name, default in (("gunduz", 256), ("aksam", 2048))}
ONLY = _args[_args.index("--sadece") + 1] if "--sadece" in _args else None   # "gunduz" or "aksam"
STATES = [(n, e) for n, e in (("gunduz", False), ("aksam", True)) if ONLY in (None, n)]
SIZE = 2048
MARGIN_PX = 8                      # rule: at least 8 px; every one of ~3200 islands pays it, 16 px left the atlas 2% full
LM_UV = "Lightmap"
# Scale per map = its own maximum, but at most HDR_CAP: only the lamp shade right next to the bulb goes past it
# (up to ~430), and above ~8 the app's ACES tone mapping shows white anyway. A higher cap would cost
# precision (banding) in the dark evening walls. One common scale clipped the evening lamp glow.
HDR_CAP = 8.0
# Spot light source radius, same as build_room.py. 0.06 was tried: the light then leaks past the shade
# and the desk came out ~60% brighter than the approved preview; 512 samples handle the noise instead.
LAMP_RADIUS = 0.04

_log = open(os.path.join(OUT, "bake.log"), "w", encoding="utf-8")
_t0 = time.time()


def log(msg):
    line = f"[{time.time() - _t0:7.1f}s] {msg}"
    print(line, flush=True)
    _log.write(line + "\n")
    _log.flush()


scene = bpy.context.scene
view_layer = bpy.context.view_layer


def find(name):
    for o in scene.objects:
        if o.name == name or o.name.startswith(name + "."):
            return o
    return None


def material_input(obj, name):
    """Input socket of the first node of the object's material that has this input."""
    if not obj or not obj.material_slots or not obj.material_slots[0].material:
        return None
    for node in obj.material_slots[0].material.node_tree.nodes:
        if name in node.inputs:
            return node.inputs[name]
    return None


# ---------------------------------------------------------------- 1. device
def setup_device():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"             # the RTX 4070 only; Intel Iris Xe and CPU stay off
    used = [d.name for d in prefs.devices if d.use]
    if not used:
        raise SystemExit("OptiX cihazı bulunamadı (NVIDIA sürücüsünü kontrol et).")
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    log("Cihaz: " + ", ".join(used) + " (OptiX)")


# ---------------------------------------------------------------- 2. shadow-only bookcase
# Plan units from src/scene/units.ts and boxes from buildCase() in src/scene/bookcase.ts, 5 shelves.
U = 0.01
BX, BW, BD, SH, BASE, TOP = 300, 380, 72, 88, 26, 16
SHELVES = 5
CASE_H = BASE + SHELVES * SH - 8 + TOP     # caseHeight(n)


def plan_box(name, x, y, z, sx, sy, sz, coll, mat):
    """Box with its corner at plan (x, y, z) and size (sx, sy, sz); plan (x, y, z-up) → Blender (x, -y, z)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    hx, hy, hz = sx * U / 2, sy * U / 2, sz * U / 2
    verts = [(sx_ * hx, sy_ * hy, sz_ * hz) for sx_ in (-1, 1) for sy_ in (-1, 1) for sz_ in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    obj.location = Vector(((x + sx / 2) * U, -(y + sy / 2) * U, (z + sz / 2) * U))
    return obj


def build_shadow_case():
    coll = bpy.data.collections.new("Sadece_Golge")
    scene.collection.children.link(coll)
    mat = bpy.data.materials.new("Kitaplik_Golge")
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.09, 0.05, 0.03, 1.0)   # dark walnut, for bounce light
    bsdf.inputs["Roughness"].default_value = 0.7
    h = CASE_H
    parts = [
        (BX + 14, 1, 0, BW - 28, 2, h - TOP),                  # back
        (BX, 0, 0, 14, BD, h - TOP),                           # left side
        (BX + BW - 14, 0, 0, 14, BD, h - TOP),                 # right side
        (BX + 10, 0, 0, BW - 20, BD, BASE),                    # base
        (BX - 7, -3, h - TOP, BW + 14, BD + 8, TOP),           # top
        (BX - 3, -1, h - TOP - 4, BW + 6, BD + 4, 4),          # top moulding
    ] + [(BX + 14, 2, BASE + i * SH - 8, BW - 28, BD - 2, 8) for i in range(1, SHELVES)]
    objs = [plan_box(f"KITAPLIK_{i}", *p, coll, mat) for i, p in enumerate(parts)]
    for o in objs:
        o.visible_camera = False          # shadow and bounce light only
        o["defter"] = "sadece_golge"
    log(f"Sadece_Golge: KITAPLIK, {len(objs)} kutu, {SHELVES} raf, yükseklik {h * U:.2f} m")
    return coll


# ---------------------------------------------------------------- 3–4. lightmap UVs
def poly_area_3d(mw, verts, poly):
    pts = [mw @ verts[i].co for i in poly.vertices]
    a = Vector()
    for i in range(1, len(pts) - 1):
        a += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
    return a.length / 2


def uv_area(uv, poly):
    pts = [uv.data[i].uv for i in poly.loop_indices]
    s = 0.0
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        s += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    return abs(s) / 2


def select_only(objs, active):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = active


def make_lightmap_uvs(objs):
    for o in objs:
        me = o.data
        render_uv = me.uv_layers[0]
        lm = me.uv_layers.get(LM_UV) or me.uv_layers.new(name=LM_UV)
        render_uv.active_render = True       # materials keep using the first UV map (TEXCOORD_0)
        me.uv_layers.active = lm             # operators below edit the lightmap UV only
        for p in me.polygons:
            p.select = True

    select_only(objs, objs[0])
    scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Same texel density everywhere: scale each object's islands by sqrt(3D area / UV area).
    for o in objs:
        me = o.data
        uv = me.uv_layers[LM_UV]
        a3 = sum(poly_area_3d(o.matrix_world, me.vertices, p) for p in me.polygons)
        a2 = sum(uv_area(uv, p) for p in me.polygons)
        k = math.sqrt(a3 / a2) if a2 > 1e-12 else 1.0
        co = np.empty(len(uv.data) * 2, dtype=np.float32)
        uv.data.foreach_get("uv", co)
        uv.data.foreach_set("uv", co * k)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, scale=True, merge_overlap=False,
                            margin_method="FRACTION", margin=MARGIN_PX / SIZE, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Check: everything inside 0–1 and the share of the atlas in use.
    used = 0.0
    lo, hi = 1.0, 0.0
    for o in objs:
        uv = o.data.uv_layers[LM_UV]
        co = np.empty(len(uv.data) * 2, dtype=np.float32)
        uv.data.foreach_get("uv", co)
        lo, hi = min(lo, float(co.min())), max(hi, float(co.max()))
        used += sum(uv_area(uv, p) for p in o.data.polygons)
    log(f"Lightmap UV: {len(objs)} obje, tek atlas, margin {MARGIN_PX} px, doluluk %{used * 100:.0f}, "
        f"UV aralığı {lo:.3f}–{hi:.3f}")


# ---------------------------------------------------------------- 5. bake targets
def baked_materials(objs):
    mats = []
    for o in objs:
        for s in o.material_slots:
            if s.material and s.material not in mats:
                mats.append(s.material)
    return mats


def add_bake_nodes(mats, image):
    for m in mats:
        nt = m.node_tree
        tex = nt.nodes.get("LM_Bake") or nt.nodes.new("ShaderNodeTexImage")
        tex.name = tex.label = "LM_Bake"
        tex.image = image
        tex.interpolation = "Linear"
        uvn = nt.nodes.get("LM_UV") or nt.nodes.new("ShaderNodeUVMap")
        uvn.name = "LM_UV"
        uvn.uv_map = LM_UV
        if not tex.inputs["Vector"].is_linked:
            nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        for n in nt.nodes:
            n.select = False
        tex.select = True
        nt.nodes.active = tex


def remove_bake_nodes(mats):
    for m in mats:
        for name in ("LM_Bake", "LM_UV"):
            n = m.node_tree.nodes.get(name)
            if n:
                m.node_tree.nodes.remove(n)


# ---------------------------------------------------------------- 6–7. light states (same as build_room.py)
day = bpy.data.collections["Isik_Gunduz"]
night = bpy.data.collections["Isik_Aksam"]


def world(name, color, strength):
    """World from build_room.py; an unused world is not saved in the .blend, so rebuild it if missing."""
    w = bpy.data.worlds.get(name)
    if w is None:
        w = bpy.data.worlds.new(name)
        bg = w.node_tree.nodes.get("Background")
        bg.inputs["Color"].default_value = (*color, 1.0)
        bg.inputs["Strength"].default_value = strength
    w.use_fake_user = True
    return w


world_day = world("Dunya_Gunduz", (0.86, 0.91, 1.0), 1.0)       # SKY_DAY in build_room.py
world_night = world("Dunya_Aksam", (0.10, 0.14, 0.28), 0.35)    # SKY_NIGHT
bulb_emission = material_input(find("Ampul"), "Emission Strength")
sky_strength = material_input(find("Gokyuzu"), "Strength") or material_input(find("Gokyuzu"), "Emission Strength")
BULB_EMISSION = 25.0


def set_state(evening):
    day.hide_render = evening
    night.hide_render = not evening
    set_world(evening)


def set_world(evening):
    scene.world = world_night if evening else world_day
    if bulb_emission:
        bulb_emission.default_value = BULB_EMISSION if evening else 0.0
    if sky_strength:
        sky_strength.default_value = 0.08 if evening else 1.0


def bake(name, evening, objs, mats):
    set_state(evening)
    img = bpy.data.images.new(f"LM_{name}", SIZE, SIZE, alpha=True, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    img.generated_color = (0, 0, 0, 0)
    add_bake_nodes(mats, img)
    select_only(objs, objs[0])
    rb = scene.render.bake
    rb.margin = MARGIN_PX
    rb.margin_type = "EXTEND"
    rb.use_clear = True
    rb.target = "IMAGE_TEXTURES"
    scene.cycles.samples = SAMPLES[name]
    scene.cycles.blur_glossy = 1.0                 # fewer caustic fireflies; glossy is not in the lightmap anyway
    log(f"Bake {name}: başladı ({SAMPLES[name]} sample, {SIZE}×{SIZE})")
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=MARGIN_PX,
                        margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES")
    dt = time.time() - t
    log(f"Bake {name}: bitti, {dt:.0f} sn ({dt / 60:.1f} dk)")
    img.filepath_raw = os.path.join(OUT, f"lightmap_{name}.exr")
    img.file_format = "OPEN_EXR"
    img.save()
    px = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return img, denoise(name, px.reshape(SIZE, SIZE, 4)), dt


def pull_push(rgb, mask):
    """Fill empty texels from the nearest islands (mip pyramid), so the denoiser does not pull black into
    island edges. The filled gaps also act as a wider margin for mipmaps in the app."""
    if rgb.shape[0] == 1 or mask.all():
        return np.where(mask[..., None], rgb, rgb[mask].mean(0) if mask.any() else 0)
    h = rgb.shape[0] // 2
    w = mask.astype(np.float32)
    ws = w.reshape(h, 2, h, 2).sum((1, 3))
    cs = (rgb * w[..., None]).reshape(h, 2, h, 2, 3).sum((1, 3))
    coarse = np.where(ws[..., None] > 0, cs / np.maximum(ws, 1e-9)[..., None], 0)
    coarse = pull_push(coarse, ws > 0)
    return np.where(mask[..., None], rgb, coarse.repeat(2, 0).repeat(2, 1))


def denoise(name, px):
    """Compositor Denoise node (OIDN) on the baked lightmap; returns pixels with the original alpha (island mask)."""
    mask = px[:, :, 3] > 0
    buf = np.ones((SIZE, SIZE, 4), np.float32)
    buf[:, :, :3] = pull_push(px[:, :, :3], mask)
    src = bpy.data.images.new(f"LM_{name}_src", SIZE, SIZE, alpha=True, float_buffer=True)
    src.colorspace_settings.name = "Non-Color"
    src.pixels.foreach_set(buf.ravel())

    sc = bpy.data.scenes.new(f"Denoise_{name}")
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.use_compositing = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    nt = bpy.data.node_groups.new(f"Denoise_{name}", "CompositorNodeTree")
    nt.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    im = nt.nodes.new("CompositorNodeImage")
    im.image = src
    dn = nt.nodes.new("CompositorNodeDenoise")
    dn.inputs["HDR"].default_value = True
    dn.inputs["Prefilter"].default_value = "Accurate"
    dn.inputs["Quality"].default_value = "High"
    out = nt.nodes.new("NodeGroupOutput")
    nt.links.new(im.outputs["Image"], dn.inputs["Image"])
    nt.links.new(dn.outputs["Image"], out.inputs[0])
    sc.compositing_node_group = nt

    t = time.time()
    bpy.ops.render.render(scene=sc.name)          # no Render Layers node: only the compositor runs
    path = os.path.join(OUT, f"lightmap_{name}_denoise.exr")
    bpy.data.images["Render Result"].save_render(path, scene=sc)
    res = bpy.data.images.load(path, check_existing=False)
    res.colorspace_settings.name = "Non-Color"
    o = np.empty(SIZE * SIZE * 4, np.float32)
    res.pixels.foreach_get(o)
    o = o.reshape(SIZE, SIZE, 4)
    o[:, :, 3] = px[:, :, 3]
    for x in (res, src):
        bpy.data.images.remove(x)
    bpy.data.scenes.remove(sc)
    log(f"Denoise {name}: {time.time() - t:.0f} sn → blender/out/lightmap_{name}_denoise.exr")
    return o


def linear_to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.maximum(x, 0.0031308), 1 / 2.4) - 0.055)


def save_png(name, px, scale):
    rgb = np.clip(px[:, :, :3] / scale, 0.0, 1.0)
    out = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    out[:, :, :3] = linear_to_srgb(rgb)
    img = bpy.data.images.new(f"LM_{name}_png", SIZE, SIZE, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"     # values are already sRGB-encoded: write them as they are
    img.pixels.foreach_set(out.ravel())
    path = os.path.join(MODELS, f"lightmap_{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    clipped = float((px[:, :, :3].max(axis=2) > scale).mean() * 100)
    log(f"Kaydedildi: public/models/lightmap_{name}.png (kırpılan piksel %{clipped:.3f})")
    return path


# ---------------------------------------------------------------- 8. export
def export_glb(export_objs):
    """glTF export. The exporter writes the "Lightmap" UV map as TEXCOORD_1 even though no material uses it;
    gltf-transform must then run with --prune-attributes false or it drops it."""
    select_only(export_objs, export_objs[0])
    path = os.path.join(MODELS, "oda.glb")
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=path, export_format="GLB", use_selection=True,
                export_yup=True, export_texcoords=True, export_normals=True, export_extras=True,
                export_cameras=False, export_lights=False, export_apply=False, export_materials="EXPORT")
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in props})
    log(f"Dışa aktarıldı: public/models/oda.glb ({os.path.getsize(path) / 1e6:.1f} MB, sıkıştırmadan önce)")


# ---------------------------------------------------------------- 9. check renders
def load_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = "sRGB"
    return img


def make_check_materials(mats, lm_img, scale):
    """Base colour × lightmap (from the PNG, as the app will read it) as emission. Returns (image, emission) nodes."""
    texs = []
    for m in mats:
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        out = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and n.is_active_output), None)
        if not bsdf or not out:
            continue
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = LM_UV
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = lm_img
        tex.interpolation = "Linear"
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        base = bsdf.inputs["Base Color"]
        if base.is_linked:
            nt.links.new(base.links[0].from_socket, mul.inputs["A"])
        else:
            mul.inputs["A"].default_value = base.default_value
        nt.links.new(tex.outputs["Color"], mul.inputs["B"])
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = scale
        texs.append((tex, em))
        nt.links.new(mul.outputs["Result"], em.inputs["Color"])
        shader = em.outputs["Emission"]
        alpha = bsdf.inputs["Alpha"]
        if alpha.is_linked or alpha.default_value < 1.0:
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            mix = nt.nodes.new("ShaderNodeMixShader")
            if alpha.is_linked:
                nt.links.new(alpha.links[0].from_socket, mix.inputs["Fac"])
            else:
                mix.inputs["Fac"].default_value = alpha.default_value
            nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
            nt.links.new(shader, mix.inputs[2])
            shader = mix.outputs["Shader"]
        nt.links.new(shader, out.inputs["Surface"])
    return texs


def check_render(name, evening, shadow_objs):
    """Lightmap × colour only: live lights off, only the window sky and the bulb glow themselves.
    The bookcase box is shown, otherwise its baked shadow on the wall looks like a black stain."""
    for o in shadow_objs:
        o.visible_camera = True
    day.hide_render = night.hide_render = True
    set_world(evening)
    scene.cycles.samples = 64
    path = os.path.join(OUT, f"kontrol-{name}.png")
    tmp = os.path.join(OUT, f"kontrol-{name}.tmp.png")
    scene.render.filepath = tmp                    # the final file may be open (locked) in an image viewer
    t = time.time()
    bpy.ops.render.render(write_still=True)
    for _ in range(10):
        try:
            os.replace(tmp, path)
            log(f"Kontrol resmi: blender/out/kontrol-{name}.png ({time.time() - t:.0f} sn)")
            return
        except PermissionError:
            time.sleep(1)
    log(f"Kontrol resmi: kontrol-{name}.png açık/kilitli, sonuç blender/out/kontrol-{name}.tmp.png olarak kaldı")


# ---------------------------------------------------------------- main
def main():
    log(f"Blender {bpy.app.version_string}, sample: " + ", ".join(f"{n} {SAMPLES[n]}" for n, _ in STATES))
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    setup_device()
    lamp = bpy.data.objects["Lamba"].data
    log(f"Masa lambası kaynağı: {lamp.shadow_soft_size:.2f} → {LAMP_RADIUS:.2f} m")
    lamp.shadow_soft_size = LAMP_RADIUS

    if ONLY:
        shadow = bpy.data.collections.get("Sadece_Golge")
        if not shadow:
            raise SystemExit("--sadece için blender/out/oda-bake.blend açılmalı (önce tam bake gerekir).")
        log(f"Sadece {ONLY}: UV'ler ve oda.glb aynı kalır")
    else:
        shadow = build_shadow_case()
    shadow_objs = set(shadow.objects)
    live = [o for o in scene.objects if o.get("defter") == "canli"]
    meshes = [o for o in scene.objects if o.type == "MESH"]
    baked = [o for o in meshes if o not in shadow_objs and o.get("defter") != "canli"]
    log("Canlı (lightmap yok): " + ", ".join(o.name for o in live))
    log(f"Fırınlanacak: {len(baked)} obje, {sum(len(o.data.polygons) for o in baked)} yüz")

    for o in baked:                                  # lightmap UVs must not be shared between objects
        if o.data.users > 1:
            o.data = o.data.copy()
    if not ONLY:
        make_lightmap_uvs(baked)
    mats = baked_materials(baked)
    shared = [m.name for m in mats if any(m.name in [s.material.name for s in o.material_slots if s.material] for o in live)]
    if shared:
        raise SystemExit("Canlı ve fırınlanan parçalar aynı malzemeyi kullanıyor: " + ", ".join(shared))
    log(f"Bake hedefi: {len(mats)} malzeme, tek {SIZE}×{SIZE} resim")

    results = {}
    for name, evening in STATES:
        results[name] = bake(name, evening, baked, mats)

    # Own scale per map (the app multiplies each lightmap by its own scale before blending day and evening).
    json_path = os.path.join(MODELS, "lightmap.json")
    old = {}
    if ONLY:
        with open(json_path, encoding="utf-8") as f:
            old = json.load(f)
    scales = dict(old.get("carpan", {}))
    samples = {**old.get("sample", {}), **{n: SAMPLES[n] for n in results}}
    times = {**old.get("bakeSuresiSn", {}), **{n: round(r[2]) for n, r in results.items()}}
    for name, (_, px, _) in results.items():
        v = px[:, :, :3].max(axis=2)[px[:, :, 3] > 0]
        scales[name] = min(float(v.max()), HDR_CAP)
        log(f"Çarpan {name}: {scales[name]:.4f} (en büyük değer {float(v.max()):.2f}, ortanca {float(np.median(v)):.3f})")
    pngs = {name: os.path.join(MODELS, f"lightmap_{name}.png") for name in ("gunduz", "aksam")}
    for name, (_, px, _) in results.items():
        save_png(name, px, scales[name])
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "surum": 1,
            "carpan": {name: round(scales[name], 6) for name in ("gunduz", "aksam")},
            "renk": "srgb",
            "boyut": SIZE,
            "uv": 1,
            "gunduz": "lightmap_gunduz.png",
            "aksam": "lightmap_aksam.png",
            "sample": {name: samples[name] for name in ("gunduz", "aksam")},
            "bakeSuresiSn": {name: times[name] for name in ("gunduz", "aksam")},
        }, f, ensure_ascii=False, indent=2)
        f.write("\n")
    log("Kaydedildi: public/models/lightmap.json")

    # Export: room objects (and their empty parents) + live parts; no lights, camera, bookcase box.
    remove_bake_nodes(mats)
    for img in [r[0] for r in results.values()]:
        bpy.data.images.remove(img)
    if not ONLY:
        export_objs = [o for o in scene.objects if o.type in ("MESH", "EMPTY") and o not in shadow_objs]
        export_glb(export_objs)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "oda-bake.blend"), copy=True)
        log("Kaydedildi: blender/out/oda-bake.blend")

    # Check renders from the preview camera (materials are changed only after the export and the save).
    nodes = make_check_materials(mats, load_png(pngs["gunduz"]), scales["gunduz"])
    check_render("gunduz", False, shadow_objs)
    aksam = load_png(pngs["aksam"])
    for tex, em in nodes:
        tex.image = aksam
        em.inputs["Strength"].default_value = scales["aksam"]
    check_render("aksam", True, shadow_objs)

    log("Bitti.")


try:
    main()
except SystemExit as e:
    log(f"DURDU: {e}")
    raise
except Exception:
    log("HATA:\n" + traceback.format_exc())
    raise
