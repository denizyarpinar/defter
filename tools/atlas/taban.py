"""Taban çizgisi: satır başına, tabanı inmeyen harflerin alt kenarından doğru.

Her örnekte `taban` = harf kutusunun üstünden (y0) taban çizgisine uzaklık (px).
Tabanı inmeyen harfte ≈ kutu yüksekliği; g p q y j gibi inenlerde daha küçük.
"""
import numpy as np

# alt kenarı tabana oturan karakterler (ç ş çengeli, f g j p q y iner; noktalama dışarıda)
TABANLI = set("abcdehiklmnorstuvwxzäöüı") | set("ABCDEFGHIKLMNOPRSTUVWXYZÄÖÜİĞ") | set("0123456789")


def dogru_uydur(noktalar, xh: float, esik: float = 0.15) -> tuple[float, float] | None:
    """(x, y) noktalarından y = m·x + c. Artığı > esik·xh olanlar atılıp yeniden uydurulur.

    2'den az nokta: yatay doğru (medyan y). Hiç nokta yoksa None.
    """
    p = np.asarray(noktalar, float).reshape(-1, 2)
    if len(p) == 0:
        return None
    if len(p) < 3 or np.ptp(p[:, 0]) < xh:
        return 0.0, float(np.median(p[:, 1]))
    tut = np.ones(len(p), bool)
    for _ in range(3):
        m, c = np.polyfit(p[tut, 0], p[tut, 1], 1)
        artik = np.abs(p[:, 1] - (m * p[:, 0] + c))
        # önce medyan tabanlı kaba eleme (tek aykırı nokta doğruyu çok çekmesin)
        yeni = artik <= max(esik * xh, np.median(artik[tut]) * 2.5) if _ == 0 else artik <= esik * xh
        if yeni.sum() < 2 or (yeni == tut).all():
            break
        tut = yeni
    m, c = np.polyfit(p[tut, 0], p[tut, 1], 1)
    return float(m), float(c)


def satir_tabanlari(ornekler: list[dict], govdeler: dict, xh: dict) -> dict:
    """(foto, satir) → (m, c). ornekler: {foto, satir, karakter, kutu}; govdeler: (foto, satir) →
    satırdaki sayılan bileşen kutuları (yedek); xh: foto → px."""
    noktalar: dict = {}
    for o in ornekler:
        if o.get("karakter") in TABANLI:
            x0, y0, x1, y1 = o["kutu"]
            noktalar.setdefault((o["foto"], o["satir"]), []).append(((x0 + x1) / 2, y1))
    sonuc = {}
    for anahtar in set(noktalar) | {(o["foto"], o["satir"]) for o in ornekler}:
        foto = anahtar[0]
        d = dogru_uydur(noktalar.get(anahtar, []), xh[foto])
        if d is None:
            # etiketli tabanlı harf yok: satırdaki gövdelerin alt kenarlarının alt-orta değeri
            kk = np.array(govdeler.get(anahtar, []), float).reshape(-1, 4)
            if len(kk) == 0:
                continue
            d = (0.0, float(np.percentile(kk[:, 3], 40)))
        sonuc[anahtar] = d
    return sonuc


def taban_konumu(kutu, dogru) -> float:
    """Kutu içinde (y0'dan) taban çizgisinin yeri; doğru kutunun yatay ortasında okunur."""
    x0, y0, x1, _ = kutu
    m, c = dogru
    return m * (x0 + x1) / 2 + c - y0
