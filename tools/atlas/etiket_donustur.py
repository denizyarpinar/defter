r"""Etiket kaynağı (elle yazılan metin) → `2-etiket\etiket.json`.

`python tools/atlas/etiket_donustur.py [--cikti …]`. Kaynak: `2-etiket\etiket-kaynak.txt`.
Biçim: `@IMG_1570` foto başlığı, `#` yorum, satırda boşlukla ayrılmış kayıtlar:
  `63:B`          karakter        `84+68:i`      gövde + ek bileşenler
  `106:=ra`       bitişik çift    `102:!parca`   atla (neden)
  `47+48:ö~iz`    karakter, ama örnek atlasa girmez (`haric`: neden)
Sadece çıktı klasörüne yazar (repo içi yol → durur).
"""
import argparse
import json
from pathlib import Path

from yollar import CIKTI, cikti_kontrol


def cozumle(metin: str) -> list[dict]:
    out, foto = [], None
    for satir in metin.splitlines():
        satir = satir.strip()
        if not satir or satir.startswith("#"):
            continue
        if satir.startswith("@"):
            foto = satir[1:]
            continue
        for tok in satir.split():
            ids, _, val = tok.partition(":")
            nos = ids.split("+")
            e = {"id": f"{foto}#{nos[0]}"}
            if nos[1:]:
                e["ek"] = [f"{foto}#{n}" for n in nos[1:]]
            if val.startswith("=") and len(val) > 1:
                e["cift"] = val[1:]
            elif val.startswith("!") and len(val) > 1:
                e["atla"] = val[1:]
            else:
                # "~" karakterin kendisi değilse haric işaretidir (ör. "ö~iz")
                k, isaret, neden = val.partition("~") if len(val) > 1 else (val, "", "")
                e["karakter"] = k
                if isaret:
                    e["haric"] = neden or "elle"
            out.append(e)
    return out


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="etiket-kaynak.txt → etiket.json")
    p.add_argument("--cikti", type=Path, default=CIKTI)
    args = p.parse_args(argv)
    d = cikti_kontrol(args.cikti) / "2-etiket"
    etiketler = cozumle((d / "etiket-kaynak.txt").read_text(encoding="utf-8"))
    (d / "etiket.json").write_text(json.dumps({"surum": 1, "etiketler": etiketler}, ensure_ascii=False,
                                              indent=0), encoding="utf-8")
    print(len(etiketler), "etiket,", sum("haric" in e for e in etiketler), "haric")


if __name__ == "__main__":
    main()
