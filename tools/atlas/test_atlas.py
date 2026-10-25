"""Düz assert testleri (pytest yok): `python tools/atlas/test_atlas.py`."""
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import aralik
import basici
import etiket_donustur
import etiket_sayfa
import glif
import murekkep
import paket
import renk_olc
import secim
import taban
import turet
import uret
import yollar

KAGIT = (245, 244, 238)
KARE = (196, 212, 228)
MAVI = (40, 60, 150)


def test_taban_dogru_aykiri_atilir():
    xh = 40
    nokta = [(x, 0.05 * x + 100) for x in range(0, 800, 60)] + [(400, 160)]  # biri aykırı
    m, c = taban.dogru_uydur(nokta, xh)
    assert abs(m - 0.05) < 1e-3 and abs(c - 100) < 0.5, (m, c)
    assert taban.dogru_uydur([(10, 50)], xh) == (0.0, 50.0)
    assert taban.dogru_uydur([], xh) is None


def test_taban_inen_harf():
    xh = 40
    # eğik satır: taban y = 0.02·x + 200; a, e, n tabanda; g ve p 15 px iner
    ornek = []
    for i, k in enumerate("aengpa"):
        x0 = 50 + i * 50
        yt = 0.02 * (x0 + 15) + 200
        alt = yt + (15 if k in "gp" else 0)
        ornek.append({"foto": "F", "satir": 1, "karakter": k, "kutu": [x0, yt - xh, x0 + 30, alt]})
    d = taban.satir_tabanlari(ornek, {}, {"F": xh})[("F", 1)]
    assert abs(d[0] - 0.02) < 1e-3, d
    for o in ornek:
        h = o["kutu"][3] - o["kutu"][1]
        t = taban.taban_konumu(o["kutu"], d)
        if o["karakter"] in "gp":
            assert abs(t - (h - 15)) < 0.5, (o["karakter"], t, h)
        else:
            assert abs(t - h) < 0.5, (o["karakter"], t, h)


def _kareli_sayfa(boy=300):
    im = Image.new("RGB", (boy, boy), KAGIT)
    c = ImageDraw.Draw(im)
    for v in range(15, boy, 40):
        c.line([(v, 0), (v, boy)], fill=KARE, width=2)
        c.line([(0, v), (boy, v)], fill=KARE, width=2)
    kare = (np.asarray(im) != np.array(KAGIT)).any(-1)
    c.line([(60, 140), (240, 170)], fill=MAVI, width=6)
    rng = np.random.default_rng(0)
    src = np.clip(np.asarray(im, float) + rng.normal(0, 2, (boy, boy, 3)), 0, 255).astype(np.uint8)
    return src, kare


def test_yogunluk_kagitta_ve_karede_sifir():
    src, kare = _kareli_sayfa()
    r = murekkep.oran(src)
    m = murekkep.maske(r)
    assert m.sum() > 500
    p = glif.profil_olc([r], [m])
    assert p[2] < p[0] and p[2] < p[1], p          # mavi mürekkep: mavi kanal en az soğurur
    D = glif.yogunluk(r, m, p)
    uzak = ~ndi.binary_dilation(m, iterations=glif.GENIS + 6)
    assert (D[uzak] == 0).all()                       # kâğıt ve kare çizgisi: tam sıfır
    assert (D[kare & uzak] == 0).all()
    # yumuşak kenar içinde kalan kare çizgisi ve kâğıt da sıfır (d0 tabanı)
    halka = ndi.binary_dilation(m, iterations=glif.GENIS) & ~ndi.binary_dilation(m, iterations=1)
    assert np.percentile(D[halka], 90) < 0.05, np.percentile(D[halka], 90)
    cek = ndi.binary_erosion(m, iterations=2)
    assert D[cek].min() > 0.5, D[cek].min()


def test_yogunluk_komsu_harf_sizmaz():
    src, _ = _kareli_sayfa()
    r = murekkep.oran(src)
    m = murekkep.maske(r)
    sol = m.copy(); sol[:, 150:] = False
    sag = m & ~sol
    D = glif.yogunluk(r, sol, glif.profil_olc([r], [m]), diger=sag)
    assert (D[ndi.binary_dilation(sag, iterations=1) & ~ndi.binary_dilation(sol, iterations=1)] == 0).all()


def _sahte_atlas():
    def g(w, h=30):
        D = np.ones((h, w), np.float32)
        return {"D": D, "taban": float(h), "ids": [f"X#{w}"]}
    return {"xh": 40, "renkler": {"mavi": {"p": [0.6, 0.6, 0.5], "yogunluk": 1.0}},
            "karakterler": {"a": [g(10)], "b": [g(14)], "g": [{"D": np.ones((40, 12), np.float32),
                                                                 "taban": 28.0, "ids": ["X#g"]}]}}


def test_basici_boyutlari():
    at = _sahte_atlas()
    im, eksik = basici.bas("ab a", "mavi", at)
    kenar, harf, kelime = 20, round(0.08 * 40), round(0.6 * 40)
    assert im.shape == (120, kenar + 10 + harf + 14 + kelime + 10 + kenar, 3), im.shape
    assert eksik == []
    im2, eksik2 = basici.bas("z", "mavi", at)
    assert im2.shape[1] == kenar + 20 + kenar and eksik2 == ["z"]
    # yükseklik sabit, xh ile ölçeklenir
    im3, _ = basici.bas("ab", "mavi", at, xh=20)
    assert im3.shape[0] == 60
    # haric: o örnek kullanılmaz → eksik
    _, e4 = basici.bas("a", "mavi", at, haric=["X#10"])
    assert e4 == ["a"]


def test_basici_taban_hizasi():
    at = _sahte_atlas()
    parcalar, _, _ = basici.yerlesim("ag", at, 40)
    im, _ = basici.bas("ag", "mavi", at, gurultu=0)
    koyu = im[..., 0] < 200
    taban_y = round(basici.TABAN_Y * 40)
    # a'nın altı ve g'nin taban satırı aynı yerde (±1 px oynama), g 12 px iner
    sut_a = np.nonzero(koyu[:, parcalar[0][0] + 5])[0]
    sut_g = np.nonzero(koyu[:, parcalar[1][0] + 5])[0]
    assert abs(sut_a.max() + 1 - taban_y) <= 1
    assert abs(sut_g.max() + 1 - (taban_y + 12)) <= 1


def test_turet_i_noktasi():
    I = {"D": np.ones((30, 6), np.float32), "taban": 30.0, "ids": ["F#1"]}
    Dg = np.zeros((32, 6), np.float32); Dg[10:32] = 1
    Dek = np.zeros((32, 6), np.float32); Dek[0:5] = 1
    i = {"D": Dg + Dek, "Dg": Dg, "Dek": Dek, "taban": 32.0, "ids": ["F#2", "F#3"]}
    yeni, aciklama, eksik = turet.turet({"I": [I], "i": [i]}, ["İ", "ı", "Ğ"])
    o = yeni["İ"][0]
    assert o["D"].shape[0] == 30 + 5 + 5 and abs(o["taban"] - 40) < 1e-6, (o["D"].shape, o["taban"])
    assert o["turetilmis"] and o["kaynak"] == ["F#1", "F#3"]
    assert yeni["ı"][0]["D"] is Dg
    assert eksik == ["Ğ"]


def test_stil_varsayilan_tukenmez_kagit_tam():
    at = _sahte_atlas()
    im, _ = basici.bas("ab a", "mavi", at)
    im_t, _ = basici.bas("ab a", "mavi", at, stil="tukenmez")
    assert (im == im_t).all()                               # varsayılan = tükenmez
    parcalar, _, _ = basici.yerlesim("ab a", at, 40)
    taban_y = round(basici.TABAN_Y * 40)
    bos = np.ones(im.shape[:2], bool)
    for x, D, taban, oyna in parcalar:                     # glifin 2 px çevresi dışı = kâğıt
        y = round(taban_y - taban) + oyna
        bos[max(0, y - 2):y + D.shape[0] + 2, max(0, x - 2):x + D.shape[1] + 2] = False
    assert (im[bos] == np.array(basici.KAGIT, np.uint8)).all()
    assert (im[~bos] != np.array(basici.KAGIT, np.uint8)).any(-1).sum() > 100
    # gövdenin ortası koyu ton
    x, D, taban, oyna = parcalar[0]
    y = round(taban_y - taban) + oyna
    assert (im[y + 15, x + 5] == np.array(basici.TUKENMEZ["tonlar"]["mavi"], np.uint8)).all()


def test_stil_yumusak_ve_bilinmeyen():
    at = _sahte_atlas()
    im, _ = basici.bas("a", "mavi", at, stil="yumusak", gurultu=0)
    parcalar, _, _ = basici.yerlesim("a", at, 40)
    x, D, taban, oyna = parcalar[0]
    y = round(basici.TABAN_Y * 40 - taban) + oyna
    r = at["renkler"]["mavi"]
    bek = np.clip(np.array(basici.KAGIT) * np.exp(-1.0 * r["yogunluk"] * np.array(r["p"])), 0, 255).astype(np.uint8)
    assert (im[y + 10, x + 5] == bek).all()
    assert (im[2, 2] == np.array(basici.KAGIT, np.uint8)).all()
    im2, _ = basici.bas("a", "mavi", at, stil="yumusak")       # kâğıt gürültüsü var
    assert im2[:5].std() > 0
    try:
        basici.bas("a", "mavi", at, stil="kursun-kalem")
        assert False, "bilinmeyen stil hata vermeli"
    except ValueError:
        pass


def test_stil_esik_renk_profiliyle():
    r = {"p": [0.3, 0.7, 0.65], "yogunluk": 1.2}
    e0, e1 = basici.esik_cevir(r)
    k = 1.2 * np.mean(r["p"])
    assert abs(e0 - 0.10 / k) < 1e-3 and abs(e1 - 0.30 / k) < 1e-3
    st = basici.stiller_varsayilan({"mavi": {"p": [0.75, 0.56, 0.34], "yogunluk": 1.25}, "kirmizi": r})
    assert st["varsayilan"] == "tukenmez" and set(st["tukenmez"]["esik"]) == {"mavi", "kirmizi"}
    assert st["tukenmez"]["esik"]["mavi"] != st["tukenmez"]["esik"]["kirmizi"]


def test_aralik_olcum():
    xh = 40
    kutular, x = [], 0
    for kelime in range(3):
        for harf in range(4):
            kutular.append([x, 100, x + xh, 140])
            if harf == 1:
                kutular.append([x + 15, 80, x + 25, 90])      # i noktası: boşluk eklemez
            x += xh + (0.2 * xh if harf < 3 else 0)
        x += 1.5 * xh
    b = aralik.satir_bosluklari(kutular, xh)
    assert len(b) == 11, b
    o = aralik.olc(b * 5)
    assert abs(o["harf"] - 0.2) < 1e-6 and abs(o["kelime"] - 1.5) < 1e-6, o


def test_atlas_aralik_basicida():
    at = _sahte_atlas()
    at["aralik"] = {"harf": 0.3, "kelime": 1.5, "pay": 0.05}
    p, _, _ = basici.yerlesim("a a", at, 40)
    assert p[1][0] - (p[0][0] + 10) == round((1.5 - 0.1) * 40)
    p, _, _ = basici.yerlesim("aa", at, 40)
    assert p[1][0] - (p[0][0] + 10) == round((0.3 - 0.1) * 40)


def _yay(h, w, kalin=4):
    """c gibi yay: üst, sol, alt kenar (sağı açık)."""
    D = np.zeros((h, w), np.float32)
    D[:kalin, :] = 1; D[:, :kalin] = 1; D[h - kalin:, :] = 1
    return D


def test_cengel_bitisik_ve_C_alt_ortasi():
    # ç: c yayı (30×24) + yayın sağ alt ucundan inen 14 px'lik bitişik çengel
    D = np.zeros((44, 24), np.float32)
    D[:30] = _yay(30, 24)
    D[26:44, 16:20] = 1
    o = {"D": D, "Dg": D, "Dek": None, "taban": 30.0, "ids": ["F#1"]}
    Dc = turet.cengel(o)
    assert Dc is not None and Dc.shape[0] >= 12, None if Dc is None else Dc.shape
    C = {"D": _yay(40, 30), "taban": 40.0, "ids": ["F#2"]}
    yeni, aciklama, eksik = turet.turet({"C": [C], "ç": [o]}, ["Ç"])
    T = yeni["Ç"][0]["D"]
    assert T.shape[0] > 40 + 8, T.shape                     # çengel C'nin altına iner
    alt = np.nonzero(T[40:].sum(0) > 0)[0]
    assert abs(alt.mean() - 15) < 4, alt                     # alt ortada
    assert (T[38:41, alt.min():alt.max() + 1] > 0).any(0).all()   # C'ye bağlı (boşluk yok)
    assert aciklama["Ç"] == "C + ç çengeli" and eksik == []


def test_cengel_yoksa_turetilmez():
    c = {"D": _yay(30, 24), "Dg": _yay(30, 24), "Dek": None, "taban": 30.0, "ids": ["F#1"]}
    assert turet.cengel(c) is None
    C = {"D": _yay(40, 30), "taban": 40.0, "ids": ["F#2"]}
    _, _, eksik = turet.turet({"C": [C], "ç": [c]}, ["Ç"])
    assert eksik == ["Ç"]


def test_sapka_nokta_gibi_kullanilmaz():
    nokta = np.ones((5, 5), np.float32)
    sapka = np.ones((5, 14), np.float32)
    assert not turet.sapka_mi(nokta) and turet.sapka_mi(sapka)


def test_haric_secilmez():
    oo = [{"karakter": "a", "kutu": [0, 0, 40, 40], "xh": 40, "alan": 600, "taban": 40.0}
          for _ in range(3)]
    oo[0]["haric"] = "iz"
    sec = secim.sec(oo)
    assert len(sec) == 2 and all(not o.get("haric") for o in sec)
    assert oo[0]["elendi"] == "haric"


def test_etiket_donustur_haric():
    e = etiket_donustur.cozumle("@IMG_1\n1:a 2+3:ö~iz 4:~ 5:=ra 6:!parca 7::")
    assert e[1] == {"id": "IMG_1#2", "ek": ["IMG_1#3"], "karakter": "ö", "haric": "iz"}
    assert e[2] == {"id": "IMG_1#4", "karakter": "~"}
    assert e[3]["cift"] == "ra" and e[4]["atla"] == "parca" and e[5]["karakter"] == ":"


def test_yardimci_betikler_repoya_yazmaz():
    for f, arg in ((etiket_donustur.main, ["--cikti", str(yollar.REPO / "x")]),
                   (etiket_sayfa.main, [str(yollar.REPO / "tools" / "atlas" / "x"), "IMG_1570"]),
                   (renk_olc.main, [str(yollar.REPO / "x.json")])):
        try:
            f(arg)
            assert False, f"{f.__module__} repo içine yazmamalı"
        except SystemExit as e:
            assert "repo içinde" in str(e), e


def test_kursun_esigi_siyahtan():
    n = [0.5774] * 3
    st = basici.stiller_varsayilan({"siyah": {"p": n, "yogunluk": 0.94}, "kursun": {"p": n, "yogunluk": 0.42}})
    e = st["tukenmez"]["esik"]
    assert e["kursun"] == e["siyah"], e
    assert st["tukenmez"]["tonlar"]["kursun"] != st["tukenmez"]["tonlar"]["siyah"]   # ton açık kalır


def test_paket_yerlesim():
    rng = np.random.default_rng(3)
    boy = [(int(rng.integers(5, 90)), int(rng.integers(20, 120))) for _ in range(300)]
    konum, W, H = paket.yerlestir(boy)
    assert W <= paket.MAX_GENISLIK
    kutu = [(x, y, x + w, y + h) for (x, y), (w, h) in zip(konum, boy)]
    for x0, y0, x1, y1 in kutu:
        assert x0 >= paket.BOSLUK and y0 >= paket.BOSLUK and x1 + paket.BOSLUK <= W and y1 + paket.BOSLUK <= H
    for i, a in enumerate(kutu):                       # çakışma yok, aralarında en az BOSLUK
        for b in kutu[i + 1:]:
            ayri = (a[2] + paket.BOSLUK <= b[0] or b[2] + paket.BOSLUK <= a[0]
                    or a[3] + paket.BOSLUK <= b[1] or b[3] + paket.BOSLUK <= a[1])
            assert ayri, (a, b)


def test_paket_kodlama_gidis_donus():
    D = np.linspace(0, 6.6, 5000, dtype=np.float32).reshape(50, 100)
    olcek = 255 / 6.6
    for kod in paket.KODLAMALAR:
        px = paket.kodla(D, olcek, kod)
        assert px.dtype == np.uint8 and px.max() == 255 and px.min() == 0
        geri = paket.coz(px, olcek, kod)
        assert float(np.abs(geri - D).max()) <= 6.6 / 255 + 1e-5, kod   # karekökte adım en çok bir doğrusal adım
    assert paket.coz(paket.kodla(np.zeros((2, 2)), olcek, "karekok"), olcek, "karekok").max() == 0  # kâğıt 0 kalır


def test_paket_kaynak_adi_yok_ve_basim_ayni():
    at = _sahte_atlas()
    at["karakterler"]["a"][0]["D"] = np.linspace(0, 2, 300, dtype=np.float32).reshape(30, 10)
    at["karakterler"]["b"][0]["turetilmis"] = True
    sayfa, j = paket.paket_kur(at, "karekok")
    metin = json.dumps(j, ensure_ascii=False)
    assert "X#" not in metin and "ids" not in metin and "puan" not in metin, metin
    assert j["tur"] == "defter-el-yazisi" and j["surum"] == 1 and j["kodlama"] == "karekok"
    assert sayfa.shape == (j["sayfa"]["h"], j["sayfa"]["w"]) and sayfa.dtype == np.uint8
    assert j["karakterler"]["b"][0]["turetilmis"] is True and "turetilmis" not in j["karakterler"]["a"][0]
    pa = paket.paket_atlas(sayfa, j)
    a, _ = basici.bas("ab ga", "mavi", at, stil="yumusak")
    b, _ = basici.bas("ab ga", "mavi", pa, stil="yumusak")
    assert a.shape == b.shape and int(np.abs(a.astype(int) - b.astype(int)).max()) <= 2


def test_paket_repoya_yazmaz():
    try:
        uret.paket_uret(yollar.REPO / "x")
        assert False, "paket repo içine yazmamalı"
    except SystemExit as e:
        assert "repo içinde" in str(e), e


if __name__ == "__main__":
    testler = [f for ad, f in sorted(globals().items()) if ad.startswith("test_")]
    for f in testler:
        f()
        print("geçti:", f.__name__)
    print(f"{len(testler)}/{len(testler)} test geçti")
