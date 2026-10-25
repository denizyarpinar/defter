"""Varsayılan yollar ve "veri repoya girmez" koruması."""
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

GIRDI = Path(r"C:\Users\yarpi\iCloudDrive\uni_plan_claude_code\el-yazisi-orijinal")
CIKTI = Path(r"C:\Users\yarpi\Projeler\defter-test-dosyalari\atlas")
# onay görselleri (Deniz'in baktığı yer; fotoğraf klasörü değil)
ONAY = Path(r"C:\Users\yarpi\iCloudDrive\uni_plan_claude_code\Claude outputs\atlas-6.4d")


def _icinde(yol: Path, kok: Path) -> bool:
    try:
        yol.resolve().relative_to(kok.resolve())
        return True
    except ValueError:
        return False


def cikti_kontrol(cikti: Path, girdi: Path | None = None) -> Path:
    """Çıktı yolu repo içindeyse (ya da girdi klasörüne yazacaksa) durur."""
    cikti = Path(cikti)
    if _icinde(cikti, REPO):
        raise SystemExit(
            f"Çıktı yolu repo içinde: {cikti}\n"
            f"Fotoğraf ve kesitler repoya girmez. Repo dışında bir klasör ver (ör. {CIKTI})."
        )
    if girdi is not None and _icinde(cikti, Path(girdi)):
        raise SystemExit(f"Çıktı yolu girdi klasörünün içinde: {cikti}\nGirdi klasörüne yazılmaz.")
    return cikti
