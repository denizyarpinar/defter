r"""Etiketlerden atlas: örnekler, taban, renk profilleri, yoğunluk, seçim, türetme.

Girdi: `1-kesit\<foto>-bilesenler.json` + `2-etiket\etiket.json`.
Çıktı: `2-etiket\aday-<kod>.png`, `3-atlas\atlas.json`, `3-atlas\glif\<kod>-<n>.npy`.
Fotoğraf kesitleri `3-atlas\onbellek\` altında saklanır (ilk çalıştırma yavaş, sonra hızlı).
"""
import json
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import aralik
import basici
import glif
import murekkep
import satirlar
import secim
import taban
import turet
from kesit import _font

HEDEF_XH = 40
HEDEF = (list("abcdefghijklmnopqrstuvwxyz") + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
         + list("äöüß") + list("çğışİ") + list("0123456789") + list(".,:;!?-+=()/→'\""))
# büyük Türkçe/Almanca harfler: hedef kümede değil, sadece parçalardan türetilir
TURETILEN = list("ÄÇĞÖŞÜ")
TUM = HEDEF[:HEDEF.index("İ") + 1] + TURETILEN + HEDEF[HEDEF.index("İ") + 1:]
# basım rengi; siyah ve kurşun gerçek örnekten değil (türetilmiş)
KURSUN_KAT = 0.45


def kod(k: str) -> str:
    return "-".join(f"{ord(c):04x}" for c in k)


# --- etiketler -------------------------------------------------------------

def bilesenleri_oku(kesit_dir: Path) -> tuple[dict, dict]:
    """id → bileşen kaydı (foto eklenmiş), foto → xh."""
    kayit, xh = {}, {}
    for p in sorted(kesit_dir.glob("*-bilesenler.json")):
        j = json.loads(p.read_text(encoding="utf-8"))
        foto = p.name.removesuffix("-bilesenler.json")
        xh[foto] = j["kucuk_harf_px"]
        for b in j["bilesenler"]:
            kayit[b["id"]] = dict(b, foto=foto)
    return kayit, xh


def etiketleri_oku(yol: Path) -> list[dict]:
    j = json.loads(yol.read_text(encoding="utf-8"))
    return j["etiketler"] if isinstance(j, dict) else j


def kontrol(etiketler: list[dict], kayit: dict) -> dict:
    """Hatalar (bilinmeyen id, iki kez kullanılan id, eksik alan) ve karakter sayıları."""
    hata, uyari, kullanilan = [], [], Counter()
    sayi = Counter()
    for e in etiketler:
        ids = [e.get("id")] + list(e.get("ek", []))
        for i in ids:
            kullanilan[i] += 1
            if i not in kayit:
                hata.append(f"bilinmeyen id: {i}")
            elif not kayit[i]["sayilir"]:
                uyari.append(f"sayılmayan bileşen ({kayit[i]['neden']}): {i}")
        tur = [t for t in ("karakter", "cift", "atla") if t in e]
        if len(tur) != 1:
            hata.append(f"tek alan olmalı (karakter | cift | atla): {e}")
        elif "karakter" in e:
            sayi[e["karakter"]] += 1
            if len(e["karakter"]) != 1:
                hata.append(f"karakter tek harf olmalı: {e}")
        if ids[1:] and e.get("id") in kayit:
            satir = {kayit[i]["satir"] for i in ids if i in kayit}
            if len(satir) > 1:
                uyari.append(f"ek başka satırda: {e['id']} {sorted(satir, key=str)}")
    hata += [f"iki kez kullanıldı: {i}" for i, n in kullanilan.items() if n > 1]
    return {"hata": hata, "uyari": uyari, "sayi": sayi,
            "eksik": [k for k in HEDEF if sayi[k] == 0],
            "az": {k: sayi[k] for k in HEDEF if 0 < sayi[k] < 4}}


def ornekleri_kur(etiketler: list[dict], kayit: dict, xh: dict) -> list[dict]:
    ornekler = []
    for e in etiketler:
        if "karakter" not in e:
            continue
        ids = [e["id"]] + list(e.get("ek", []))
        kk = np.array([kayit[i]["kutu"] for i in ids])
        g = kayit[e["id"]]
        ornekler.append({
            "ad": e["id"], "karakter": e["karakter"], "ids": ids, "foto": g["foto"], "satir": g["satir"],
            "kutu": [int(kk[:, 0].min()), int(kk[:, 1].min()), int(kk[:, 2].max()), int(kk[:, 3].max())],
            "renk": g["renk"], "kalin": g.get("kalin", 0.0), "xh": xh[g["foto"]],
            "alan": int(sum(kayit[i]["alan"] for i in ids)),
            **({"haric": e["haric"]} if e.get("haric") else {}),
        })
    return ornekler


# --- fotoğraf kesitleri (önbellek) ------------------------------------------

def _onbellek_ad(o: dict) -> str:
    return "_".join(i.replace("#", "-") for i in o["ids"]) + ".npz"


def onbellegi_doldur(ornekler: list[dict], girdi: Path, ob: Path, e=murekkep.Esikler(),
                     a=satirlar.SatirAyar()) -> None:
    """Eksik örneklerin oran kesiti ve maskeleri (kendi gövde, ek, başka mürekkep)."""
    ob.mkdir(parents=True, exist_ok=True)
    eksik: dict = {}
    for o in ornekler:
        if not (ob / _onbellek_ad(o)).exists():
            eksik.setdefault(o["foto"], []).append(o)
    for foto, liste in eksik.items():
        yol = next(p for p in girdi.iterdir() if p.stem == foto)
        print(f"  {foto}: {len(liste)} örnek kesiliyor…", flush=True)
        src = murekkep.foto_oku(yol)
        r = murekkep.oran(src, e)
        m = murekkep.maske(r, e)
        bl, lab = satirlar.bilesenler(m, r, a)
        etiket = {f"{foto}#{b['no']}": b["_etiket"] for b in bl}
        H, W = lab.shape
        P = glif.PAY
        for o in liste:
            x0, y0, x1, y1 = o["kutu"]
            X0, Y0, X1, Y1 = max(0, x0 - P), max(0, y0 - P), min(W, x1 + P), min(H, y1 + P)
            L = lab[Y0:Y1, X0:X1]
            govde = L == etiket[o["ids"][0]]
            ek = np.isin(L, [etiket[i] for i in o["ids"][1:]]) if o["ids"][1:] else np.zeros_like(govde)
            diger = (L > 0) & ~govde & ~ek
            np.savez_compressed(ob / _onbellek_ad(o), oran=r[Y0:Y1, X0:X1].astype(np.float16),
                                govde=govde, ek=ek, diger=diger, koken=np.array([X0, Y0]))


def _yukle(o: dict, ob: Path) -> dict:
    z = np.load(ob / _onbellek_ad(o))
    return {k: z[k] for k in z.files}


# --- renk profilleri ve yoğunluk --------------------------------------------

def kaynak_profilleri(ornekler: list[dict], ob: Path) -> dict:
    """Örneklerin kendi renklerine göre ölçülen soğurma profilleri (izdüşüm için)."""
    prof = {}
    for renk in ("mavi", "kirmizi", "yesil", "siyah"):
        oo = [o for o in ornekler if o["renk"] == renk][:200]
        if not oo:
            continue
        z = [_yukle(o, ob) for o in oo]
        prof[renk] = glif.profil_olc([q["oran"] for q in z], [q["govde"] | q["ek"] for q in z])
    return prof


def ornek_yogunlugu(o: dict, z: dict, profil) -> dict:
    """Atlas ölçeğinde D (gövde + ek), Dg, Dek ve taban; çekirdek medyanı 1'e normalize."""
    r, g, ek, diger = z["oran"].astype(np.float32), z["govde"], z["ek"], z["diger"]
    hepsi = g | ek
    D = glif.yogunluk(r, hepsi, profil, diger)
    Dg = glif.yogunluk(r, g, profil, diger | ek) if ek.any() else D
    De = glif.yogunluk(r, ek, profil, diger | g) if ek.any() else None
    cek = ndi.binary_erosion(hepsi, iterations=1)
    olc = float(np.median(D[cek if cek.any() else hepsi])) or 1.0
    # doluluk: maskenin ne kadarı gerçekten mürekkep (soluk/kesik kalem izi düşük çıkar)
    dolu = float(np.mean(D[hepsi] > 0.3 * olc))
    s = HEDEF_XH / o["xh"]
    X0, Y0 = z["koken"]
    tb = o["taban"] + (o["kutu"][1] - Y0)       # kesit içinde
    D, Dg = glif.olcekle(D / olc, s), glif.olcekle(Dg / olc, s)
    De = glif.olcekle(De / olc, s) if De is not None else None
    ys, xs = np.nonzero(D > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    kes = (slice(y0, y1), slice(x0, x1))
    return {"D": D[kes].copy(), "Dg": Dg[kes].copy(), "Dek": De[kes].copy() if De is not None else None,
            "taban": tb * s - y0, "olcek": round(s, 4), "olc": round(olc, 3), "dolu": round(dolu, 3)}


def basim_renkleri(prof: dict, ornekler: list[dict], yog: dict) -> dict:
    """Basım renkleri: mavi/kırmızı/yeşil gerçek profil, siyah nötr, kurşun nötr ve açık."""
    yogunluk = {}
    for o in ornekler:
        if o["ad"] in yog:
            yogunluk.setdefault(o["renk"], []).append(yog[o["ad"]]["olc"])
    renkler = {}
    for renk in ("mavi", "kirmizi", "yesil"):
        if renk in prof:
            renkler[renk] = {"p": [round(float(v), 4) for v in prof[renk]],
                             "yogunluk": round(float(np.median(yogunluk[renk])), 3),
                             "kaynak": f"{len(yogunluk[renk])} örnek", "turetilmis": False}
    koyu = renkler.get("mavi", {"yogunluk": 1.2})["yogunluk"]
    kaynak = "nötr, yoğunluk maviden"
    if "siyah" in yogunluk:
        koyu = round(float(np.median(yogunluk["siyah"])), 3)
        kaynak = f"nötr, yoğunluk {len(yogunluk['siyah'])} siyah örnekten"
    n = [round(float(v), 4) for v in glif.NOTR]
    renkler["siyah"] = {"p": n, "yogunluk": koyu, "kaynak": kaynak, "turetilmis": True}
    renkler["kursun"] = {"p": n, "yogunluk": round(koyu * KURSUN_KAT, 3),
                         "kaynak": f"nötr × {KURSUN_KAT}", "turetilmis": True}
    return renkler


# --- aday sayfaları ----------------------------------------------------------

def aday_sayfasi(yol: Path, k: str, adaylar: list[dict], yog: dict, renk: dict) -> None:
    font = _font(13)
    hucre = []
    for o in adaylar:
        y = yog.get(o["ad"])
        if y is None:
            continue
        D = y["D"]
        A = D[..., None] * renk["yogunluk"] * np.asarray(renk["p"], np.float32)
        im = Image.fromarray(np.clip(np.array([247, 246, 241], np.float32) * np.exp(-A), 0, 255).astype(np.uint8))
        hucre.append((o, im, y["taban"]))
    if not hucre:
        return
    yuk = int(max(im.height for _, im, _ in hucre)) + 50
    gen = sum(im.width + 24 for _, im, _ in hucre) + 10
    sayfa = Image.new("RGB", (max(gen, 200), yuk + 22), (255, 255, 255))
    c = ImageDraw.Draw(sayfa)
    c.text((6, 2), f"{k}  ({len(hucre)} aday, çerçeveli = seçilen)", fill=(0, 0, 0), font=font)
    ust_taban = max(tb for _, _, tb in hucre) + 24
    x = 10
    for o, im, tb in hucre:
        y = int(ust_taban - tb)
        sayfa.paste(im, (x, y))
        if o.get("secildi"):
            c.rectangle([x - 4, y - 4, x + im.width + 4, y + im.height + 4], outline=(20, 150, 50), width=3)
        elif o.get("elendi"):
            c.text((x, y - 16), o["elendi"], fill=(200, 60, 40), font=font)
        c.text((x, yuk + 2), o["ad"].replace("IMG_", ""), fill=(90, 90, 90), font=_font(11))
        x += im.width + 24
    c.line([(0, ust_taban), (sayfa.width, ust_taban)], fill=(230, 200, 200), width=1)
    sayfa.save(yol)


# --- ana akış ----------------------------------------------------------------

def kur(cikti: Path, girdi: Path) -> dict:
    kesit_dir, etiket_dir, atlas_dir = cikti / "1-kesit", cikti / "2-etiket", cikti / "3-atlas"
    kayit, xh = bilesenleri_oku(kesit_dir)
    etiketler = etiketleri_oku(etiket_dir / "etiket.json")
    k = kontrol(etiketler, kayit)
    if k["hata"]:
        raise SystemExit("etiket.json hatalı:\n  " + "\n  ".join(k["hata"][:30]))
    ornekler = ornekleri_kur(etiketler, kayit, xh)

    # taban: satır başına doğru
    govdeler: dict = {}
    for b in kayit.values():
        if b["sayilir"] and b["satir"] is not None:
            govdeler.setdefault((b["foto"], b["satir"]), []).append(b["kutu"])
    dogrular = taban.satir_tabanlari(ornekler, govdeler, xh)
    for o in ornekler:
        o["taban"] = round(taban.taban_konumu(o["kutu"], dogrular[(o["foto"], o["satir"])]), 2)

    ob = atlas_dir / "onbellek"
    onbellegi_doldur(ornekler, girdi, ob)
    prof = kaynak_profilleri(ornekler, ob)
    yog = {o["ad"]: ornek_yogunlugu(o, _yukle(o, ob), prof.get(o["renk"], glif.NOTR)) for o in ornekler}
    renkler = basim_renkleri(prof, ornekler, yog)

    # seçim (atlas ölçeğinde taban ile değil, foto ölçeğinde kutu/taban ile)
    for o in ornekler:
        o["dolu"] = yog[o["ad"]]["dolu"]
    gruplar: dict = {}
    for o in ornekler:
        gruplar.setdefault(o["karakter"], []).append(o)
    secilen = {kk: secim.sec(oo) for kk, oo in gruplar.items()}

    for eski in etiket_dir.glob("aday-*.png"):
        eski.unlink()
    for kk, oo in gruplar.items():
        aday_sayfasi(etiket_dir / f"aday-{kod(kk)}.png", kk, sorted(oo, key=lambda o: o["puan"]),
                     yog, renkler["mavi"])

    karakterler = {kk: [dict(yog[o["ad"]], ids=o["ids"], renk=o["renk"], puan=o["puan"]) for o in ss]
                   for kk, ss in secilen.items() if ss}
    turetilen, aciklama, eksik = turet.turet(karakterler, TUM)

    gdir = atlas_dir / "glif"
    gdir.mkdir(parents=True, exist_ok=True)
    for eski in gdir.glob("*.npy"):
        eski.unlink()
    # aralık: orijinal satırlardan (maske kutusu); pay = glifin maske kutusundan taşan yumuşak kenarı
    ara = aralik.kesitlerden(kesit_dir)
    ara["pay"] = round(float(np.median([
        (yog[o["ad"]]["D"].shape[1] / HEDEF_XH - (o["kutu"][2] - o["kutu"][0]) / o["xh"]) / 2
        for ss in secilen.values() for o in ss])), 3)
    kayit_json = {"surum": 1, "xh": HEDEF_XH, "renkler": renkler, "aralik": ara,
                  "stiller": basici.stiller_varsayilan(renkler), "karakterler": {},
                  "turetilenler": aciklama, "eksikler": eksik,
                  "aday": {kk: len(oo) for kk, oo in gruplar.items()},
                  "haric": {o["ad"]: [o["karakter"], o["haric"]] for o in ornekler if o.get("haric")}}
    for kk, oo in list(karakterler.items()) + list(turetilen.items()):
        liste = []
        for n, o in enumerate(oo):
            ad = f"{kod(kk)}-{n}.npy"
            glif.kaydet(gdir / ad, o["D"])
            liste.append({"dosya": ad, "taban": round(float(o["taban"]), 2), "ids": o["ids"],
                          "boyut": [int(o["D"].shape[1]), int(o["D"].shape[0])],
                          **({"turetilmis": True} if o.get("turetilmis") else
                             {"renk": o["renk"], "puan": o["puan"], "olcek": o["olcek"]})})
        kayit_json["karakterler"][kk] = liste
    (atlas_dir / "atlas.json").write_text(json.dumps(kayit_json, ensure_ascii=False, indent=1), encoding="utf-8")
    return kayit_json


def atlas_yukle(atlas_dir: Path) -> dict:
    """Basıcı için: atlas.json + glif npy'leri."""
    j = json.loads((atlas_dir / "atlas.json").read_text(encoding="utf-8"))
    kar = {k: [dict(o, D=glif.yukle(atlas_dir / "glif" / o["dosya"])) for o in oo]
           for k, oo in j["karakterler"].items()}
    return dict(j, karakterler=kar)
