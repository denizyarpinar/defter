"""6.4e eşdeğerlik referansı: 4-paket'ten okunan atlasla (3-atlas değil) satırlar basılır.

Tarayıcıdaki basıcı (src/elYazisi/basici.ts) aynı satırları aynı formülle basar;
scripts/temiz-yazi-esdeger.test.ts ikisini piksel piksel karşılaştırır.
- Oynama kapalı, yumuşakta kâğıt gürültüsü 0 (TS'te gürültü yok).
- 2 stil × 5 renk × 2 satır → <stil>-<renk>-<n>.png + referans.json (metin, renk, stil, w, h, eksik).
- d-ornek.json: paketteki ilk 3 örneğin çözülmüş D değerleri (tarayıcıdaki PNG çözme kontrolü için).
Çıktı repo dışında olmalı (yollar.cikti_kontrol).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

import basici
import paket

SATIRLAR = ("Kuvvet ağırlık öğrenci Şekil üç İçerik", "Beispiele für Kräfte:")
RENKLER = ("mavi", "kirmizi", "yesil", "siyah", "kursun")
D_ORNEK = 3


def ilk_ornekler(j: dict, sayfa: np.ndarray, n: int = D_ORNEK) -> list[dict]:
    """JSON sırasıyla ilk n örnek ve çözülmüş D'leri (float32 değerleri aynen)."""
    out = []
    for k, oo in j["karakterler"].items():
        for i, o in enumerate(oo):
            if len(out) >= n:
                return out
            D = paket.coz(sayfa[o["y"]:o["y"] + o["h"], o["x"]:o["x"] + o["w"]], j["olcek"], j["kodlama"])
            out.append({"karakter": k, "sira": i, "w": o["w"], "h": o["h"],
                        "D": [float(v) for v in D.ravel()]})
    return out


def uret(paket_dir: Path, hedef: Path) -> dict:
    sayfa = np.asarray(Image.open(paket_dir / paket.PNG_ADI))
    j = json.loads((paket_dir / paket.JSON_ADI).read_text(encoding="utf-8"))
    atlas = paket.paket_atlas(sayfa, j)
    hedef.mkdir(parents=True, exist_ok=True)
    kayit = []
    for stil in basici.STILLER:
        for renk in RENKLER:
            for n, metin in enumerate(SATIRLAR, 1):
                im, eksik = basici.bas(metin, renk, atlas, stil=stil, gurultu=0.0, oynama=False)
                ad = f"{stil}-{renk}-{n}.png"
                Image.fromarray(im, mode="RGB").save(hedef / ad)
                kayit.append({"dosya": ad, "metin": metin, "renk": renk, "stil": stil,
                              "w": int(im.shape[1]), "h": int(im.shape[0]), "eksik": eksik})
    (hedef / "referans.json").write_text(json.dumps({"satirlar": kayit}, ensure_ascii=False, indent=1),
                                         encoding="utf-8")
    (hedef / "d-ornek.json").write_text(json.dumps({"ornekler": ilk_ornekler(j, sayfa)}), encoding="utf-8")
    return {"satir": len(kayit), "hedef": str(hedef)}
