"""Basıcı: metni atlasın gerçek mürekkep harfleriyle kâğıda basar.

Örnekler karakter başına sırayla döner; tabanda ±1 px oynama. Harf ve kelime arası
atlasın `aralik` ölçümünden (orijinal satırlar, maske kutusu; glifin yumuşak kenar payı
`pay` her yandan çıkarılır), yoksa sabitlerden. Atlasta olmayan karakter çizilmez,
yerine 0.5·xh boşluk bırakılır ve `eksik` listesine yazılır.

İki stil (atlas aynı, stil basarken uygulanır; parametreler atlas.json `stiller`):
- tukenmez (varsayılan): glif 3× büyütülür (Lanczos), α = smoothstep(D; e0, e1)
  (e renk başına, D ölçeğinde), basınç dokusu 0.80 + 0.20·D/D90 (D90: glifin 90.
  yüzdeliği), renk kâğıt ile koyu ton arasında, sonra küçültülür. Kâğıt tam kâğıt rengi.
- yumusak: kâğıt × exp(−D·yoğunluk·profil) + hafif kâğıt gürültüsü (sulu boya gibi).

atlas = {"xh": 40, "renkler": {ad: {p, yogunluk}}, "aralik"?, "stiller"?,
         "karakterler": {k: [{"D": np.ndarray, "taban": float, "ids": [...]}, ...]}}
"""
import numpy as np
from PIL import Image

import glif

HARF_ARASI = 0.08   # aralik ölçümü yoksa
KELIME_ARASI = 0.6
EKSIK_GENISLIK = 0.5
YUKSEKLIK = 3.0     # satır yüksekliği (xh katı)
TABAN_Y = 2.1       # taban çizgisinin yeri (xh katı, üstten)
KENAR = 0.5         # sol/sağ kenar (xh katı)
KAGIT = (247, 246, 241)

STILLER = ("tukenmez", "yumusak")
# önizlemedeki eşikler: basılı görüntüde kanal ortalaması soğurması (−log(oran))
TUKENMEZ_SOGURMA = (0.10, 0.30)
TUKENMEZ = {
    "buyut": 3,
    "doku": [0.80, 0.20, 90],
    "tonlar": {"mavi": [22, 32, 98], "kirmizi": [150, 25, 30], "yesil": [25, 95, 55],
               "siyah": [25, 25, 30], "kursun": [95, 95, 100]},
}


def esik_cevir(renk: dict, sogurma=TUKENMEZ_SOGURMA) -> list[float]:
    """Kanal ortalaması soğurma eşiği → atlas D eşiği, rengin kendi profiliyle:
    basılı soğurma ort_c(D·yoğunluk·p_c) = D·yoğunluk·ort(p)."""
    k = float(renk["yogunluk"]) * float(np.mean(renk["p"]))
    return [round(t / k, 4) for t in sogurma]


def stiller_varsayilan(renkler: dict) -> dict:
    esik = {ad: esik_cevir(r) for ad, r in renkler.items()}
    if "siyah" in esik and "kursun" in esik:
        esik["kursun"] = list(esik["siyah"])   # kurşun: siyahın eşiği, tonu açık (yoğunluğu düşük, eşiği yüksek olmasın)
    t = dict(TUKENMEZ, sogurma=list(TUKENMEZ_SOGURMA), esik=esik)
    return {"varsayilan": "tukenmez", "kagit": list(KAGIT), "tukenmez": t, "yumusak": {"gurultu": 1.4}}


def _secim(atlas: dict, k: str, haric: set) -> list[dict]:
    return [o for o in atlas["karakterler"].get(k, []) if not (set(o.get("ids", [])) & haric)]


def araliklar(atlas: dict) -> tuple[float, float]:
    """(harf arası, kelime arası) xh biriminde, glif kutuları arasında."""
    a = atlas.get("aralik")
    if not a:
        return HARF_ARASI, KELIME_ARASI
    pay = 2 * float(a.get("pay", 0.0))
    return float(a["harf"]) - pay, float(a["kelime"]) - pay


def yerlesim(metin: str, atlas: dict, xh: float, haric=(), tohum: int = 0, oynama: bool = True):
    """Basılacak parçalar: [(x, D, taban, oynama)], toplam genişlik, eksikler.
    oynama=False: tabanda oynama yok (6.4e referansı; rng çekilmez)."""
    haric = set(haric)
    olcek = xh / atlas["xh"]
    rng = np.random.default_rng(tohum)
    sayac: dict = {}
    kenar = round(KENAR * xh)
    h_ara, k_ara = araliklar(atlas)
    harf_arasi = round(h_ara * xh)
    kelime_arasi = round(k_ara * xh)
    x = kenar
    parcalar, eksik = [], []
    onceki_harf = False
    for k in metin:
        if k == " ":
            x += kelime_arasi
            onceki_harf = False
            continue
        if onceki_harf:
            x += harf_arasi
        secenek = _secim(atlas, k, haric)
        if not secenek:
            eksik.append(k)
            x += round(EKSIK_GENISLIK * xh)
            onceki_harf = True
            continue
        n = sayac.get(k, 0); sayac[k] = n + 1
        o = secenek[n % len(secenek)]
        D = glif.olcekle(o["D"], olcek)
        parcalar.append((x, D, o["taban"] * olcek, int(rng.integers(-1, 2)) if oynama else 0))
        x += D.shape[1]
        onceki_harf = True
    return parcalar, max(x + kenar, 1), eksik


def smoothstep(x: np.ndarray, e0: float, e1: float) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _buyut(D: np.ndarray, k: int) -> np.ndarray:
    im = Image.fromarray(D.astype(np.float32), mode="F")
    return np.maximum(np.asarray(im.resize((D.shape[1] * k, D.shape[0] * k), Image.Resampling.LANCZOS),
                                 np.float32), 0.0)


def _tukenmez(parcalar, H, W, taban_y, renk: str, st: dict) -> np.ndarray:
    t = st["tukenmez"]
    k = int(t["buyut"])
    e0, e1 = t["esik"][renk]
    d_taban, d_kat, yuzde = t["doku"]
    kalan = np.ones((H * k, W * k), np.float32)     # Π(1 − kaplama)
    for x, D, taban, oyna in parcalar:
        y = round(taban_y - taban) + oyna
        U = _buyut(D, k)
        d90 = float(np.percentile(D[D > 0], yuzde)) if (D > 0).any() else 1.0
        c = smoothstep(U, e0, e1) * np.clip(d_taban + d_kat * U / max(d90, 1e-6), 0.0, 1.0)
        h, w = c.shape
        Y, X = y * k, x * k
        y0, y1 = max(0, Y), min(H * k, Y + h)
        x1 = min(W * k, X + w)
        if y1 > y0 and x1 > X:
            kalan[y0:y1, X:x1] *= 1.0 - c[y0 - Y:y1 - Y, :x1 - X]
    kagit = np.asarray(st["kagit"], np.float32)
    ton = np.asarray(t["tonlar"][renk], np.float32)
    kap = (1.0 - kalan).reshape(H, k, W, k).mean((1, 3))  # BOX küçültme
    return np.clip(np.round(kagit + kap[..., None] * (ton - kagit)), 0, 255).astype(np.uint8)


def bas(metin: str, renk: str, atlas: dict, xh: float | None = None, haric=(), tohum: int = 0,
        gurultu: float | None = None, stil: str | None = None, oynama: bool = True):
    """RGB satır görüntüsü (uint8) ve eksik karakterler."""
    st = atlas.get("stiller") or stiller_varsayilan(atlas["renkler"])
    stil = stil or st.get("varsayilan", "tukenmez")
    if stil not in STILLER:
        raise ValueError(f"bilinmeyen stil: {stil} (tukenmez | yumusak)")
    xh = float(xh or atlas["xh"])
    parcalar, genislik, eksik = yerlesim(metin, atlas, xh, haric, tohum, oynama)
    H = round(YUKSEKLIK * xh)
    taban_y = round(TABAN_Y * xh)
    if stil == "tukenmez":
        return _tukenmez(parcalar, H, genislik, taban_y, renk, st), eksik
    D_top = np.zeros((H, genislik), np.float32)
    for x, D, taban, oyna in parcalar:
        y = round(taban_y - taban) + oyna
        h, w = D.shape
        y0, y1 = max(0, y), min(H, y + h)
        if y1 > y0:
            D_top[y0:y1, x:x + w] += D[y0 - y:y1 - y, :genislik - x]
    rng = np.random.default_rng(tohum + 1)
    g = st["yumusak"]["gurultu"] if gurultu is None else gurultu
    kagit = np.asarray(st["kagit"], np.float32) + rng.normal(0, g, (H, genislik, 1)).astype(np.float32)
    r = atlas["renkler"][renk]
    A = D_top[..., None] * float(r["yogunluk"]) * np.asarray(r["p"], np.float32)
    return np.clip(kagit * np.exp(-A), 0, 255).astype(np.uint8), eksik
