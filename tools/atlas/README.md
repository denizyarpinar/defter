# tools/atlas – el yazısı harf atlası (6.4d)

Okunan metni (6.4c) arkadaşımızın gerçek el yazısıyla göstermek için defter
fotoğraflarından gerçek mürekkep harf görüntüleri çıkarılır. Font değil, fotoğraftaki
mürekkep. Uygulamaya (package.json, src/) bağlı değildir; ayrı bir Python aracıdır.

## Veri repoya girmez
- Fotoğraflar, maskeler, kesitler ve atlas **asla** repoya girmez.
- Girdi (sadece okunur): `C:\Users\yarpi\iCloudDrive\uni_plan_claude_code\el-yazisi-orijinal\`
- Çıktı: `C:\Users\yarpi\Projeler\defter-test-dosyalari\atlas\`
- Çıktı yolu repo içindeyse (ya da girdi klasörüyse) betik durur (`yollar.cikti_kontrol`).
- `.gitignore`: `tools/atlas/.venv/` ve `tools/atlas/**` altındaki png/jpg/jpeg/npy.

## Kurulum (bir kez)
Python 3.13 (3.15 için scipy hazır paketi olmayabilir):
```
py -3.13 -m venv tools/atlas/.venv
tools/atlas/.venv/Scripts/python -m pip install -r tools/atlas/requirements.txt
```

## Çalıştırma
Repo kökünden:
```
tools/atlas/.venv/Scripts/python tools/atlas/uret.py kesit
```
- Bir foto: `... kesit --foto IMG_1570` (ozet.json yazılmaz).
- Eşikler parametredir: `--yesil-esik 0.68`, `--kirmizi-min 0.72`, `--min-alan 60` …
  (`... kesit --help`). Kullanılan değerler `ozet.json`'a yazılır.
- Foto başına ~50 sn (4284×5712).

Testler (pytest yok): `tools/atlas/.venv/Scripts/python tools/atlas/test_murekkep.py`

## Adımlar
1. **Mürekkep** (`murekkep.py`): EXIF yönü → kanal başına kâğıt arka planı
   (median 9 → maximum 61 → uniform 61) → oran = görüntü / arka plan (0–1) →
   maske: yeşil oran < 0.68 ya da kırmızı kuralı (kırmızı oran yüksek, yeşil düşük) →
   3×3 açma → en kalın yeri 2.5 px'ten ince parçalar (koyu kare çizgisi artığı) silinir.
   Kareli kâğıdın çizgileri maskeye girmez.
2. **Bileşenler ve satırlar** (`satirlar.py`): 8-komşu bağlı bileşenler; küçük
   gürültü atılır. Numara foto içinde (üst, sol) sırasıyla: `IMG_1570#123`.
   Renk: mavi / kırmızı / yeşil / siyah; kurşun kalem sayılmaz. Atlasa sayılmayanlar
   `sayilir: false` + `neden`: `kenar` (spiral, masa), `leke` (delgi deliği),
   `kagit-kenari`, `kalem`, `yalniz` (tek başına küçük leke), `yassi` (yazısız çizgi).
   Satır: gövdeler dikeyde örtüşüp yatayda yakınsa aynı satır; noktalar/şapkalar
   altındaki ya da üstündeki gövdenin satırına.
3. **Kesitler** (`kesit.py`) → `atlas\1-kesit\`:
   - `<foto>-maske.png`: renkli maske önizlemesi (turuncu = sayılmayan).
   - `<foto>-sNN.png`: üstte orijinal, altta maske, aralarında bileşen numaraları.
   - `<foto>-bilesenler.json`: `no, id, kutu [x0,y0,x1,y1], alan, satir, renk, sayilir, neden`.
   - `ozet.json`: foto başına satır/bileşen sayısı, atılanlar, renk dağılımı,
     küçük harf yüksekliği (px), kullanılan eşikler.

Sonraki adımlar: 6.4d-2 etiketleme, 6.4d-3 paket + Drive, 6.4e okuyucuda çizim.
