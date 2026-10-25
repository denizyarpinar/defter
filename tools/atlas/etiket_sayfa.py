r"""Etiketleme yardımı: satır başına bileşen küçük resimleri, x sırasıyla, numaralı.

`python tools/atlas/etiket_sayfa.py <cikis-klasoru> IMG_1570 [1,2,3]`
Çıkış klasörü repo dışında olmalı (repo içi yol → durur). Fotoğrafı sadece okur.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import murekkep
from yollar import CIKTI, GIRDI, cikti_kontrol

RENK = {"mavi": (30, 70, 200), "kirmizi": (210, 30, 30), "yesil": (20, 140, 50)}


def main(argv=None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    out = cikti_kontrol(Path(argv[0]), GIRDI)
    out.mkdir(parents=True, exist_ok=True)
    foto = argv[1]
    secili = [int(s) for s in argv[2].split(",")] if len(argv) > 2 else None
    j = json.loads((CIKTI / "1-kesit" / f"{foto}-bilesenler.json").read_text(encoding="utf-8"))
    s = 34 / j["kucuk_harf_px"]
    src = murekkep.foto_oku(next(p for p in GIRDI.iterdir() if p.stem == foto))
    font = ImageFont.truetype("arial.ttf", 12)
    fb = ImageFont.truetype("arial.ttf", 16)
    by: dict = {}
    for b in j["bilesenler"]:
        if b["sayilir"] and b["satir"]:
            by.setdefault(b["satir"], []).append(b)
    nos = sorted(by) if secili is None else secili
    rows = []
    for sn in nos:
        L = sorted(by[sn], key=lambda b: (b["kutu"][0] + b["kutu"][2]) / 2)
        ly0 = min(b["kutu"][1] for b in L)
        ly1 = max(b["kutu"][3] for b in L)
        H = int((ly1 - ly0) * s) + 6 + 16
        parts, x = [], 46
        for b in L:
            x0, y0, x1, y1 = b["kutu"]
            im = Image.fromarray(src[y0:y1, x0:x1]).resize((max(1, int((x1 - x0) * s)), max(1, int((y1 - y0) * s))))
            parts.append((x, int((y0 - ly0) * s) + 3, im, b))
            x += max(im.width, 22) + 8
        row = Image.new("RGB", (x + 10, H), (255, 255, 255))
        c = ImageDraw.Draw(row)
        c.text((2, 4), f"s{sn}", fill=(0, 0, 0), font=fb)
        for px, py, im, b in parts:
            row.paste(im, (px, py))
            c.text((px, H - 15), str(b["no"]), fill=RENK.get(b["renk"], (0, 0, 0)), font=font)
        rows.append(row)
    W = max(r.width for r in rows)
    t = Image.new("RGB", (W, sum(r.height + 4 for r in rows)), (235, 235, 235))
    y = 0
    for r in rows:
        t.paste(r, (0, y))
        y += r.height + 4
    ad = out / f"{foto}-{nos[0]:02d}-{nos[-1]:02d}.png"
    t.save(ad)
    print(ad, t.size)


if __name__ == "__main__":
    main()
