"""Harf atlası üretimi. Giriş: `python tools/atlas/uret.py kesit | etiket-kontrol | atlas | onay | paket | referans`.

Girdi klasörü sadece okunur. Çıktı repo dışında olmalı (yollar.cikti_kontrol).
"""
import argparse
import json
import sys
import time
from collections import Counter
from dataclasses import fields
from pathlib import Path

import murekkep
import satirlar
import kesit
from yollar import CIKTI, GIRDI, ONAY, cikti_kontrol


def _ayar_argumanlari(p: argparse.ArgumentParser, sinif) -> None:
    for f in fields(sinif):
        p.add_argument("--" + f.name.replace("_", "-"), type=type(f.default), default=None,
                       help=f"varsayılan {f.default}")


def _ayar(args, sinif):
    deger = {f.name: getattr(args, f.name) for f in fields(sinif) if getattr(args, f.name) is not None}
    return sinif(**deger)


def kesit_uret(girdi: Path, cikti: Path, e: murekkep.Esikler, a: satirlar.SatirAyar,
               sadece: list[str] | None = None) -> dict:
    hedef = cikti_kontrol(cikti, girdi) / "1-kesit"
    hedef.mkdir(parents=True, exist_ok=True)
    fotolar = sorted(p for p in girdi.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    if sadece:
        fotolar = [p for p in fotolar if p.stem in sadece]
    if not fotolar:
        raise SystemExit(f"Girdi klasöründe fotoğraf yok: {girdi}")

    ozet = {"esikler": e.sozluk(), "satir_ayar": a.sozluk(), "fotolar": {}}
    for p in fotolar:
        t = time.time()
        ad = p.stem
        src = murekkep.foto_oku(p)
        r = murekkep.oran(src, e)
        m = murekkep.maske(r, e)
        liste, lab = satirlar.bilesenler(m, r, a)
        xh = satirlar.kucuk_harf_yuksekligi(liste)
        n_satir = satirlar.satirlara_ayir(liste, xh, a)

        for eski in hedef.glob(f"{ad}-s[0-9][0-9]*.png"):  # önceki çalıştırmanın kesitleri
            eski.unlink()
        kesit.maske_onizleme(hedef / f"{ad}-maske.png", lab, liste)
        for s in range(1, n_satir + 1):
            uyeler = [b for b in liste if b["satir"] == s]
            kesit.satir_kesiti(hedef / f"{ad}-s{s:02d}.png", ad, src, lab, uyeler, xh)

        kayit = [{
            "no": b["no"], "id": f"{ad}#{b['no']}", "kutu": b["kutu"], "alan": b["alan"],
            "satir": b["satir"], "renk": b["renk"], "sayilir": b["sayilir"], "neden": b["neden"],
            "koyuluk": [round(v, 3) for v in b["_d"]], "kalin": round(b["_kalin"], 1),
        } for b in liste]
        (hedef / f"{ad}-bilesenler.json").write_text(
            json.dumps({"foto": p.name, "boyut": [int(src.shape[1]), int(src.shape[0])],
                        "kucuk_harf_px": round(xh, 1), "bilesenler": kayit},
                       ensure_ascii=False, indent=1), encoding="utf-8")

        sayilan = [b for b in liste if b["sayilir"]]
        ozet["fotolar"][ad] = {
            "satir": n_satir,
            "bilesen": len(sayilan),
            "atilan": dict(Counter(b["neden"] for b in liste if not b["sayilir"])),
            "renk": dict(Counter(b["renk"] for b in sayilan)),
            "kucuk_harf_px": round(xh, 1),
        }
        print(f"{ad}: {n_satir} satır, {len(sayilan)} bileşen, xh {xh:.0f} px "
              f"({time.time() - t:.0f} sn)", flush=True)

    if not sadece:
        (hedef / "ozet.json").write_text(json.dumps(ozet, ensure_ascii=False, indent=2), encoding="utf-8")
    return ozet


def etiket_kontrol(cikti: Path) -> dict:
    import atlas_kur
    kayit, _ = atlas_kur.bilesenleri_oku(cikti / "1-kesit")
    k = atlas_kur.kontrol(atlas_kur.etiketleri_oku(cikti / "2-etiket" / "etiket.json"), kayit)
    for h in k["hata"]:
        print("HATA:", h)
    for u in k["uyari"][:20]:
        print("uyarı:", u)
    print("sayılar:", " ".join(f"{c}{k['sayi'][c]}" for c in atlas_kur.HEDEF if k["sayi"][c]))
    print("4'ten az:", " ".join(f"{c}{n}" for c, n in k["az"].items()) or "yok")
    print("hiç yok:", " ".join(k["eksik"]) or "yok")
    return k


def onay_uret(cikti: Path, girdi: Path, onay_dir: Path) -> None:
    import atlas_kur
    import onay
    onay_dir = cikti_kontrol(onay_dir, girdi)
    onay_dir.mkdir(parents=True, exist_ok=True)
    atlas = atlas_kur.atlas_yukle(cikti / "3-atlas")
    kesit_dir = cikti / "1-kesit"
    # koyuluk: yumuşak stilde fark > %15 ise rengin yoğunluğu ölçeklenir ve atlas.json'a yazılır
    koyu = onay.koyuluk_olc(atlas, girdi, kesit_dir)
    yol = cikti / "3-atlas" / "atlas.json"
    j = json.loads(yol.read_text(encoding="utf-8"))
    j["renkler"], j["koyuluk"] = atlas["renkler"], koyu
    yol.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
    onay.alfabe(atlas, onay_dir / "alfabe.png")
    e1 = onay.karsilastir_1(atlas, girdi, kesit_dir, onay_dir / "karsilastir-1.png")
    e2 = onay.karsilastir_2(atlas, onay_dir / "karsilastir-2.png")
    e3 = onay.karsilastir_3(atlas, girdi, kesit_dir, onay_dir / "karsilastir-3.png")
    notlar = onay.koyuluk_tablosu(koyu) + [
        "", f"karsilastir-1 eksik: {' '.join(e1) or 'yok'}", f"karsilastir-2 eksik: {' '.join(e2) or 'yok'}",
        f"karsilastir-3 eksik: {' '.join(e3) or 'yok'}"]
    print(onay.kapsama(atlas, onay_dir / "kapsama.txt", notlar))


def paket_uret(cikti: Path) -> dict:
    import atlas_kur
    import paket
    hedef = cikti_kontrol(Path(cikti) / "4-paket")   # okumadan önce: çıktı repo dışında mı
    r = paket.uret(atlas_kur.atlas_yukle(Path(cikti) / "3-atlas"), hedef)
    b = r["boyut"]
    print(f"kodlama {r['kodlama']}, {r['karakter']} karakter, {r['ornek']} örnek, "
          f"sayfa {r['sayfa']['w']}×{r['sayfa']['h']} px")
    for k, v in r["fark"].items():
        print(f"  basım farkı ({k}): " + ", ".join(f"{s} {d}/255" for s, d in v.items()))
    print(f"  boyut: png {b['png'] / 1024:.0f} KB, json {b['json'] / 1024:.0f} KB, "
          f"toplam {b['toplam'] / 1024 / 1024:.2f} MB")
    return r


def referans_uret(cikti: Path) -> dict:
    import referans
    hedef = cikti_kontrol(Path(cikti) / "5-referans")
    r = referans.uret(Path(cikti) / "4-paket", hedef)
    print(f"{r['satir']} satır → {r['hedef']}")
    return r


def main(argv=None) -> None:
    # Windows konsolu (cp1252) "→" gibi karakterlerde çöker
    for akis in (sys.stdout, sys.stderr):
        if hasattr(akis, "reconfigure"):
            akis.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="Harf atlası (6.4d)")
    alt = p.add_subparsers(dest="komut", required=True)
    k = alt.add_parser("kesit", help="mürekkep maskesi, bileşenler, satır kesitleri")
    k.add_argument("--girdi", type=Path, default=GIRDI)
    k.add_argument("--cikti", type=Path, default=CIKTI)
    k.add_argument("--foto", nargs="*", help="sadece bu fotolar (ör. IMG_1570); ozet.json yazılmaz")
    _ayar_argumanlari(k, murekkep.Esikler)
    _ayar_argumanlari(k, satirlar.SatirAyar)
    for ad, yardim in (("etiket-kontrol", "etiket.json kontrolü ve karakter sayıları"),
                       ("atlas", "taban, seçim, yoğunluk, türetme, aday sayfaları"),
                       ("onay", "onay görselleri ve kapsama.txt"),
                       ("paket", "tarayıcı paketi (4-paket: png + json) ve doğrulama"),
                       ("referans", "6.4e eşdeğerlik referansı (4-paket ile basılan satırlar → 5-referans)")):
        q = alt.add_parser(ad, help=yardim)
        q.add_argument("--girdi", type=Path, default=GIRDI)
        q.add_argument("--cikti", type=Path, default=CIKTI)
        if ad == "onay":
            q.add_argument("--onay", type=Path, default=ONAY)
    args = p.parse_args(argv)
    if args.komut == "etiket-kontrol":
        etiket_kontrol(args.cikti)
    elif args.komut == "atlas":
        import atlas_kur
        j = atlas_kur.kur(cikti_kontrol(args.cikti, args.girdi), args.girdi)
        print(f"{len(j['karakterler'])} karakter, türetilen {len(j['turetilenler'])}, "
              f"eksik: {' '.join(j['eksikler']) or 'yok'}")
    elif args.komut == "onay":
        onay_uret(cikti_kontrol(args.cikti, args.girdi), args.girdi, args.onay)
    elif args.komut == "paket":
        paket_uret(cikti_kontrol(args.cikti, args.girdi))
    elif args.komut == "referans":
        referans_uret(cikti_kontrol(args.cikti, args.girdi))
    elif args.komut == "kesit":
        kesit_uret(args.girdi, args.cikti, _ayar(args, murekkep.Esikler),
                   _ayar(args, satirlar.SatirAyar), args.foto)


if __name__ == "__main__":
    main()
