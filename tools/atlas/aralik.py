"""Harf ve kelime arası: orijinal yazı satırlarından ölçülür (tahmin değil).

Her satırda sayılan bileşen kutuları x'e göre sıralanır; yatayda üst üste binenler
(i noktası, ü/ğ işareti, bitişik parça) tek kümeye katılır. Ardışık kümeler arasındaki
boşluk / foto x-yüksekliği. Bütün boşluklarda iki küme (Otsu eşiği): küçükler harf arası,
büyükler kelime arası; medyanları alınır. Ölçüm maske kutusuyla yapılır; basıcı, atlas
glifinin yumuşak kenar payını (`pay`, her yanda) çıkarır.
"""
import json
from pathlib import Path

import numpy as np

RENKLER = ("mavi", "siyah")   # asıl yazı; kırmızı/yeşil çoğu tek kelimelik not
EN_AZ = 4                     # satırda en az bu kadar küme
UST = 3.0                     # bunun üstündeki boşluk (xh) sütun/girinti sayılır, atılır


def satir_bosluklari(kutular, xh: float) -> list[float]:
    """Bir satırın kutuları → kümeler arası boşluklar (xh biriminde)."""
    kk = sorted((float(k[0]), float(k[2])) for k in kutular)
    kume = []
    for x0, x1 in kk:
        if kume and x0 < kume[-1][1]:
            kume[-1][1] = max(kume[-1][1], x1)
        else:
            kume.append([x0, x1])
    if len(kume) < EN_AZ:
        return []
    b = [(kume[i + 1][0] - kume[i][1]) / xh for i in range(len(kume) - 1)]
    return [v for v in b if v <= UST]


def otsu(v, kutu: int = 120) -> float:
    """1-B Otsu eşiği."""
    v = np.asarray(v, float)
    h, kenar = np.histogram(v, kutu, (v.min(), v.max()))
    orta = (kenar[:-1] + kenar[1:]) / 2
    w0 = np.cumsum(h); w1 = w0[-1] - w0
    m0 = np.cumsum(h * orta)
    mu0 = m0 / np.maximum(w0, 1); mu1 = (m0[-1] - m0) / np.maximum(w1, 1)
    ara = w0 * w1 * (mu0 - mu1) ** 2
    return float(kenar[1:][np.argmax(ara)])


def olc(bosluklar) -> dict:
    v = np.asarray(bosluklar, float)
    e = otsu(v)
    harf, kelime = v[v <= e], v[v > e]
    return {"harf": round(float(np.median(harf)), 3), "kelime": round(float(np.median(kelime)), 3),
            "esik": round(e, 3), "n_harf": int(len(harf)), "n_kelime": int(len(kelime))}


def kesitlerden(kesit_dir: Path) -> dict:
    """1-kesit\\*-bilesenler.json → aralık ölçümü (+ satır sayısı)."""
    tum, n_satir = [], 0
    for p in sorted(kesit_dir.glob("*-bilesenler.json")):
        j = json.loads(p.read_text(encoding="utf-8"))
        satir: dict = {}
        for b in j["bilesenler"]:
            if b["sayilir"] and b["satir"] is not None and b["renk"] in RENKLER:
                satir.setdefault(b["satir"], []).append(b["kutu"])
        for kutular in satir.values():
            b = satir_bosluklari(kutular, j["kucuk_harf_px"])
            if b:
                tum += b
                n_satir += 1
    return dict(olc(tum), n_satir=n_satir)
