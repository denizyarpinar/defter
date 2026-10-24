"""Harf atlası üretimi. Tek giriş: `python tools/atlas/uret.py kesit`.

Girdi klasörü sadece okunur. Çıktı repo dışında olmalı (yollar.cikti_kontrol).
"""
import argparse
import json
import time
from collections import Counter
from dataclasses import fields
from pathlib import Path

import murekkep
import satirlar
import kesit
from yollar import CIKTI, GIRDI, cikti_kontrol


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


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Harf atlası (6.4d)")
    alt = p.add_subparsers(dest="komut", required=True)
    k = alt.add_parser("kesit", help="mürekkep maskesi, bileşenler, satır kesitleri")
    k.add_argument("--girdi", type=Path, default=GIRDI)
    k.add_argument("--cikti", type=Path, default=CIKTI)
    k.add_argument("--foto", nargs="*", help="sadece bu fotolar (ör. IMG_1570); ozet.json yazılmaz")
    _ayar_argumanlari(k, murekkep.Esikler)
    _ayar_argumanlari(k, satirlar.SatirAyar)
    args = p.parse_args(argv)
    if args.komut == "kesit":
        kesit_uret(args.girdi, args.cikti, _ayar(args, murekkep.Esikler),
                   _ayar(args, satirlar.SatirAyar), args.foto)


if __name__ == "__main__":
    main()
