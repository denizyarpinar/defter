"""Kontrol görüntüleri: maske önizlemesi ve satır kesitleri."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RENKLER = {
    "mavi": (30, 70, 200),
    "kirmizi": (210, 30, 30),
    "yesil": (20, 140, 50),
    "siyah": (20, 20, 20),
    "kalem": (150, 150, 150),
}
ATILAN = (235, 190, 120)  # sayılmayan bileşen (önizlemede)


def _font(boy: int):
    for ad in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(ad, boy)
        except OSError:
            pass
    return ImageFont.load_default(size=boy)


def _boya(lab: np.ndarray, liste: list[dict], kutu=None) -> np.ndarray:
    """Etiket görüntüsünden renkli maske (beyaz zemin)."""
    if kutu is not None:
        x0, y0, x1, y1 = kutu
        lab = lab[y0:y1, x0:x1]
    tablo = np.full((int(lab.max()) + 1, 3), 255, np.uint8)
    for b in liste:
        if b["_etiket"] < len(tablo):
            tablo[b["_etiket"]] = RENKLER[b["renk"]] if b["sayilir"] else ATILAN
    return tablo[lab]


def maske_onizleme(yol: Path, lab: np.ndarray, liste: list[dict], uzun: int = 1600) -> None:
    im = Image.fromarray(_boya(lab, liste))
    im.thumbnail((uzun, uzun), Image.Resampling.LANCZOS)
    im.save(yol)


def satir_kesiti(yol: Path, foto: str, src: np.ndarray, lab: np.ndarray,
                 uyeler: list[dict], xh: float) -> None:
    """Üstte orijinal, altta renkli maske, aralarda bileşen numaraları."""
    H, W = lab.shape
    pay = int(max(8, 0.4 * xh))
    kk = np.array([b["kutu"] for b in uyeler])
    x0 = max(0, kk[:, 0].min() - pay); y0 = max(0, kk[:, 1].min() - pay)
    x1 = min(W, kk[:, 2].max() + pay); y1 = min(H, kk[:, 3].max() + pay)
    kutu = (x0, y0, x1, y1)
    ust = src[y0:y1, x0:x1]
    alt = _boya(lab, uyeler, kutu)
    # bu satırda olmayan bileşenleri sil
    uye_et = {b["_etiket"] for b in uyeler}
    alt[~np.isin(lab[y0:y1, x0:x1], list(uye_et))] = 255

    fboy = int(np.clip(0.45 * xh, 14, 40))
    font = _font(fboy)
    satir_h = fboy + 6
    w = x1 - x0
    # numaraları çakışmayacak şekilde serit satırlarına yerleştir
    serit: list[list[tuple[int, int]]] = []
    yer = []
    for b in sorted(uyeler, key=lambda b: b["kutu"][0]):
        metin = str(b["no"])
        tw = int(font.getlength(metin)) + 6
        cx = (b["kutu"][0] + b["kutu"][2]) // 2 - x0
        a0 = int(np.clip(cx - tw // 2, 0, max(0, w - tw)))
        for si, s in enumerate(serit):
            if all(a0 + tw <= p0 or a0 >= p1 for p0, p1 in s):
                s.append((a0, a0 + tw)); yer.append((b, si, a0, cx)); break
        else:
            serit.append([(a0, a0 + tw)]); yer.append((b, len(serit) - 1, a0, cx))
    serit_h = max(1, len(serit)) * satir_h + 6

    h = y1 - y0
    tuval = Image.new("RGB", (w, 2 * h + serit_h + 4), (255, 255, 255))
    tuval.paste(Image.fromarray(ust), (0, 0))
    alt_y = h + serit_h + 4
    tuval.paste(Image.fromarray(alt), (0, alt_y))
    c = ImageDraw.Draw(tuval)
    c.line([(0, h + 1), (w, h + 1)], fill=(200, 200, 200), width=2)
    for b, si, a0, cx in yer:
        ty = h + 4 + si * satir_h
        renk = RENKLER[b["renk"]]
        c.text((a0 + 3, ty), str(b["no"]), fill=renk, font=font)
        c.line([(cx, ty + fboy + 2), (cx, alt_y + b["kutu"][1] - y0)], fill=(*renk, ), width=1)
    tuval.save(yol)
