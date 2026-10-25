"""Onay görselleri: alfabe, karşılaştırmalar, koyuluk ölçümü, kapsama listesi.

Görseller tükenmez stilde (varsayılan); karsilastir-1'de yumuşak stil satırı da var.
Koyuluk: orijinal satır ile atlas satırının mürekkep yoğunluğu ortalaması (rengin profiline
izdüşen soğurma, mürekkep maskesi 1 px aşındırılmış). Yumuşak stilde fark %15'i aşarsa
o rengin `yogunluk`'u ölçeklenir (atlas.json'a yazılır). Tükenmez tonlarına dokunulmaz.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import basici
import glif
import murekkep
from atlas_kur import TUM
from kesit import _font

CUMLE_1 = "Beispiele für Kräfte:"
CUMLE_1_ID = "IMG_1570#63"          # "B"; satırı bu bileşenden bulunur
CUMLE_2 = "Kuvvet ağırlık öğrenci Şekil üç İçerik"
# karsilastir-3: en çok kırmızı bileşenli foto (IMG_1571), Türkçe kırmızı satır (s32)
CUMLE_3 = "tanımlı olan toplama (vektör uzayının aksiyomları)"
CUMLE_3_ID = "IMG_1571#641"         # "t"
# koyuluk kontrolü: rengin kendi orijinal satırı
KOYULUK_SATIR = {"mavi": (CUMLE_1_ID, CUMLE_1), "kirmizi": (CUMLE_3_ID, CUMLE_3),
                 "yesil": ("IMG_1569#", CUMLE_2)}   # yeşil: en çok yeşil bileşenli satır
FARK_SINIR = 0.15
BEYAZ = (255, 255, 255)
ORAN_PAY = 90                       # arka plan filtresi (61 px) için kesit payı


def _alt_alta(parcalar, aralik=10) -> Image.Image:
    """[(etiket, PIL görüntü)] alt alta, solda küçük etiket satırı."""
    font = _font(16)
    W = max(im.width for _, im in parcalar) + 20
    H = sum(im.height + 26 + aralik for _, im in parcalar) + 10
    t = Image.new("RGB", (W, H), BEYAZ)
    c = ImageDraw.Draw(t)
    y = 8
    for etiket, im in parcalar:
        c.text((10, y), etiket, fill=(90, 90, 90), font=font)
        t.paste(im, (10, y + 22))
        y += im.height + 26 + aralik
    return t


def alfabe(atlas: dict, yol: Path, sutun: int = 3) -> None:
    font = _font(22)
    hucreler = []
    for k in TUM:
        oo = atlas["karakterler"].get(k)
        if not oo:
            continue
        im, _ = basici.bas(" ".join(k * len(oo)), "mavi", atlas, tohum=7)
        etiket = k + ("  türetilmiş" if oo[0].get("turetilmis") else f"  {len(oo)}")
        hucreler.append((etiket, Image.fromarray(im)))
    hw = max(im.width for _, im in hucreler) + 140
    hh = max(im.height for _, im in hucreler)
    satir = -(-len(hucreler) // sutun)
    t = Image.new("RGB", (hw * sutun, hh * satir + 40), BEYAZ)
    c = ImageDraw.Draw(t)
    c.text((10, 8), "Atlas – seçilen örnekler (mavi, tükenmez). Sayı = örnek sayısı.", fill=(0, 0, 0), font=font)
    for i, (etiket, im) in enumerate(hucreler):
        x, y = (i // satir) * hw, (i % satir) * hh + 40
        c.text((x + 10, y + hh // 2 - 12), etiket, fill=(60, 60, 60), font=font)
        t.paste(im, (x + 130, y))
    t.save(yol)


def _bilesenler(kesit_dir: Path, foto: str) -> dict:
    return json.loads((kesit_dir / f"{foto}-bilesenler.json").read_text(encoding="utf-8"))


def renk_satiri(kesit_dir: Path, foto: str, renk: str) -> str:
    """Fotoda o renkten en çok sayılan bileşeni olan satırın ilk (en soldaki) bileşeni."""
    bb = [b for b in _bilesenler(kesit_dir, foto)["bilesenler"] if b["sayilir"] and b["renk"] == renk
          and b["satir"] is not None]
    sayi: dict = {}
    for b in bb:
        sayi[b["satir"]] = sayi.get(b["satir"], 0) + 1
    s = max(sayi, key=sayi.get)
    return min((b for b in bb if b["satir"] == s), key=lambda b: b["kutu"][0])["id"]


def satir_kesiti(girdi: Path, kesit_dir: Path, bilesen_id: str, renk: str | None = None) -> dict:
    """Bileşenin satırı: orijinal kesit, oran kesiti, id listesi, xh, satır no.
    renk verilirse sadece o renkteki bileşenler (başka renkteki komşu yazı kesiti büyütmesin)."""
    foto = bilesen_id.split("#")[0]
    j = _bilesenler(kesit_dir, foto)
    hedef = next(b for b in j["bilesenler"] if b["id"] == bilesen_id)
    uyeler = [b for b in j["bilesenler"] if b["satir"] == hedef["satir"] and b["sayilir"]
              and (renk is None or b["renk"] == renk)]
    kk = np.array([b["kutu"] for b in uyeler])
    xh = j["kucuk_harf_px"]
    pay = int(0.5 * xh)
    src = murekkep.foto_oku(next(p for p in girdi.iterdir() if p.stem == foto))
    H, W = src.shape[:2]
    x0, y0 = max(0, kk[:, 0].min() - pay), max(0, kk[:, 1].min() - pay)
    x1, y1 = min(W, kk[:, 2].max() + pay), min(H, kk[:, 3].max() + pay)
    X0, Y0 = max(0, x0 - ORAN_PAY), max(0, y0 - ORAN_PAY)
    X1, Y1 = min(W, x1 + ORAN_PAY), min(H, y1 + ORAN_PAY)
    r = murekkep.oran(src[Y0:Y1, X0:X1])[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0]
    # sadece satırın kendi bileşenleri ölçülsün: kutuları dışındaki mürekkep sayılmaz
    icinde = np.zeros(r.shape[:2], bool)
    for a0, b0, a1, b1 in kk:
        icinde[b0 - y0:b1 - y0, a0 - x0:a1 - x0] = True
    return {"goruntu": Image.fromarray(src[y0:y1, x0:x1]), "oran": r, "icinde": icinde,
            "ids": [b["id"] for b in uyeler], "xh": xh, "satir": hedef["satir"], "foto": foto}


def satir_kesiti_orijinal(girdi: Path, kesit_dir: Path, bilesen_id: str):
    """Eski arayüz: (PIL kesit, id listesi, xh, satır)."""
    s = satir_kesiti(girdi, kesit_dir, bilesen_id)
    return s["goruntu"], s["ids"], s["xh"], s["satir"]


def koyuluk(oran: np.ndarray, profil, alan: np.ndarray | None = None) -> float:
    """Mürekkep piksellerinde (maske, 1 px aşındırılmış) profile izdüşen soğurmanın ortalaması."""
    p = np.asarray(profil, np.float32)
    p = p / np.linalg.norm(p)
    m = ndi.binary_erosion(murekkep.maske(oran), iterations=1)
    if alan is not None:
        m &= alan
    if m.sum() == 0:
        return 0.0
    return float((glif.sogurma(oran) @ p)[m].mean())


def basili_koyuluk(im: np.ndarray, kagit, profil) -> float:
    return koyuluk(np.clip(im.astype(np.float32) / np.asarray(kagit, np.float32), 0, 1), profil)


def koyuluk_olc(atlas: dict, girdi: Path, kesit_dir: Path, esitle: bool = True) -> list[dict]:
    """Renk başına orijinal / tükenmez / yumuşak koyuluğu; yumuşakta fark > %15 ise yoğunluk
    ölçeklenir (atlas sözlüğünde; çağıran atlas.json'a yazar)."""
    kagit = atlas["stiller"]["kagit"]
    sonuc = []
    for renk, (bid, metin) in KOYULUK_SATIR.items():
        if bid.endswith("#"):
            bid = renk_satiri(kesit_dir, bid[:-1], renk)
        s = satir_kesiti(girdi, kesit_dir, bid, renk)
        r = atlas["renkler"][renk]
        org = koyuluk(s["oran"], r["p"], s["icinde"])

        def olc(stil):
            im, _ = basici.bas(metin, renk, atlas, xh=s["xh"], haric=s["ids"], tohum=3, stil=stil)
            return basili_koyuluk(im, kagit, r["p"])
        tuk, yum = olc("tukenmez"), olc("yumusak")
        k = {"renk": renk, "satir": f"{s['foto']} s{s['satir']}", "orijinal": round(org, 3),
             "tukenmez": round(tuk, 3), "yumusak_once": round(yum, 3), "yogunluk_once": r["yogunluk"]}
        if esitle and abs(yum / org - 1) > FARK_SINIR:
            for _ in range(4):                     # maske de değiştiği için birkaç adım
                r["yogunluk"] = round(r["yogunluk"] * org / yum, 3)
                yum = olc("yumusak")
                if abs(yum / org - 1) < 0.03:
                    break
            r["yogunluk_olcek"] = round(r["yogunluk"] / k["yogunluk_once"], 3)
        k.update(yumusak=round(yum, 3), yogunluk=r["yogunluk"])
        sonuc.append(k)
    return sonuc


def koyuluk_tablosu(sonuc: list[dict]) -> list[str]:
    def f(a, b):
        return f"{(a / b - 1) * 100:+.0f}%"
    out = ["Koyuluk (mürekkep pikselleri ortalama soğurma; orijinal = kendi satırı):",
           "  renk     satır          orijinal  tükenmez        yumuşak önce     yumuşak sonra    yoğunluk"]
    for k in sonuc:
        out.append(f"  {k['renk']:<8} {k['satir']:<14} {k['orijinal']:>7}  {k['tukenmez']:>6} {f(k['tukenmez'], k['orijinal']):>6}"
                   f"   {k['yumusak_once']:>6} {f(k['yumusak_once'], k['orijinal']):>6}"
                   f"   {k['yumusak']:>6} {f(k['yumusak'], k['orijinal']):>6}"
                   f"   {k['yogunluk_once']} → {k['yogunluk']}")
    return out


def karsilastir_1(atlas: dict, girdi: Path, kesit_dir: Path, yol: Path) -> list:
    s = satir_kesiti(girdi, kesit_dir, CUMLE_1_ID)
    tuk, eksik = basici.bas(CUMLE_1, "mavi", atlas, xh=s["xh"], haric=s["ids"], tohum=3, stil="tukenmez")
    yum, _ = basici.bas(CUMLE_1, "mavi", atlas, xh=s["xh"], haric=s["ids"], tohum=3, stil="yumusak")
    n = len(s["ids"])
    _alt_alta([(f"Orijinal: {s['foto']}, satır {s['satir']}", s["goruntu"]),
               (f"Atlas, tükenmez (bu satırın {n} bileşeni kullanılmadan)", Image.fromarray(tuk)),
               (f"Atlas, yumuşak (bu satırın {n} bileşeni kullanılmadan)", Image.fromarray(yum))]).save(yol)
    return eksik


def karsilastir_2(atlas: dict, yol: Path) -> list:
    parcalar, eksik = [], []
    for renk, ad in (("mavi", "mavi"), ("kirmizi", "kırmızı"), ("yesil", "yeşil")):
        im, e = basici.bas(CUMLE_2, renk, atlas, tohum=5)
        parcalar.append((ad + " (tükenmez)", Image.fromarray(im)))
        eksik += e
    _alt_alta(parcalar).save(yol)
    return sorted(set(eksik))


def karsilastir_3(atlas: dict, girdi: Path, kesit_dir: Path, yol: Path) -> list:
    s = satir_kesiti(girdi, kesit_dir, CUMLE_3_ID, "kirmizi")
    im, eksik = basici.bas(CUMLE_3, "kirmizi", atlas, xh=s["xh"], haric=s["ids"], tohum=3)
    _alt_alta([(f"Orijinal: {s['foto']}, satır {s['satir']} (kırmızı)", s["goruntu"]),
               (f"Atlas, kırmızı tükenmez (bu satırın {len(s['ids'])} bileşeni kullanılmadan)",
                Image.fromarray(im))]).save(yol)
    return eksik


def kapsama(atlas: dict, yol: Path, notlar: list[str]) -> str:
    satirlar = ["Atlas kapsaması (6.4d-2b)", f"x-yüksekliği: {atlas['xh']} px", "",
                "karakter  aday  seçilen  not"]
    haric_k: dict = {}
    for ad, (k, neden) in atlas.get("haric", {}).items():
        haric_k.setdefault(k, []).append(f"{ad} ({neden})")
    for k in TUM:
        oo = atlas["karakterler"].get(k, [])
        aday = atlas["aday"].get(k, 0)
        if oo and oo[0].get("turetilmis"):
            not_ = "türetilmiş: " + atlas["turetilenler"].get(k, "")
        elif not oo:
            not_ = "EKSİK" + (" (tek örnek çıkarıldı)" if aday else "")
        else:
            not_ = ""
        if k in haric_k:
            not_ = (not_ + "; " if not_ else "") + f"çıkarılan {len(haric_k[k])}"
        satirlar.append(f"{k!s:<9} {aday:>4}  {len(oo):>7}  {not_}")
    satirlar += ["", "Türetilenler:"] + [f"  {k}: {v}" for k, v in atlas["turetilenler"].items()]
    satirlar += ["", "Eksikler (kaynak parça yok, uydurulmadı): " + (" ".join(atlas["eksikler"]) or "yok")]
    satirlar += ["", "Elle çıkarılan örnekler (etiket-kaynak.txt `~neden`):"] + [
        f"  {k}: {', '.join(v)}" for k, v in haric_k.items()]
    a = atlas.get("aralik")
    if a:
        satirlar += ["", f"Aralık (orijinal {a['n_satir']} satır, maske kutusu, xh oranı): "
                         f"harf {a['harf']} (n={a['n_harf']}), kelime {a['kelime']} (n={a['n_kelime']}), "
                         f"Otsu eşiği {a['esik']}, glif payı {a['pay']} (her yan)"]
    satirlar += ["", "Renkler:"] + [
        f"  {ad}: profil {r['p']}, yoğunluk {r['yogunluk']}, {r['kaynak']}"
        + (" (türetilmiş)" if r["turetilmis"] else "")
        + (f", koyulukla ölçeklendi ×{r['yogunluk_olcek']}" if r.get("yogunluk_olcek") else "")
        for ad, r in atlas["renkler"].items()]
    t = atlas.get("stiller", {}).get("tukenmez")
    if t:
        satirlar += ["", f"Tükenmez: {t['buyut']}× büyüt, soğurma eşiği {t['sogurma']}, doku {t['doku']}",
                     "  D eşikleri: " + ", ".join(f"{ad} {v}" for ad, v in t["esik"].items()),
                     "  tonlar: " + ", ".join(f"{ad} {tuple(v)}" for ad, v in t["tonlar"].items())]
    satirlar += [""] + notlar
    metin = "\n".join(satirlar) + "\n"
    yol.write_text(metin, encoding="utf-8")
    return metin
