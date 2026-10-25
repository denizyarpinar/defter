"""Renk kuralı ölçümü: her fotoda bileşen başına kanal koyuluğu (`_d`), alan ve renk → JSON.

`python tools/atlas/renk_olc.py <cikis.json>` (repo dışında; repo içi yol → durur).
Fotoğrafları sadece okur. Foto başına ~50 sn.
"""
import json
import sys
from pathlib import Path

import murekkep
import satirlar
from yollar import GIRDI, cikti_kontrol


def main(argv=None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    hedef = Path(argv[0])
    cikti_kontrol(hedef.parent, GIRDI)
    out = {}
    for p in sorted(GIRDI.iterdir()):
        src = murekkep.foto_oku(p)
        r = murekkep.oran(src)
        m = murekkep.maske(r)
        liste, _ = satirlar.bilesenler(m, r)
        out[p.stem] = [{"no": b["no"], "d": b["_d"], "alan": b["alan"], "renk": b["renk"],
                        "sayilir": b["sayilir"], "neden": b["neden"]} for b in liste]
        print(p.stem, len(liste), flush=True)
    hedef.write_text(json.dumps(out), encoding="utf-8")


if __name__ == "__main__":
    main()
