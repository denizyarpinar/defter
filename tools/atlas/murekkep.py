"""Fotoğraftan mürekkep maskesi.

Kâğıt arka planı kanal başına kestirilir (median → maximum → uniform), görüntü
arka plana bölünür: oran 1 = kâğıt, 0 = tam koyu. Mürekkep = yeşil oranı düşük
pikseller (mavi/siyah/yeşil); kırmızı mürekkep için ayrı kural. Kareli kâğıdın
açık çizgileri eşiğin üstünde kalır; ince artıklar 3×3 açmayla, açmadan sağ çıkan
koyu kare çizgisi parçaları kalınlık kuralıyla (ince_min) silinir.
"""
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi


@dataclass
class Esikler:
    # arka plan filtreleri (px)
    median: int = 9
    maks: int = 61
    ort: int = 61
    # mavi/siyah/yeşil mürekkep: yeşil oran bunun altında
    yesil_esik: float = 0.68
    # kırmızı mürekkep: kırmızı oran yüksek, yeşil oran düşük
    kirmizi_min: float = 0.72
    kirmizi_yesil_max: float = 0.80
    kirmizi_fark: float = 0.15  # kırmızı oran − yeşil oran en az
    acma: int = 3
    # açmadan sonra en kalın yeri bundan ince olan parça (px, mesafe dönüşümü) kare çizgisi artığıdır
    ince_min: float = 2.5

    def sozluk(self) -> dict:
        return asdict(self)


def foto_oku(yol: Path) -> np.ndarray:
    """EXIF yönü uygulanmış RGB (uint8)."""
    with Image.open(yol) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        return np.asarray(im)


def arka_plan(src: np.ndarray, e: Esikler = Esikler()) -> np.ndarray:
    """Kanal başına kâğıt arka planı (float32, src ile aynı boyut)."""
    kanallar = []
    for k in range(3):
        c = ndi.median_filter(src[..., k], size=e.median)
        c = ndi.maximum_filter(c, size=e.maks)
        c = ndi.uniform_filter(c.astype(np.float32), size=e.ort)
        kanallar.append(c)
    return np.stack(kanallar, -1)


def oran(src: np.ndarray, e: Esikler = Esikler()) -> np.ndarray:
    """Görüntü / arka plan, 0–1 (float32)."""
    bg = arka_plan(src, e)
    return np.clip(src.astype(np.float32) / np.maximum(bg, 1.0), 0.0, 1.0)


def maske(r: np.ndarray, e: Esikler = Esikler()) -> np.ndarray:
    """Mürekkep maskesi (bool). r = oran(...)."""
    R, G = r[..., 0], r[..., 1]
    koyu = G < e.yesil_esik
    kirmizi = (R > e.kirmizi_min) & (G < e.kirmizi_yesil_max) & (R - G > e.kirmizi_fark)
    m = koyu | kirmizi
    if e.acma > 1:
        m = ndi.binary_opening(m, structure=np.ones((e.acma, e.acma), bool))
    if e.ince_min > 0:
        lab, n = ndi.label(m, structure=np.ones((3, 3), bool))
        if n:
            kalin = ndi.maximum(ndi.distance_transform_edt(m), lab, np.arange(1, n + 1))
            tut = np.concatenate([[False], np.asarray(kalin) >= e.ince_min])
            m = tut[lab]
    return m
