"""Defter – Faz 2.5: smaller room files for touch devices (iPad, phone).

Makes from the files bake.py wrote (nothing is baked again):
  1. lightmap_gunduz_1024.png, lightmap_aksam_1024.png: the lightmaps at half size. Each 2×2 block is
     averaged in linear light (the PNGs store sRGB-encoded light), so the scale factors stay valid.
  2. oda-mobil.glb: oda.glb with textures at most 1024 px (gltf-transform, same flags as bake.py).
  3. A "mobil" block in lightmap.json; the app loads these files when the main pointer is coarse.

Run after every bake.py (bake.py rewrites lightmap.json without the "mobil" block):
  "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P blender/mobil.py
"""
import json
import os
import subprocess
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, "public", "models")
SIZE = 1024


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def half_size(src_name, dst_name):
    src = bpy.data.images.load(os.path.join(MODELS, src_name))
    src.colorspace_settings.name = "Non-Color"   # raw values, no colour conversion on read
    w, h = src.size
    if w != 2 * SIZE or h != 2 * SIZE:
        raise RuntimeError(f"{src_name}: {w}×{h}, {2 * SIZE}×{2 * SIZE} bekleniyordu")
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = to_linear(px[:, :, :3]).reshape(SIZE, 2, SIZE, 2, 3).mean(axis=(1, 3))
    out = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    out[:, :, :3] = np.clip(to_srgb(rgb), 0, 1)

    dst = bpy.data.images.new(dst_name, SIZE, SIZE, alpha=False)
    dst.colorspace_settings.name = "Non-Color"   # written as is: the values are already sRGB-encoded
    dst.pixels.foreach_set(out.ravel())
    dst.filepath_raw = os.path.join(MODELS, dst_name)
    dst.file_format = "PNG"
    dst.save()
    print(f"Kaydedildi: public/models/{dst_name}")


def main():
    json_path = os.path.join(MODELS, "lightmap.json")
    with open(json_path, encoding="utf-8") as f:
        info = json.load(f)

    mobil = {"glb": "oda-mobil.glb"}
    for key in ("gunduz", "aksam"):
        name = info[key]
        mobil[key] = name.replace(".png", f"_{SIZE}.png")
        half_size(name, mobil[key])

    cmd = ("npx @gltf-transform/cli optimize public/models/oda.glb public/models/oda-mobil.glb"
           " --compress meshopt --texture-compress webp --texture-size 1024"
           " --join false --flatten false --simplify false --instance false --palette false"
           " --prune-attributes false")
    print(cmd)
    subprocess.run(cmd, shell=True, cwd=ROOT, check=True)

    info["mobil"] = mobil
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("Kaydedildi: public/models/lightmap.json")


try:
    main()
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)
