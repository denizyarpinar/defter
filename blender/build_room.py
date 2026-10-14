"""Defter – Faz 2.2: Blender light setup.

Imports the room exported from the app (blender/assets/oda-kaynak.glb, made with ?export=oda),
adds day and evening lights and a camera matching the app's room view, renders two previews
and saves blender/oda.blend for the bake tasks.

Geometry, colours, textures and layout are NOT changed: only lights are added.

Run (from the project folder):
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P blender/build_room.py
Progress: blender/out/build.log
"""
import math
import os
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "oda-kaynak.glb")
OUT = os.path.join(HERE, "out")
BLEND = os.path.join(HERE, "oda.blend")
os.makedirs(OUT, exist_ok=True)

_log = open(os.path.join(OUT, "build.log"), "w", encoding="utf-8")
_t0 = time.time()


def log(msg):
    line = f"[{time.time() - _t0:6.1f}s] {msg}"
    print(line, flush=True)
    _log.write(line + "\n")
    _log.flush()


def b(x, y, z):
    """three.js (Y up) → Blender (Z up), same as the glTF importer: (x, y, z) → (x, -z, y)."""
    return Vector((x, -z, y))


def aim(obj, target):
    """Point a camera or light (they look along their local -Z) at a target."""
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


# ---- values copied from the app (src/scene/lights.ts, room.ts, camera.ts) ----
SUN_DIR = Vector((-0.32, -1.0, 0.82)).normalized()           # direction the sunlight travels (three.js)
SUN_COLOR = (1.0, 0.93, 0.80)                                 # day colour in setLighting (k = 0)
MOON_COLOR = (0.60, 0.71, 1.00)                               # same light at k = 1 (evening): pale blue
LAMP_HEAD = (0.80, 2.48, 2.94)                                # refs.lampHead
LAMP_TARGET = (0.93, 1.46, 3.87)                              # DESK_SPOT + (0.15, 0, -0.25)
LAMP_COLOR = (1.0, 0xC2 / 255, 0x7E / 255)                    # spot 0xffc27e
GLOW_COLOR = (1.0, 0xAE / 255, 0x62 / 255)                    # point 0xffae62
CAM_TARGET = (5.1, 1.55, 4.2)                                 # viewParams('room')
CAM_DIR = Vector((1.0, 0.86, 1.08)).normalized()
FOV_Y = 26.0                                                  # PerspectiveCamera(26, …): vertical
RES_X, RES_Y = 1440, 900

# light strengths (tuned against app screenshots)
SUN_STRENGTH = 1.9 * math.pi        # app: 1.9 × π (physical units)
MOON_STRENGTH = 0.35 * math.pi      # app evening: 0.35 × π, through the window
SKY_DAY = ((0.86, 0.91, 1.0), 1.0)  # world colour, strength
SKY_NIGHT = ((0.10, 0.14, 0.28), 0.35)
LAMP_POWER = 500.0                  # W
GLOW_POWER = 60.0                   # W
BULB_EMISSION = 25.0
# The app: ACES tone mapping, exposure 0.86 → ×(0.86 / 0.6) inside three.js → +0.52 EV.
VIEW_TRANSFORM, EXPOSURE = "ACES 1.3", math.log2(0.86 / 0.6)


# ---------------------------------------------------------------- import
log(f"Blender {bpy.app.version_string}")
if not os.path.exists(SRC):
    raise SystemExit(f"Bulunamadı: {SRC}\nUygulamada ?export=oda ile indirip buraya koy.")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
log(f"İçe aktarıldı: {len(scene.objects)} obje")


def find(name):
    for o in scene.objects:
        if o.name == name or o.name.startswith(name + "."):
            return o
    return None


# light-only settings; nothing visible changes
for name in ("Gokyuzu", "Cam"):
    o = find(name)
    if o:
        o.visible_shadow = False          # let the sun through the window
        log(f"{name}: gölge vermiyor")
live = [o for o in scene.objects if o.get("defter") == "canli" or o.name.split(".")[0] in ("Gokyuzu", "Ampul")]
for o in live:
    o["defter"] = "canli"                 # stays live in the app: not baked, no lightmap
log("Canlı (bake dışı): " + ", ".join(o.name for o in live))


def material_input(obj, name):
    """Input socket of the first Principled BSDF / Emission node of the object's material."""
    if not obj or not obj.material_slots:
        return None
    mat = obj.material_slots[0].material
    if not mat or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if name in node.inputs:
            return node.inputs[name]
    return None


# ---------------------------------------------------------------- lights
def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


day = collection("Isik_Gunduz")
night = collection("Isik_Aksam")

sun_data = bpy.data.lights.new("Gunes", "SUN")
sun_data.energy = SUN_STRENGTH
sun_data.color = SUN_COLOR
sun_data.angle = math.radians(1.5)       # slightly soft shadows, like the app
sun = bpy.data.objects.new("Gunes", sun_data)
day.objects.link(sun)
sun.location = b(7.2, 0, 2.8) - b(*SUN_DIR) * 16
aim(sun, b(7.2, 0, 2.8))

spot_data = bpy.data.lights.new("Lamba", "SPOT")
spot_data.energy = LAMP_POWER
spot_data.color = LAMP_COLOR
spot_data.spot_size = 2 * 0.95           # three.js angle is the half angle
spot_data.spot_blend = 0.65              # penumbra
spot_data.shadow_soft_size = 0.04        # bulb radius
spot = bpy.data.objects.new("Lamba", spot_data)
night.objects.link(spot)
spot.location = b(*LAMP_HEAD)
aim(spot, b(*LAMP_TARGET))

moon_data = bpy.data.lights.new("Ay", "SUN")
moon_data.energy = MOON_STRENGTH
moon_data.color = MOON_COLOR
moon_data.angle = math.radians(1.5)
moon = bpy.data.objects.new("Ay", moon_data)
night.objects.link(moon)
moon.location = sun.location.copy()
aim(moon, b(7.2, 0, 2.8))

glow_data = bpy.data.lights.new("LambaParlama", "POINT")
glow_data.energy = GLOW_POWER
glow_data.color = GLOW_COLOR
glow_data.shadow_soft_size = 0.05
glow = bpy.data.objects.new("LambaParlama", glow_data)
night.objects.link(glow)
glow.location = b(LAMP_HEAD[0] + 0.1, LAMP_HEAD[1] + 0.05, LAMP_HEAD[2])


def world(name, color, strength):
    w = bpy.data.worlds.new(name)
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*color, 1.0)
    bg.inputs["Strength"].default_value = strength
    return w


world_day = world("Dunya_Gunduz", *SKY_DAY)
world_night = world("Dunya_Aksam", *SKY_NIGHT)
log("Işıklar kuruldu: Isik_Gunduz (güneş + gökyüzü), Isik_Aksam (lamba + parlama + ay + gece göğü)")

# ---------------------------------------------------------------- camera
vf = math.radians(FOV_Y)
aspect = RES_X / RES_Y
hf = 2 * math.atan(math.tan(vf / 2) * aspect)
use_v = (RES_Y - 130) / RES_Y
dist = max(5.6 / math.tan(vf * use_v / 2), 6.5 / math.tan(hf / 2))
cam_pos = Vector(CAM_TARGET) + CAM_DIR * dist

cam_data = bpy.data.cameras.new("OdaKamerasi")
cam_data.sensor_fit = "VERTICAL"         # three.js fov is vertical
cam_data.angle_y = vf
cam_data.clip_start, cam_data.clip_end = 0.1, 200
cam = bpy.data.objects.new("OdaKamerasi", cam_data)
scene.collection.objects.link(cam)
cam.location = b(*cam_pos)
aim(cam, b(*CAM_TARGET))
scene.camera = cam
log(f"Kamera: uzaklık {dist:.2f} m, dikey açı {FOV_Y}°")

# ---------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
gpus = [d for d in prefs.devices if d.type == "OPTIX"]
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scene.cycles.device = "GPU"
log("Cihaz: " + (", ".join(d.name for d in gpus) or "OptiX bulunamadı, CPU"))
scene.cycles.samples = 256
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = "OPTIX"
except TypeError:
    pass
scene.render.resolution_x, scene.render.resolution_y = RES_X, RES_Y
scene.render.resolution_percentage = 100
scene.render.film_transparent = True     # the app draws its own background
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

# Closest to the app's three.js ACES (compared with ACES 2.0, AgX, Khronos PBR Neutral, Standard).
scene.view_settings.view_transform = VIEW_TRANSFORM
scene.view_settings.look = "None"
scene.view_settings.exposure = EXPOSURE
log(f"Renk dönüşümü: {scene.view_settings.view_transform}")

bulb_emission = material_input(find("Ampul"), "Emission Strength")
sky_strength = material_input(find("Gokyuzu"), "Strength") or material_input(find("Gokyuzu"), "Emission Strength")


def set_state(evening):
    day.hide_render = evening
    night.hide_render = not evening
    scene.world = world_night if evening else world_day
    if bulb_emission:
        bulb_emission.default_value = BULB_EMISSION if evening else 0.0
    if sky_strength:
        sky_strength.default_value = 0.08 if evening else 1.0   # preview only; the app keeps its own sky


bpy.ops.wm.save_as_mainfile(filepath=BLEND)
log(f"Kaydedildi: {BLEND}")

for name, evening in (("gunduz", False), ("aksam", True)):
    set_state(evening)
    scene.render.filepath = os.path.join(OUT, f"onizleme-{name}.png")
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"Önizleme: onizleme-{name}.png ({time.time() - t:.0f} sn)")

set_state(False)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
log("Bitti.")
