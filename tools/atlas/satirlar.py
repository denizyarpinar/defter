"""Bileşenler (bağlı mürekkep parçaları), renk sınıfı ve satırlar.

Numara: foto içinde (üst, sol) sırasıyla 1'den; aynı girdi + aynı eşikler = aynı
numara. Kimlik `IMG_1570#123`.

Atlasa sayılmayanlar (`sayilir: false`, `neden`): görüntü kenarına değenler
(spiral, masa), kalem kalınlığını çok aşan lekeler (delgi deliği, spiral), sayfa
boyu çizgiler (kâğıt kenarı), kurşun kalem.

Satır: gövde boyutundaki bileşenler dikeyde örtüşüyor ve yatayda yakınsa aynı
satırdadır (eğik foto ve yan yana iki sütun için izdüşümden sağlam). Küçükler
(i/ä noktası, virgül) yatayda örtüşen en yakın gövdenin satırına, büyükler
(çizim, uzun parantez) en çok örtüştükleri satıra; hiçbiri yoksa kendi satırı.
"""
from dataclasses import dataclass, asdict

import numpy as np
from scipy import ndimage as ndi


@dataclass
class SatirAyar:
    min_alan: int = 60          # px; altı gürültü
    kenar_pay: float = 0.01     # görüntü kenarına bu oranda yakın = kenar
    leke_kat: float = 0.35      # kalınlık (mesafe dönüşümü) > xh × kat = leke
    sayfa_cizgi: float = 0.35   # genişlik/yükseklik görüntünün bu oranını aşarsa kâğıt kenarı
    kucuk_kat: float = 0.5      # iki boyutu da < xh × kat = küçük (nokta)
    buyuk_kat: float = 2.5      # yükseklik > xh × kat = büyük (çizim, parantez)
    ortusme: float = 0.4        # gövde çekirdekleri dikeyde en az bu oranda örtüşmeli
    yatay_bosluk: float = 6.0   # aynı satırda iki gövde arası en çok xh × kat
    yassi_kat: float = 0.6      # satırdaki en yüksek bileşen < xh × kat = yazı değil
    yalniz_alan: float = 0.5    # tek başına satır olan bileşen alanı < xh² × kat = leke
    # renk
    kirmizi_renk_fark: float = 0.12  # dG − dR (koyuluk farkı) en az
    yesil_renk_fark: float = 0.06    # dR − dG ve dB − dG en az
    # mavi tükenmez: kırmızı/yeşil kanal çok, mavi kanal az soğurulur. Ölçüm (6.4d-2):
    # asıl mürekkep dB / max(dR, dG) ≈ 0.60–0.82, siyah kalem (Türkçe çeviriler) ≈ 0.90–1.0
    mavi_oran: float = 0.84     # dB / max(dR, dG) altı = mavi
    kalem_koyu: float = 0.45    # renksiz (mavi/kırmızı/yeşil değil) ve ortalama koyuluk altı = kurşun kalem

    def sozluk(self) -> dict:
        return asdict(self)


def renk_sinifi(dR: float, dG: float, dB: float, a: SatirAyar = SatirAyar()) -> str:
    """Koyuluk (1 − oran) ortalamalarından renk sınıfı."""
    if dG - dR >= a.kirmizi_renk_fark and dB - dR >= a.kirmizi_renk_fark * 0.5:
        return "kirmizi"
    if dR - dG >= a.yesil_renk_fark and dB - dG >= a.yesil_renk_fark:
        return "yesil"
    if max(dR, dG) > 0 and dB / max(dR, dG) < a.mavi_oran:
        return "mavi"
    if (dR + dG + dB) / 3 < a.kalem_koyu:
        return "kalem"
    return "siyah"


def bilesenler(m: np.ndarray, r: np.ndarray, a: SatirAyar = SatirAyar()) -> list[dict]:
    """Maskedeki bileşenler, (üst, sol) sırasıyla numaralı. Etiket görüntüsü de döner."""
    lab, n = ndi.label(m, structure=np.ones((3, 3), bool))
    if n == 0:
        return [], lab
    idx = np.arange(1, n + 1)
    alan = ndi.sum(m, lab, idx)
    d = [1.0 - ndi.mean(r[..., k], lab, idx) for k in range(3)]
    kalin = ndi.maximum(ndi.distance_transform_edt(m), lab, idx)
    objs = ndi.find_objects(lab)
    H, W = m.shape
    pay = a.kenar_pay * max(H, W)

    liste = []
    for i, o in enumerate(objs):
        if alan[i] < a.min_alan:
            continue
        y0, y1, x0, x1 = o[0].start, o[0].stop, o[1].start, o[1].stop
        liste.append({
            "_etiket": i + 1,
            "kutu": [int(x0), int(y0), int(x1), int(y1)],
            "alan": int(alan[i]),
            "_kalin": float(kalin[i]),
            "_d": (float(d[0][i]), float(d[1][i]), float(d[2][i])),
            "_kenar": x0 < pay or y0 < pay or x1 > W - pay or y1 > H - pay,
        })
    liste.sort(key=lambda b: (b["kutu"][1], b["kutu"][0]))

    for no, b in enumerate(liste, 1):
        b["no"] = no
        x0, y0, x1, y1 = b["kutu"]
        b["renk"] = renk_sinifi(*b["_d"], a)
        if b["_kenar"]:
            b["neden"] = "kenar"
        elif x1 - x0 > a.sayfa_cizgi * W or y1 - y0 > a.sayfa_cizgi * H:
            b["neden"] = "kagit-kenari"
        else:
            b["neden"] = None
        b["sayilir"] = b["neden"] is None
    # leke kalınlığı yazının boyuna göre (delgi deliği, spiral)
    xh = kucuk_harf_yuksekligi(liste)
    for b in liste:
        if not b["sayilir"]:
            continue
        if b["_kalin"] > a.leke_kat * xh:
            b["neden"] = "leke"
        elif b["renk"] == "kalem":
            b["neden"] = "kalem"
        b["sayilir"] = b["neden"] is None
    return liste, lab


def kucuk_harf_yuksekligi(liste: list[dict]) -> float:
    """Sayılan bileşenlerin yükseklik medyanı çevresinde (0.5–1.5×) ikinci medyan."""
    h = np.array([b["kutu"][3] - b["kutu"][1] for b in liste if b["sayilir"]], float)
    if len(h) == 0:
        return 0.0
    m = np.median(h)
    orta = h[(h >= 0.5 * m) & (h <= 1.5 * m)]
    return float(np.median(orta)) if len(orta) else float(m)


def _birlik(n):
    ata = list(range(n))

    def bul(i):
        while ata[i] != i:
            ata[i] = ata[ata[i]]
            i = ata[i]
        return i

    def birlestir(i, j):
        ri, rj = bul(i), bul(j)
        if ri != rj:
            ata[max(ri, rj)] = min(ri, rj)

    return bul, birlestir


def satirlara_ayir(liste: list[dict], xh: float, a: SatirAyar = SatirAyar()) -> int:
    """Her sayılan bileşene `satir` (1'den) yazar; sayılmayana None. Satır sayısını döner."""
    say = [b for b in liste if b["sayilir"]]
    for b in liste:
        b["satir"] = None
    if not say or xh <= 0:
        return 0

    def boy(b):
        return b["kutu"][3] - b["kutu"][1], b["kutu"][2] - b["kutu"][0]

    govde, kucuk, buyuk = [], [], []
    for b in say:
        h, w = boy(b)
        if h < a.kucuk_kat * xh:
            # nokta, şapka (ğ), virgül → küçük; eksi, alt çizgi gibi yassılar → örtüşmeye bak
            (kucuk if w < xh else buyuk).append(b)
        elif h > a.buyuk_kat * xh:
            buyuk.append(b)
        else:
            govde.append(b)

    # 1) gövdeleri bağla
    k = np.array([b["kutu"] for b in govde], float).reshape(-1, 4)
    h = k[:, 3] - k[:, 1]
    c0 = k[:, 1] + 0.2 * h          # çekirdek: kutunun orta %60'ı
    c1 = k[:, 3] - 0.2 * h
    bul, birlestir = _birlik(len(govde))
    for i in range(len(govde)):
        ort = np.minimum(c1[i], c1) - np.maximum(c0[i], c0)
        kisa = np.minimum(c1[i] - c0[i], c1 - c0)
        bosluk = np.maximum(k[:, 0] - k[i, 2], k[i, 0] - k[:, 2])
        es = np.nonzero((ort >= a.ortusme * kisa) & (bosluk <= a.yatay_bosluk * xh))[0]
        for j in es:
            if j > i:
                birlestir(i, int(j))
    gruplar: dict[int, list[dict]] = {}
    for i, b in enumerate(govde):
        gruplar.setdefault(bul(i), []).append(b)
    # tek kalan kısa gövde (virgül, kısa işaret) bağımsız satır olmasın: örtüşmeye bak
    satirlar, tekler = [], set()
    for g in gruplar.values():
        if len(g) == 1 and boy(g[0])[0] < 1.2 * xh:
            buyuk.append(g[0]); tekler.add(id(g[0]))
        else:
            satirlar.append(g)

    def satir_kutu(s):
        kk = np.array([b["kutu"] for b in s])
        return kk[:, 0].min(), kk[:, 1].min(), kk[:, 2].max(), kk[:, 3].max()

    kutular = [satir_kutu(s) for s in satirlar]

    # 2) küçükler: yatayda örtüşen en yakın gövdenin satırı
    gidx = {id(b): si for si, s in enumerate(satirlar) for b in s}
    for b in kucuk:
        x0, y0, x1, y1 = b["kutu"]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        en, en_d = None, None
        for g in govde:
            if id(g) in tekler:
                continue
            gx0, gy0, gx1, gy1 = g["kutu"]
            if gx0 - 0.3 * xh <= cx <= gx1 + 0.3 * xh:
                dd = 0.0 if gy0 <= cy <= gy1 else min(abs(cy - gy0), abs(cy - gy1))
                if dd <= 2.0 * xh and (en_d is None or dd < en_d):
                    en, en_d = g, dd
        if en is not None:
            satirlar[gidx[id(en)]].append(b)
        else:
            buyuk.append(b)  # yakın gövde yok: satır örtüşmesine bak

    # 3) büyükler (ve yetim küçükler): en çok dikey örtüşen, yatayda yakın satır
    for b in buyuk:
        x0, y0, x1, y1 = b["kutu"]
        en, en_o = None, 0.0
        for si, (sx0, sy0, sx1, sy1) in enumerate(kutular):
            if x1 < sx0 - a.yatay_bosluk * xh or x0 > sx1 + a.yatay_bosluk * xh:
                continue
            o = min(y1, sy1) - max(y0, sy0)
            if o > en_o:
                en, en_o = si, o
        if en is not None and en_o >= 0.3 * min(y1 - y0, kutular[en][3] - kutular[en][1]):
            satirlar[en].append(b)
        else:
            satirlar.append([b])
            kutular.append(satir_kutu([b]))

    # 4) tek başına kalan küçük leke ve sadece yassı çizgilerden oluşan "satır"
    #    (masa dokusu, kâğıt kenarı) atlasa sayılmaz
    kalan = []
    for s in satirlar:
        if len(s) == 1 and s[0]["alan"] < a.yalniz_alan * xh * xh:
            s[0].update(sayilir=False, neden="yalniz")
        elif max(boy(b)[0] for b in s) < a.yassi_kat * xh:
            for b in s:
                b.update(sayilir=False, neden="yassi")
        else:
            kalan.append(s)
    satirlar = kalan

    # 5) sıra: üstten alta, soldan sağa (satırın gövde ortası)
    def anahtar(s):
        x0, y0, x1, y1 = satir_kutu(s)
        return (round((y0 + y1) / 2 / xh), x0)

    satirlar.sort(key=anahtar)
    for no, s in enumerate(satirlar, 1):
        for b in s:
            b["satir"] = no
    return len(satirlar)
