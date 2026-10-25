"""Eksik karakterleri gerçek parçalardan türetme (uydurma yok).

Parçalar:
- üst işaret (nokta, iki nokta, şapka) = örneğin `ek` bileşenleri (Dek),
- çengel (ç, ş) = gövdenin alt ucuna bağlı bütün parça (ek bileşense o), harfin alt ortasına.
Kurallar `KURALLAR`'da. Kaynağı olmayan karakter `eksikler`e yazılır.

Örnek (atlas ölçeğinde): {"D", "Dg" (gövde), "Dek" (ek, yoksa None), "taban", "ids"}.
"""
import numpy as np
from scipy import ndimage as ndi

# hedef: (taban, işlem, işaret kaynakları sırayla)
KURALLAR = {
    "Ç": ("C", "alt", ["ç", "ş"]),
    "Ş": ("S", "alt", ["ş", "ç"]),
    "Ö": ("O", "ust", ["ö", "ü", "ä"]),
    "Ü": ("U", "ust", ["ü", "ö", "ä"]),
    "Ä": ("A", "ust", ["ä", "ö", "ü"]),
    "Ğ": ("G", "ust", ["ğ"]),
    "İ": ("I", "ust", ["i", "j"]),
    "ä": ("a", "ust", ["ö", "ü"]),
    "ö": ("o", "ust", ["ü", "ä"]),
    "ü": ("u", "ust", ["ö", "ä"]),
    "ş": ("s", "alt", ["ç"]),
    "ç": ("c", "alt", ["ş"]),
    "ı": ("i", "govde", []),
}


# şapkası (breve) olan hedefler: nokta gibi kısa işaret kullanılmaz
SAPKALI = {"Ğ"}


def sapka_mi(Di: np.ndarray, xh: float = 40.0, esik: float = 0.25) -> bool:
    """Şapka: en/boy ≥ 1.4 ve en ≥ 0.25·xh (nokta değil)."""
    k = _kutu(np.where(Di > esik, Di, 0))
    if k is None:
        return False
    w, h = k[2] - k[0], k[3] - k[1]
    return w >= 1.4 * h and w >= 0.25 * xh


def birlestir(parcalar) -> tuple[np.ndarray, float]:
    """[(D, x, y)] ortak koordinatta toplanır. Dönen: D, kutunun üstünün y'si (oy)."""
    x0 = min(x for _, x, _ in parcalar); y0 = min(y for _, _, y in parcalar)
    x1 = max(x + D.shape[1] for D, x, _ in parcalar); y1 = max(y + D.shape[0] for D, _, y in parcalar)
    T = np.zeros((int(y1 - y0), int(x1 - x0)), np.float32)
    for D, x, y in parcalar:
        T[int(y - y0):int(y - y0) + D.shape[0], int(x - x0):int(x - x0) + D.shape[1]] += D
    return T, y0


def _kutu(D: np.ndarray):
    ys, xs = np.nonzero(D > 0)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def ust_isaret(o: dict):
    """(işaret D, gövde üstü − işaret altı boşluğu, işaret ortası − gövde ortası) ya da None."""
    if o.get("Dek") is None:
        return None
    ke, kg = _kutu(o["Dek"]), _kutu(o["Dg"])
    if ke is None or kg is None or ke[3] > kg[1] + 0.3 * (kg[3] - kg[1]):
        return None  # işaret gövdenin üstünde değil
    x0, y0, x1, y1 = ke
    return o["Dek"][y0:y1, x0:x1], kg[1] - y1, (x0 + x1) / 2 - (kg[0] + kg[2]) / 2


def cengel(o: dict, xh: float = 40.0, esik: float = 0.25):
    """Çengel D'si (gövdenin alt ucuna bağlı bütün parça) ya da None.

    Ayrı bileşense (`Dek`, gövdenin altında) o. Bitişikse: gövde = sol %40 sütunlarda en alt
    mürekkebin (yayın dibi) üstü, 2 px genişletilir; çengel = mürekkep − genişletilmiş gövde
    içinde gövdeye değen ve dibin altına inen bağlı parçalar (yumuşak kenarıyla).
    Çok küçük parça (alan < 0.02·xh²) çengel sayılmaz.
    """
    D = o["D"]
    en_az = 0.02 * xh * xh
    if o.get("Dek") is not None:
        ke, kg = _kutu(o["Dek"]), _kutu(o["Dg"])
        if ke is not None and kg is not None and ke[1] > (kg[1] + kg[3]) / 2:
            x0, y0, x1, y1 = ke
            Dc = o["Dek"][y0:y1, x0:x1]
            return Dc if (Dc > esik).sum() >= en_az else None
    m = D > esik
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    sol = xs < xs.min() + 0.4 * (xs.max() + 1 - xs.min())
    dip = int(ys[sol].max())
    if dip >= ys.max() - 1:
        return None                                    # yayın altında iz yok
    satir = np.arange(D.shape[0])[:, None]
    govde = ndi.binary_dilation(m & (satir <= dip), iterations=2)
    lab, n = ndi.label(m & ~govde, np.ones((3, 3)))
    temas = ndi.binary_dilation(govde, iterations=1)
    sec = np.zeros_like(m)
    for i in range(1, n + 1):
        p = lab == i
        if (p & temas).any() and np.nonzero(p)[0].max() > dip:
            sec |= p
    if sec.sum() < en_az:
        return None
    # yumuşak kenar: parçanın 2 px çevresi, gövdenin kendi mürekkebi hariç
    alan = ndi.binary_dilation(sec, iterations=2) & ~(m & ~sec & (satir <= dip))
    Dc = np.where(alan, D, 0.0).astype(np.float32)
    x0, y0, x1, y1 = _kutu(Dc)
    return Dc[y0:y1, x0:x1]


def ust_ekle(baz: dict, isaret) -> dict:
    Di, bosluk, _ = isaret
    kg = _kutu(baz["D"])
    cx = (kg[0] + kg[2]) / 2
    y = kg[1] - bosluk - Di.shape[0]
    D, oy = birlestir([(baz["D"], 0, 0), (Di, round(cx - Di.shape[1] / 2), round(y))])
    return {"D": D, "taban": baz["taban"] - oy}


def alt_ekle(baz: dict, Dc: np.ndarray, esik: float = 0.25) -> dict:
    """Çengel harfin alt ortasına: x = alt %25'teki mürekkebin ortası; çengelin üst ucu o
    sütunda harfin en alt mürekkep satırına 1 px biner."""
    D = baz["D"]
    m = D > esik
    ys, xs = np.nonzero(m)
    alt = ys >= ys.max() - 0.25 * (ys.max() + 1 - ys.min())
    cx = float(xs[alt].mean())
    sut = m[:, max(0, int(cx) - 2):int(cx) + 3]
    y_alt = int(np.nonzero(sut.any(1))[0].max()) if sut.any() else int(ys.max())
    mc = Dc > esik
    c_ust_y = int(np.nonzero(mc.any(1))[0].min())
    c_ust_x = float(np.nonzero(mc[c_ust_y:c_ust_y + 3])[1].mean())   # üst ucun ortası
    T, oy = birlestir([(D, 0, 0), (Dc, round(cx - c_ust_x), y_alt - 1 - c_ust_y)])
    return {"D": T, "taban": baz["taban"] - oy}


def turet(karakterler: dict, hedefler) -> tuple[dict, dict, list]:
    """Atlasta olmayan hedefleri türetir. Dönen: yeni örnekler, açıklamalar, eksikler."""
    yeni, aciklama, eksik = {}, {}, []
    for k in hedefler:
        if karakterler.get(k):
            continue
        kural = KURALLAR.get(k)
        if kural is None:
            eksik.append(k); continue
        baz_k, islem, kaynaklar = kural
        bazlar = karakterler.get(baz_k) or yeni.get(baz_k) or []
        if not bazlar:
            eksik.append(k); continue
        if islem == "govde":
            orn = [{"D": b["Dg"], "taban": b["taban"], "ids": b["ids"][:1]} for b in bazlar
                   if b.get("Dek") is not None]
            if orn:
                yeni[k] = [dict(o, turetilmis=True, kaynak=o["ids"]) for o in orn]
                aciklama[k] = f"{baz_k} gövdesi (noktasız)"
            else:
                eksik.append(k)
            continue
        al = ust_isaret if islem == "ust" else cengel
        parca, kaynak_k = [], None
        for kk in kaynaklar:
            for o in karakterler.get(kk, []):
                p = al(o)
                if p is not None and k in SAPKALI and not sapka_mi(p[0]):
                    p = None                       # şapka nokta gibi: kullanılmaz
                if p is not None:
                    # üst işarette sadece ek bileşenleri, çengelde bütün örnek kaynaktır
                    parca.append((p, o["ids"][1:] if islem == "ust" else o["ids"]))
            if parca:
                kaynak_k = kk
                break
        if not parca:
            eksik.append(k); continue
        ekle = ust_ekle if islem == "ust" else alt_ekle
        orn = []
        for i, b in enumerate(bazlar):
            p, pid = parca[i % len(parca)]
            o = ekle(b, p)
            o.update(ids=b["ids"] + pid, turetilmis=True, kaynak=b["ids"] + pid)
            orn.append(o)
        yeni[k] = orn
        aciklama[k] = f"{baz_k} + {kaynak_k} {'işareti' if islem == 'ust' else 'çengeli'}"
    return yeni, aciklama, eksik
