"""Düz assert testleri (pytest yok): `python tools/atlas/test_murekkep.py`."""
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import murekkep
import satirlar
from yollar import REPO, cikti_kontrol

KAGIT = (245, 244, 238)
KARE = (196, 212, 228)      # kareli kâğıdın açık mavi çizgisi
MAVI = (40, 60, 150)
KIRMIZI = (200, 45, 45)


def yapay_sayfa(boy=600):
    """Kareli kâğıt + mavi ve kırmızı çizgi. (görüntü, mavi maske, kırmızı maske, kare maske)."""
    im = Image.new("RGB", (boy, boy), KAGIT)
    c = ImageDraw.Draw(im)
    for v in range(20, boy, 40):
        c.line([(v, 0), (v, boy)], fill=KARE, width=2)
        c.line([(0, v), (boy, v)], fill=KARE, width=2)
    kare = np.asarray(im).copy()
    c.line([(60, 100), (540, 260)], fill=MAVI, width=6)
    c.line([(60, 420), (540, 460)], fill=KIRMIZI, width=6)

    def iz(renk):
        t = Image.new("L", (boy, boy), 0)
        d = ImageDraw.Draw(t)
        if renk == "mavi":
            d.line([(60, 100), (540, 260)], fill=255, width=6)
        else:
            d.line([(60, 420), (540, 460)], fill=255, width=6)
        return np.asarray(t) > 0

    kare_m = (kare != np.array(KAGIT)).any(-1)
    mavi, kirmizi = iz("mavi"), iz("kirmizi")
    rng = np.random.default_rng(0)
    g = np.clip(np.asarray(im).astype(float) + rng.normal(0, 2, (boy, boy, 3)), 0, 255).astype(np.uint8)
    return g, mavi, kirmizi, kare_m & ~mavi & ~kirmizi


def test_maske_cizgiyi_tutar_kareyi_atar():
    src, mavi, kirmizi, kare = yapay_sayfa()
    r = murekkep.oran(src)
    m = murekkep.maske(r)
    assert m[mavi].mean() >= 0.9, f"mavi çizgi tutulmadı: {m[mavi].mean():.2f}"
    assert m[kirmizi].mean() >= 0.9, f"kırmızı çizgi tutulmadı: {m[kirmizi].mean():.2f}"
    # kare çizgileri (mürekkebin 4 px yakını hariç) maskede olmamalı
    from scipy import ndimage as ndi
    uzak = kare & ~ndi.binary_dilation(mavi | kirmizi, iterations=4)
    assert m[uzak].mean() <= 0.01, f"kare çizgisi kaldı: {m[uzak].mean():.3f}"


def test_renk_sinifi():
    src, mavi, kirmizi, _ = yapay_sayfa()
    r = murekkep.oran(src)
    liste, _ = satirlar.bilesenler(murekkep.maske(r), r)
    renkler = sorted(b["renk"] for b in liste)
    assert renkler == ["kirmizi", "mavi"], renkler
    # gerçek ölçümler (6.4d-2, koyuluk = 1 − oran): mavi tükenmez, siyah kalem, yeşil, kurşun kalem
    assert satirlar.renk_sinifi(0.62, 0.57, 0.43) == "mavi"
    assert satirlar.renk_sinifi(0.81, 0.75, 0.62) == "mavi"   # koyu pozlanmış foto
    assert satirlar.renk_sinifi(0.61, 0.69, 0.66) == "siyah"
    assert satirlar.renk_sinifi(0.55, 0.35, 0.5) == "yesil"
    assert satirlar.renk_sinifi(0.33, 0.34, 0.33) == "kalem"


def _b(no, x0, y0, x1, y1):
    return {"no": no, "kutu": [x0, y0, x1, y1], "alan": (x1 - x0) * (y1 - y0) // 2,
            "sayilir": True, "neden": None}


def test_i_noktasi_govdenin_satirinda():
    xh = 40
    ust = [_b(1, 0, 100, 40, 140), _b(2, 50, 100, 62, 140), _b(3, 70, 100, 110, 140)]  # "a i n"
    nokta = _b(4, 51, 80, 61, 90)                                                       # i noktası
    alt = [_b(5, 0, 200, 40, 240), _b(6, 50, 200, 90, 240)]
    liste = ust + [nokta] + alt
    n = satirlar.satirlara_ayir(liste, xh)
    assert n == 2, n
    assert nokta["satir"] == ust[1]["satir"] == 1
    assert all(b["satir"] == 2 for b in alt)


def test_numaralar_sabit():
    src, *_ = yapay_sayfa()
    r = murekkep.oran(src)
    m = murekkep.maske(r)
    a = [b["no"] for b in satirlar.bilesenler(m, r)[0]]
    b = [b["no"] for b in satirlar.bilesenler(m, r)[0]]
    assert a == b == list(range(1, len(a) + 1))


def test_repo_ici_cikti_hata():
    for yol in (REPO / "tools" / "atlas" / "cikti", REPO):
        try:
            cikti_kontrol(yol)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"repo içi çıktı kabul edildi: {yol}")
    with tempfile.TemporaryDirectory() as t:
        assert cikti_kontrol(Path(t) / "atlas") == Path(t) / "atlas"
        try:
            cikti_kontrol(Path(t) / "girdi" / "x", girdi=Path(t) / "girdi")
        except SystemExit:
            pass
        else:
            raise AssertionError("girdi klasörüne yazma kabul edildi")


if __name__ == "__main__":
    testler = [(ad, f) for ad, f in sorted(globals().items()) if ad.startswith("test_")]
    for ad, f in testler:
        f()
        print("geçti:", ad)
    print(f"{len(testler)}/{len(testler)} test geçti")
