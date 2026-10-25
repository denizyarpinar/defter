"""Karakter başına en iyi 2–4 örneğin seçimi.

Ölçek: her örnek kendi fotosunun x-yüksekliğine (kucuk_harf_px) göre normalize
edilir. Puan (küçük = iyi): yükseklik ve genişliğin o karakterin medyanına
uzaklığı, tabanlı harfte alt kenarın taban çizgisinden sapması. Elenenler:
leke kalınlığı (delgi artığı), soluk iz (maskenin azı mürekkep), medyanın yarısından
küçük alan (kesik harf),
elle çıkarılanlar (`haric`), medyanın 1.6 katından geniş/yüksek kutu (kare çizgisi artığı ya da komşu parça).
"""
import numpy as np

from taban import TABANLI

# alt kenarı tabanda olması beklenenler (puanda taban sapması sayılır)
TABAN_KONTROL = TABANLI | set(".:!?")

EN_COK = 4
EN_AZ = 2
LEKE_KAT = 0.3      # kalınlık > xh × kat = leke
BUYUK_KAT = 1.6
KUCUK_ALAN = 0.5
SOLUK = 0.6         # doluluk bunun altı = soluk
PUAN_SINIR = 0.6    # 2'den sonraki örnekler ancak bu puanın altındaysa alınır


def _boyut(o: dict) -> tuple[float, float, float]:
    x0, y0, x1, y1 = o["kutu"]
    return (y1 - y0) / o["xh"], (x1 - x0) / o["xh"], o["alan"] / o["xh"] ** 2


def puanla(ornekler: list[dict]) -> list[dict]:
    """Aynı karakterin örneklerine `puan` ve `elendi` (neden ya da None) yazar, puana göre sıralar."""
    if not ornekler:
        return []
    b = np.array([_boyut(o) for o in ornekler])
    mh, mw, ma = np.median(b, 0)
    for o, (h, w, a) in zip(ornekler, b):
        x0, y0, x1, y1 = o["kutu"]
        alt = abs((y1 - y0) - o["taban"]) / o["xh"] if o["karakter"] in TABAN_KONTROL else 0.0
        o["puan"] = round(float(abs(h - mh) / mh + 0.5 * abs(w - mw) / mw + 2.0 * alt), 3)
        if o.get("haric"):
            o["elendi"] = "haric"            # elle çıkarıldı (etiket-kaynak.txt'te `~neden`)
        elif o.get("kalin", 0) > LEKE_KAT * o["xh"]:
            o["elendi"] = "leke"
        elif o.get("dolu", 1.0) < SOLUK:
            o["elendi"] = "soluk"
        elif len(ornekler) >= 3 and a < KUCUK_ALAN * ma:
            o["elendi"] = "kesik"
        elif len(ornekler) >= 3 and (h > BUYUK_KAT * mh or w > BUYUK_KAT * mw):
            o["elendi"] = "artik"
        else:
            o["elendi"] = None
    return sorted(ornekler, key=lambda o: (o["elendi"] is not None, o["puan"]))


def sec(ornekler: list[dict]) -> list[dict]:
    """Puanlanmış listeden seçilenler (`secildi` = True da yazılır)."""
    sirali = puanla(ornekler)
    secilen = []
    for o in sirali:
        o["secildi"] = False
        if o["elendi"] or len(secilen) >= EN_COK:
            continue
        if len(secilen) >= EN_AZ and o["puan"] > PUAN_SINIR:
            continue
        secilen.append(o)
    for o in secilen:
        o["secildi"] = True
    return secilen
