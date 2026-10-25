"""Harf görüntüsü: maske değil, yumuşak kenarlı gerçek mürekkep yoğunluğu.

Soğurma A_c = −log(oran_c). Yoğunluk D = A'nın örneğin kendi renk profiline izdüşümü,
eksi kâğıt/kare çizgisi tabanı (d0), çarpı yumuşak maske (bileşen maskesi 3 px
genişletilmiş, 1.5 px Gauss). Maskenin dışında, kâğıtta ve kare çizgisinde D = 0.
Böylece kırmızı bir "ğ" mavi basılabilir: renk basarken profille geri verilir.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

GENIS = 3        # px, bileşen maskesi genişletme
YUMUSAK = 1.5    # px, Gauss
PAY = 12         # px, kesit payı (genişletme + Gauss kuyruğu sığsın)
EPS = 1e-3

# basılabilir renkler; siyah ve kurşun gerçek örnekten değil, türetilmiş
NOTR = np.ones(3) / np.sqrt(3)


def sogurma(oran: np.ndarray) -> np.ndarray:
    return -np.log(np.maximum(oran.astype(np.float32), EPS))


def yumusak_maske(m: np.ndarray, genis: int = GENIS, yumusak: float = YUMUSAK) -> np.ndarray:
    g = ndi.binary_dilation(m, iterations=genis) if genis > 0 else m
    w = ndi.gaussian_filter(g.astype(np.float32), yumusak)
    w[w < 0.02] = 0.0
    return np.clip(w, 0.0, 1.0)


def profil_olc(oran_parcalar, maske_parcalar) -> np.ndarray:
    """Çekirdek piksellerden (1 px aşındırılmış maske) ortalama soğurma, birim vektör."""
    top = np.zeros(3); n = 0
    for r, m in zip(oran_parcalar, maske_parcalar):
        cek = ndi.binary_erosion(m, iterations=1)
        if cek.sum() == 0:
            cek = m
        A = sogurma(r)[cek]
        top += A.sum(0); n += len(A)
    v = top / max(n, 1)
    return v / max(np.linalg.norm(v), EPS)


def yogunluk(oran: np.ndarray, m: np.ndarray, profil: np.ndarray, diger: np.ndarray | None = None,
             genis: int = GENIS, yumusak: float = YUMUSAK) -> np.ndarray:
    """Tek kanal yoğunluk (float32). oran: kesit (H, W, 3), m: kendi bileşen(ler)inin maskesi,
    diger: kesitteki başka mürekkep (komşu harf; halkadan çıkarılır)."""
    p = np.asarray(profil, np.float32)
    p = p / max(float(np.linalg.norm(p)), EPS)
    iz = sogurma(oran) @ p
    w = yumusak_maske(m, genis, yumusak)
    # d0: maskenin hemen dışındaki halkada kâğıt + kare çizgisi soğurmasının üst ucu
    halka = ndi.binary_dilation(m, iterations=genis + 6) & (w == 0)
    if diger is not None:
        halka &= ~ndi.binary_dilation(diger, iterations=2)
    d0 = float(np.percentile(iz[halka], 99)) if halka.sum() > 20 else 0.0
    D = np.maximum(iz - max(d0, 0.0), 0.0) * w
    if diger is not None:
        # komşu harfin mürekkebi yumuşak kenara sızmasın
        D[ndi.binary_dilation(diger, iterations=1) & ~ndi.binary_dilation(m, iterations=1)] = 0.0
    return D.astype(np.float32)


def olcekle(D: np.ndarray, olcek: float) -> np.ndarray:
    """Yoğunluğu ölçekle (float, bilineer + alan ortalaması); negatif olmaz."""
    if abs(olcek - 1.0) < 1e-3:
        return D.copy()
    h, w = D.shape
    yeni = (max(1, round(w * olcek)), max(1, round(h * olcek)))
    im = Image.fromarray(D.astype(np.float32), mode="F")
    yontem = Image.Resampling.BOX if olcek < 1 else Image.Resampling.BILINEAR
    return np.maximum(np.asarray(im.resize(yeni, yontem), np.float32), 0.0)


def kirp(D: np.ndarray, taban: float) -> tuple[np.ndarray, float]:
    """Sıfır kenarları kırp; taban yeni kutuya göre."""
    ys, xs = np.nonzero(D > 0)
    if len(ys) == 0:
        return D, taban
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return D[y0:y1, x0:x1].copy(), taban - y0


def kaydet(yol: Path, D: np.ndarray) -> None:
    np.save(yol, D.astype(np.float16))


def yukle(yol: Path) -> np.ndarray:
    return np.load(yol).astype(np.float32)
