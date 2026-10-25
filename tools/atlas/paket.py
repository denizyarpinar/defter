"""Tarayıcı paketi (6.4d-3): 3-atlas → 4-paket (el-yazisi-atlas.png + el-yazisi-atlas.json).

- PNG: tek gri kanal (8 bit) yoğunluk sayfası. Örnekler yüksekliğe göre raflara dizilir, aralarında
  ve kenarda BOSLUK px, genişlik ≤ MAX_GENISLIK.
- Kodlama: olcek = 255 / max(D). "dogrusal": piksel = round(D·olcek), D = piksel / olcek.
  "karekok": piksel = round(sqrt(D·olcek / 255)·255), D = (piksel/255)²·255 / olcek (koyu olmayan
  yoğunluklarda daha ince adım). Önce doğrusal denenir; basım farkı ESIK'i geçerse karekök.
  ESIK stil başına (Deniz kararı 6.4d-3): tükenmezde eşik bölgesi dar, 8 bitle 2/255'in altına
  inilemedi (karekök 5, üs 3–4 de 5); yumuşakta 2.
- JSON: basım için gerekenler. Kaynak foto adları, bileşen numaraları (ids), puan, haric, aday,
  koyuluk tablosu pakete GİRMEZ (yalnız repo dışı 3-atlas'ta kalır).
- `aralik` glif kutuları arasıdır (pay zaten çıkarılmış), 6.4e pay bilmez.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

import basici

TUR = "defter-el-yazisi"
SURUM = 1
BOSLUK = 4
MAX_GENISLIK = 2048
ESIK = {"tukenmez": 5, "yumusak": 2}   # en büyük basım farkı (/255), stil başına
PNG_ADI = "el-yazisi-atlas.png"
JSON_ADI = "el-yazisi-atlas.json"
KODLAMALAR = ("dogrusal", "karekok")
# doğrulama satırları (atlasta olmayan karakter boşluk olur, iki tarafta da aynı)
DENEME = ("Defter: çalışma özeti, ğüşİ ÇÖŞÜ ı.",
          "Graphen und Bäume (2+3=5) – Aussagenlogik!",
          "abcdefghijklmnoprstuvwxyz 0123456789")
DENEME_RENKLER = ("mavi", "kirmizi", "yesil", "siyah", "kursun")


def yerlestir(boyutlar: list[tuple[int, int]], bosluk: int = BOSLUK,
              max_gen: int = MAX_GENISLIK) -> tuple[list[tuple[int, int]], int, int]:
    """Raf yerleşimi. boyutlar [(w, h)] → konumlar [(x, y)] (aynı sırada), sayfa genişliği, yüksekliği."""
    sira = sorted(range(len(boyutlar)), key=lambda i: (-boyutlar[i][1], -boyutlar[i][0], i))
    konum: list[tuple[int, int]] = [(0, 0)] * len(boyutlar)
    x, y, raf_h, gen = bosluk, bosluk, 0, 0
    for i in sira:
        w, h = boyutlar[i]
        if w + 2 * bosluk > max_gen:
            raise ValueError(f"örnek sayfaya sığmıyor: {w} px")
        if x + w + bosluk > max_gen:
            x, y, raf_h = bosluk, y + raf_h + bosluk, 0
        konum[i] = (x, y)
        x += w + bosluk
        raf_h = max(raf_h, h)
        gen = max(gen, x)
    return konum, max(gen, 1), y + raf_h + bosluk


def kodla(D: np.ndarray, olcek: float, kodlama: str) -> np.ndarray:
    v = np.clip(D.astype(np.float64) * olcek, 0.0, 255.0)
    if kodlama == "karekok":
        v = np.sqrt(v / 255.0) * 255.0
    elif kodlama != "dogrusal":
        raise ValueError(f"bilinmeyen kodlama: {kodlama}")
    return np.round(v).astype(np.uint8)


def coz(px: np.ndarray, olcek: float, kodlama: str) -> np.ndarray:
    v = px.astype(np.float32)
    if kodlama == "karekok":
        v = (v / 255.0) ** 2 * 255.0
    elif kodlama != "dogrusal":
        raise ValueError(f"bilinmeyen kodlama: {kodlama}")
    return (v / olcek).astype(np.float32)


def paket_kur(atlas: dict, kodlama: str = "dogrusal") -> tuple[np.ndarray, dict]:
    """atlas (atlas_kur.atlas_yukle) → (gri sayfa uint8, paket json)."""
    ornekler = [(k, o) for k, oo in atlas["karakterler"].items() for o in oo]
    maks = max(float(o["D"].max()) for _, o in ornekler)
    olcek = 255.0 / maks
    konum, W, H = yerlestir([(o["D"].shape[1], o["D"].shape[0]) for _, o in ornekler])
    sayfa = np.zeros((H, W), np.uint8)
    karakterler: dict = {}
    for (k, o), (x, y) in zip(ornekler, konum):
        h, w = o["D"].shape
        sayfa[y:y + h, x:x + w] = kodla(o["D"], olcek, kodlama)
        kayit = {"x": x, "y": y, "w": w, "h": h, "taban": round(float(o["taban"]), 2)}
        if o.get("turetilmis"):
            kayit["turetilmis"] = True
        karakterler.setdefault(k, []).append(kayit)
    harf, kelime = basici.araliklar(atlas)
    j = {
        "tur": TUR, "surum": SURUM, "xh": atlas["xh"], "kodlama": kodlama, "olcek": round(olcek, 6),
        "sayfa": {"w": W, "h": H},
        "aralik": {"harf": round(harf, 4), "kelime": round(kelime, 4)},
        "stiller": atlas.get("stiller") or basici.stiller_varsayilan(atlas["renkler"]),
        "renkler": {ad: {"p": list(r["p"]), "yogunluk": r["yogunluk"]} for ad, r in atlas["renkler"].items()},
        "karakterler": karakterler,
        "eksikler": list(atlas.get("eksikler", [])),
    }
    return sayfa, j


def paket_atlas(sayfa: np.ndarray, j: dict) -> dict:
    """Paket → basici'nin beklediği atlas sözlüğü (aralık glif kutuları arası, pay 0)."""
    kar = {k: [{"D": coz(sayfa[o["y"]:o["y"] + o["h"], o["x"]:o["x"] + o["w"]], j["olcek"], j["kodlama"]),
                "taban": o["taban"]} for o in oo]
           for k, oo in j["karakterler"].items()}
    return {"xh": j["xh"], "renkler": j["renkler"], "stiller": j["stiller"],
            "aralik": {"harf": j["aralik"]["harf"], "kelime": j["aralik"]["kelime"], "pay": 0.0},
            "karakterler": kar}


def paket_yukle(klasor: Path) -> dict:
    sayfa = np.asarray(Image.open(klasor / PNG_ADI))
    j = json.loads((klasor / JSON_ADI).read_text(encoding="utf-8"))
    return paket_atlas(sayfa, j)


def bas_farki(atlas: dict, paket: dict) -> dict:
    """Aynı satırlar iki atlasla basılır; stil başına en büyük piksel farkı."""
    fark = {}
    for stil in basici.STILLER:
        en = 0
        for renk in DENEME_RENKLER:
            if renk not in atlas["renkler"]:
                continue
            for metin in DENEME:
                a, _ = basici.bas(metin, renk, atlas, stil=stil)
                b, _ = basici.bas(metin, renk, paket, stil=stil)
                if a.shape != b.shape:
                    raise AssertionError(f"boyut farklı: {a.shape} / {b.shape} ({metin!r})")
                en = max(en, int(np.abs(a.astype(np.int16) - b.astype(np.int16)).max()))
        fark[stil] = en
    return fark


def kaydet(klasor: Path, sayfa: np.ndarray, j: dict) -> dict:
    klasor.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sayfa, mode="L").save(klasor / PNG_ADI, optimize=True)
    (klasor / JSON_ADI).write_text(json.dumps(j, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    boy = {"png": (klasor / PNG_ADI).stat().st_size, "json": (klasor / JSON_ADI).stat().st_size}
    boy["toplam"] = boy["png"] + boy["json"]
    return boy


def uret(atlas: dict, klasor: Path) -> dict:
    """Doğrusal, olmazsa karekök. İkisi de ESIK'i geçerse SystemExit (sayılarla), dosya yazılmaz."""
    denenen = {}
    for kodlama in KODLAMALAR:
        sayfa, j = paket_kur(atlas, kodlama)
        fark = bas_farki(atlas, paket_atlas(sayfa, j))
        denenen[kodlama] = fark
        if all(fark[st] <= ESIK[st] for st in fark):
            boy = kaydet(klasor, sayfa, j)
            denenen["diskten"] = bas_farki(atlas, paket_yukle(klasor))   # yazılan dosyalardan tekrar
            n = sum(len(oo) for oo in j["karakterler"].values())
            return {"kodlama": kodlama, "fark": denenen, "boyut": boy, "sayfa": j["sayfa"],
                    "ornek": n, "karakter": len(j["karakterler"])}
    raise SystemExit(f"Paket yazılmadı: basım farkı iki kodlamada da sınırı ({ESIK}, /255) geçti: "
                     + ", ".join(f"{k} {v}" for k, v in denenen.items()))
