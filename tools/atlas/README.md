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
   Renk (koyuluk = 1 − oran): kırmızı, yeşil, sonra mavi = dB / max(dR, dG) < 0.84 (asıl
   mürekkep mavi tükenmez ≈ 0.60–0.82), renksiz ve açık = kurşun kalem (sayılmaz), kalan siyah
   (Türkçe çevirilerdeki siyah kalem ≈ 0.90–1.0). Atlasa sayılmayanlar
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

4. **Etiket** (`atlas\2-etiket\etiket.json`, elle; API yok):
   `{ "surum": 1, "etiketler": [ { "id": "IMG_1570#63", "karakter": "B" }, ... ] }`.
   Her kayıtta tek alan: `karakter` (tek harf) | `cift` ("ra", bitişik çift) | `atla` (neden).
   `ek`: aynı örneğe giren başka bileşenler (i/ä/ö/ü/ğ işaretleri, `:`/`?`/`!` parçaları).
   `haric` (neden): etiket doğru, ama örnek atlasa girmez (fazladan iz, leke, nokta gibi şapka…).
   Elle yazılan kaynak `2-etiket\etiket-kaynak.txt` → `... etiket_donustur.py` → `etiket.json`
   (`63:B`, `84+68:i`, `106:=ra`, `102:!parca`, `146+129:ö~fazladan-iz`).
   Kontrol: `... uret.py etiket-kontrol` (hatalı id, iki kez kullanılan id, karakter sayıları).
   Yardımcılar (veriyi sadece repo dışına yazar, `cikti_kontrol`): `etiket_sayfa.py <klasör> IMG_1570 [1,2]`
   (satır başına numaralı bileşen küçük resimleri), `renk_olc.py <dosya.json>` (renk kuralı ölçümü).
5. **Atlas** (`... uret.py atlas`): taban (`taban.py`; satır başına tabanı inmeyen harflerin
   alt kenarından doğru, `taban` = kutu üstünden taban çizgisine px) → yoğunluk (`glif.py`;
   −log(oran) örneğin kendi renk profiline izdüşümü, bileşen maskesi 3 px genişletilmiş +
   1.5 px yumuşatılmış, kâğıt/kare halkası çıkarılır; maske dışı 0; çekirdek medyanı 1) →
   seçim (`secim.py`; karakter başına 2–4, x-yüksekliği 40 px'e normalize; leke, soluk,
   kesik, artık ve `haric` elenir) → türetme (`turet.py`; Ç Ğ İ Ö Ş Ü Ä ı… sadece gerçek
   parçalardan; çengel = gövdenin alt ucuna bağlı bütün parça, harfin alt ortasına bağlanır;
   Ğ'de nokta gibi kısa şapka kullanılmaz) → aralık (`aralik.py`; orijinal satırlardan).
   Çıktı: `2-etiket\aday-<unicode>.png` (çerçeveli = seçilen), `3-atlas\atlas.json`,
   `3-atlas\glif\*.npy` (float16 yoğunluk). Foto kesitleri `3-atlas\onbellek\` (ilk çalıştırma
   foto başına ~50 sn, sonra saniyeler).
6. **Basıcı** (`basici.py`): `bas(metin, renk, atlas, stil="tukenmez")`; örnekler sırayla
   döner, tabanda ±1 px; harf/kelime arası atlas.json `aralik`'tan (maske kutusuyla ölçülür,
   glifin yumuşak kenar payı `pay` her yandan çıkarılır); atlasta olmayan karakter boşluk +
   `eksik` listesi. İki stil, parametreler atlas.json `stiller`'de (6.4e aynısını uygular):
   - `tukenmez` (varsayılan): glif 3× (Lanczos), α = smoothstep(D; e0, e1), doku
     0.80 + 0.20·D/D90, renk = kâğıt + kaplama·(ton − kâğıt), BOX ile küçült; kâğıt tam kâğıt
     rengi. e = önizlemedeki soğurma eşiği (0.10, 0.30) / (yoğunluk·ort(profil)), renk başına.
   - `yumusak`: kâğıt × exp(−D·yoğunluk·profil) + kâğıt gürültüsü.
   Renkler: mavi/kırmızı/yeşil gerçek profil; siyah ve kurşun nötr (türetilmiş). Tükenmezde kurşunun
   eşiği siyahınkiyle aynıdır (6.4d-3; yoğunluğu düşük olduğu için kendi eşiği çok yüksek çıkıyordu), tonu açık kalır.
7. **Onay** (`... uret.py onay`, varsayılan `iCloudDrive\...\Claude outputs\atlas-6.4d\`), tükenmez:
   `alfabe.png`, `karsilastir-1.png` (IMG_1570 satırı, kendi bileşenleri hariç; tükenmez +
   yumuşak), `karsilastir-2.png` (mavi/kırmızı/yeşil), `karsilastir-3.png` (IMG_1571 kırmızı
   Türkçe satır), `kapsama.txt`. Önce koyuluk ölçülür (rengin kendi orijinal satırı); yumuşakta
   fark > %15 ise rengin yoğunluğu ölçeklenir ve atlas.json'a yazılır (`koyuluk`).

8. **Paket** (`... uret.py paket`, `paket.py`) → `atlas\4-paket\` (tarayıcı ve Drive için):
   - `el-yazisi-atlas.png`: tek gri kanal, 8 bit. Örnekler yüksekliğe göre raflara dizilir; aralarında ve
     kenarda 4 px, genişlik ≤ 2048. Örnekler xh = 40 px ölçeğinde (atlastaki gibi).
   - Kodlama: `olcek = 255 / max(D)`. `dogrusal`: piksel = round(D·olcek), D = piksel / olcek.
     `karekok`: piksel = round(√(D·olcek/255)·255), D = (piksel/255)²·255 / olcek. Önce doğrusal denenir;
     basım farkı sınırı geçerse karekök. Sınır stil başına: tükenmez ≤ 5/255, yumuşak ≤ 2/255 (Deniz kararı
     6.4d-3: tükenmezin eşik bölgesi dar, 8 bitle 2'nin altına inilemedi; doğrusal 11, karekök 5, üs 3–4 de 5).
     İkisi de geçerse hiçbir dosya yazılmaz.
   - `el-yazisi-atlas.json`: `{ tur: "defter-el-yazisi", surum: 1, xh, kodlama, olcek, sayfa: {w, h},
     aralik: {harf, kelime}, stiller, renkler: {ad: {p, yogunluk}}, karakterler: {"a": [{x, y, w, h, taban,
     turetilmis?}]}, eksikler }`. `aralik` glif kutuları arasıdır (pay çıkarılmış). `taban` = kutu üstünden
     taban çizgisine px.
   - Pakete girmez: foto adları, bileşen numaraları (`ids`), `puan`, `haric`, `aday`, `koyuluk` tablosu.
   - Doğrulama: paket hem bellekten hem diskten geri okunur, aynı satırlar (5 renk, iki stil) 3-atlas ile
     basılır, en büyük piksel farkı yazılır. Boyutlar da yazılır.
   - Uygulamada şema `src/elYazisi/atlasSema.ts`. Drive yeri `<kitaplık kökü>/_sistem/el-yazisi/`. Yükleme
     dev sayfası `atlas-yukle.html` ile yapılır (`src/elYazisi/atlasYukle.ts`, `atlasDrive.ts`; build'e girmez).
     Gerçek paket kontrolü: `npx vitest run scripts/atlas-paket.test.ts` (paket yoksa atlanır).

Testler: `test_murekkep.py` ve `test_atlas.py` (taban, kâğıtta sıfır yoğunluk, basıcı boyutları,
türetme, çengel, stiller, kurşun eşiği, aralık, `haric`, paket yerleşimi/kodlama/kaynak adı yok,
yardımcıların ve paketin repoya yazmaması). `uret.py` çıktısı UTF-8'e zorlanır (Windows konsolu).

Sonraki adım: 6.4e okuyucuda çizim.
