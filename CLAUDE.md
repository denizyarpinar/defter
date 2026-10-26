# Defter – sanal kitaplık uygulaması

Bu dosya Claude Code'un her oturumda okuduğu proje kurallarıdır. Değiştirmeden önce Deniz'e sor.
Durum ve sıradaki adım: docs/DURUM.md (Codex de aynı dosyayı kullanır).

## Kim için, ne yapıyoruz
- Sahibi: Deniz (Uni Bremen Informatik, 1. dönem). İlk gerçek Claude Code projesi; programlamaya yeni başlıyor.
- Uygulama: Drive'daki notları (PDF, defter fotoğrafı, Claude çıktıları) 3D bir çalışma odasındaki kitaplıkta kitap olarak gösteren web uygulaması. Önce kişisel kullanım.
- Ana cihaz: iPad (Safari, ileride Apple Pencil). İkinci cihaz: Windows laptop (Chrome/Edge). Telefonda da açılabilmeli.

## Deniz ile çalışma kuralları
- Deniz ile **Türkçe** konuş. Kısa ve basit cümleler kur. Teknik bir terimi ilk kullandığında bir cümleyle açıkla.
- Her görevde önce kısa bir plan yaz (hangi dosyalar, ne değişecek), Deniz onaylayınca uygula.
- Görev bitince şunları ver: (1) ne yaptın, 3–5 madde, (2) Deniz'in nasıl deneyeceği, adım adım, (3) bilinen eksikler.
- Büyük bir karar gerekiyorsa (yeni kütüphane, veri formatı değişikliği, dosya silme) önce sor.
- Bir şeyi bilmiyorsan uydurma; söyle ve nasıl öğrenebileceğimizi öner.
- Kapsamın dışına çıkma: sadece verilen görevi yap. Fark ettiğin başka sorunları sona "Sonra bakılabilir" diye listele.

## Teknoloji
- Vite + TypeScript (framework yok, düz DOM). Paket yöneticisi: npm.
- 3D: three.js (npm paketi). Renk yönetimi: `renderer.outputColorSpace = SRGBColorSpace`, ACES tone mapping, PCF gölgeler (yumuşak; PCFSoftShadowMap yeni sürümlerde kaldırıldı).
- Google girişi: Google Identity Services (token client, tarayıcıda). Sunucu yok, client secret yok.
- Drive: Drive REST API v3, `fetch` ile. Kapsam (scope): `https://www.googleapis.com/auth/drive`.
- Yayın: Vercel (statik site). Ortam değişkeni: `VITE_GOOGLE_CLIENT_ID`.
- Sonraki fazlarda: pdf.js (okuma), pdf-lib (çizimleri PDF'e yazma), Blender ile pişirilmiş ışık.

## Komutlar
- `npm run dev` → yerelde çalıştır (http://localhost:5173)
- `npm run build` → yayın sürümünü üret
- `npm run typecheck` → TypeScript hatalarını kontrol et (`tsc --noEmit`)
- Bir görevi bitmiş saymadan önce `npm run typecheck` ve `npm run build` hatasız geçmeli.

## Klasör yapısı
```
referans/prototip.html   ← onaylanmış tıklanabilir prototip (görünüm ve davranışın kaynağı, DEĞİŞTİRME)
src/main.ts              ← giriş noktası
src/model/               ← veri tipleri (Kitaplik, Raf, Kitap, Bolum, Kaynak) ve doğrulama
src/drive/               ← auth.ts (Google girişi), drive.ts (dosya okuma/yazma)
src/scene/               ← three.js: oda, ışık, kamera, kitaplık, kitap, animasyonlar
src/ui/                  ← üst bar, Özelleştir paneli, bildirimler (toast), giriş ekranı
src/styles.css
```

## Prototip kuralı
- `referans/prototip.html` Deniz'in onayladığı tasarım. Oda, ışık, renkler, kamera geçişleri, kitap animasyonları, okuma ekranı ve kalem davranışı oradan alınır.
- Kodu oradan **modüllere bölerek taşı**; davranışı ve görünümü değiştirme. Bir şeyi farklı yapmak gerekiyorsa önce sor.
- Prototipteki örnek kitaplar (BOOKS, DEFAULT_SHELVES) sadece Drive bağlanmadan önceki geçici veridir.

## Veri modeli (Drive)
Drive'da ana dizinde `Kitaplık` klasörü:
```
Kitaplık/
  kitaplik.json            ← raflar (sıralı) ve oda ayarları
  kitaplar/<kitap-id>/     ← her kitap bir klasör; klasör adı = kitap id (küçük harf, tire)
    kitap.json             ← başlık, sırt, kod, ders, kapak, bölümler, kaynaklar
    *.pdf, defter/*.jpg    ← kaynak dosyalar
```
- `kitaplik.json`: `{ surum, raflar: [{ id, ad, kitaplar: [kitapId] }], oda: { duvar, zemin, mod }, ayarlar?: { dil: "en"|"tr" } }` (`ayarlar` 6.5-2b, isteğe bağlı; bkz. 6.5-2b)
- `kitap.json`: `{ surum, baslik, sirt, kod, ders, dil?, kapak: { renk, stil: "kumas"|"deri" }, sonAcilis, kurdele, bolumler: [{ baslik, durum: "okunmadi"|"okunuyor"|"okundu"|"calisildi"|"tekrar", kaynaklar: [{ tur: "pdf"|"defter"|"claude"|"link", dosya, sayfalar? }] }] }`
- `dil` isteğe bağlıdır. `"en"` ise sırt ve kapak yazıları İngilizce kurala göre büyük harfe çevrilir (i → I). Yoksa ya da başka bir dilse Türkçe kural geçerlidir (i → İ). Dil başlıktan tahmin edilmez.
- `kitap.json` yoksa kitap yine görünür (klasör adıyla, gri kapak).
- Hiçbir rafta olmayan kitaplar "Yeni gelenler" yığınında görünür.
- Bilinmeyen alanları silme; okurken koru, yazarken geri yaz.

## Değişmez kurallar
- Uygulama Drive'daki dosyaları **kopyalamaz, taşımaz, silmez**. Faz 1'de sadece `kitaplik.json` ve `kitap.json` içindeki `kapak` alanı yazılabilir. Faz 5'ten itibaren: `kitaplar/<kitap>/` altında yeni PDF oluşturma ve PDF'in sonuna sayfa ekleme izinli (bkz. Faz 5).
- Tek istisna: Kitaplık/ klasöründe kitaplik.json yoksa ilk raf/oda değişikliğinde bir kez oluşturulur. Başka hiçbir dosya oluşturulmaz; tek ek istisna Faz 5'teki PDF oluşturma kuralıdır. Uygulamanın kendi kökü (kurulum) için bkz. Faz 6.K. 6.4c'den beri (kitaplik.json gibi) bir PDF'in klasöründe okunan el yazısı için `<pdf adı>.ocr.json` (appProperties `defter=1`, `defterOcr=1`, `defterOcrKaynak=<pdf id>`) oluşturulabilir ve güncellenebilir; başka JSON oluşturulmaz.
- 6.4d-3 istisnası (Deniz kararı): kitaplık kökünün altında SADECE `_sistem/el-yazisi/` klasörü ve içinde SADECE iki dosya (`el-yazisi-atlas.png`, `el-yazisi-atlas.json`) oluşturulabilir; varsa içerikleri aynı id'ye güncellenir. SADECE kullanıcı düğmeye basınca (dev sayfası `atlas-yukle.html`). Oluşturulanlarda appProperties `defter=1`, `defterSistem=1`; çift varsa en eskisi kullanılır. İşaretsiz aynı ad → hata, hiçbir şey yazılmaz. Adı `_` ile başlayan klasörler kitap değildir (kitaplıkta ve aramada yok; `src/model/gizliKlasor.ts`).
- Yazmadan önce dosyanın son halini oku (başka cihazda değişmiş olabilir).
- Erişim token'ını localStorage'a yazma; bellekte tut. `.env.local` git'e girmez.
- Hata mesajları Türkçe, kullanıcıya ne yapacağını söyler ("Drive'da Kitaplık klasörü bulunamadı. Klasörü ana dizine yükle ve yenile.").
- iPad performansı: pixel ratio en fazla 2, gölge haritası en fazla 2048, sahne değişmiyorsa render etme.
- Arayüz metinleri Türkçe; kod içindeki isimler İngilizce.

## Git
- Her görev bitip Deniz denedikten sonra commit at. Mesaj Türkçe ve açıklayıcı: `Faz 1.3: kitaplık rafları ve sürükle-bırak`.
- Commit atmadan önce `git status` ile neyin değiştiğini Deniz'e göster.

## Yol haritası (özet)
- Faz 1 Temel: proje, 3D oda, kitaplık, Google girişi, Drive'dan okuma, Vercel
- Faz 2 Görsel kalite: hazır modeller + PBR dokular, Blender'da ışık pişirme
- Faz 3 Okuma: pdf.js, kitap/PDF modu, yakınlaştırma
- Faz 4 Kalem: çizimleri PDF'e kaydetme (MVP)
- Faz 5 Defter ve ekleme: defter fotoğrafı (otomatik kırpma), Dosya ekle (PDF, görsel → PDF)  ← bitti (5.12), main'e birleştirme Deniz onayıyla
- Faz 6 Akıllı özellikler: Word/PPT otomatik çeviri (Drive) ← bitti (6.1), arama ← bitti (6.3), el yazısı okuma + aramada el yazısı ← 6.4c-4 (kilitsiz), Temiz yazı görünümü ← 6.4e-2 (okuyucuda), quiz/özet

## Faz 2 — Görsel kalite kuralları

### Blender
- Blender yolu: C:\Program Files\Blender Foundation\Blender 5.2\blender.exe
- Blender'ı her zaman arka planda çalıştır: blender.exe -b <dosya.blend> -P <script.py>. Arayüz açma.
- Bake gibi 10 dakikadan uzun sürebilecek komutları arka planda çalıştır ve ilerlemeyi blender/out/ altındaki bir log dosyasına yaz.
- Ekran kartı: NVIDIA GeForce RTX 4070 Laptop GPU (8 GB), ayrıca Intel Iris Xe var. Cycles her zaman OptiX ile NVIDIA üzerinde çalışır.
- Blender işleri sadece blender/ klasöründe yapılır. Script'ler (build_room.py, bake.py) commit edilir; blender/assets/, blender/out/, *.blend ve *.blend1 .gitignore'da.
- Blender Z-yukarı, three.js Y-yukarı çalışır. glTF dışa aktarırken +Y Up açık kalsın. Oda three.js'teki ölçüsüyle birebir aynıdır.
- Oda geometrisi three.js'ten dışa aktarılır (oda-kaynak.glb); Blender'da şekil, renk ve yerleşim değiştirilmez, sadece ışık hesaplanır.

### Işık ve fırınlama
- Fırınlanan: duvarlar, zemin, tavan, pencere, sabit mobilya (masa, sandalye, bitki, lamba, halı). Fırınlanmayan: kitaplık, kitaplar, açık kitap; bunlar three.js'te canlı kalır.
- Kitaplığın dış boyu raf sayısından bağımsız olarak 5 raflık ölçüde sabittir; lightmap gölgesi buna göre fırınlandı. Kitaplığın dış ölçüsü değişirse yeniden bake gerekir.
- Lightmap'te sadece ışık olur, renk olmaz: Cycles Diffuse bake, Direct + Indirect açık, Color kapalı. Böylece duvar/zemin rengi (kitaplik.json'daki oda alanı) değişince yeniden bake gerekmez.
- Lightmap'ler ikinci UV kanalına yazılır (UV2; glTF'te TEXCOORD_1). Tek atlas, 2048 px, kenar payı (margin) en az 8 px.
- İki lightmap var: lightmap_gunduz ve lightmap_aksam. 18:00–06:00 akşam kuralı aynı kalır; geçiş iki lightmap arasında yumuşak karışımla olur.
- Lightmap'ler 0–1 aralığına sığdırılıp PNG olarak kaydedilir. Kullanılan ölçek çarpanı public/models/lightmap.json'a yazılır ve three.js bunu lightMapIntensity olarak kullanır.

### Performans bütçesi
- oda.glb en fazla 25 MB (hedef 15 MB). Dokular en fazla 2048 px. Toplam üçgen sayısı en fazla 300 bin.
- Sıkıştırma: gltf-transform optimize, --compress meshopt, --texture-compress webp. KTX2 için Windows'a ek program gerekir; şimdilik kullanma.
- iPad Safari'de oda görünümünde en az 30 fps.

### Kod
- Eski prosedürel oda kodu silinmez. glb yüklenemezse (hata ya da 15 sn zaman aşımı) otomatik olarak ona dönülür. Adrese ?oda=eski eklenince eski oda zorla gösterilir.
- Veri modeline dokunma. kitaplik.json'daki oda.duvar / oda.zemin / oda.mod alanları aynı anlamda kullanılır.
- Her görevin sonunda npm run build hatasız olmalı; raf görünümü, kitap açma, sürükle-bırak ve akşam modu bozulmamış olmalı.
- Faz 2 işleri faz-2 dalında yapılır. main'e birleştirme ancak Deniz onay verince.

## Faz 3 — Okuma kuralları

### PDF
- PDF çizimi: pdfjs-dist (PDF.js). Worker Vite ile: import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'.
- PDF Drive'dan files/{id}?alt=media ile indirilir (Authorization başlığıyla). PDF'ler Drive'da kopyalanmaz, taşınmaz, silinmez; değiştirilmesine sadece "Faz 4 — PDF'e çizim yazma (güvenlik)" (çizim) ve "Faz 5 — Defter ve ekleme kuralları" (sona sayfa ekleme) çerçevesinde izin verilir.
- İndirilen PDF'ler IndexedDB'de önbelleğe alınır; anahtar = dosya id + modifiedTime. Drive'da dosya değişince yenisi indirilir. Önbellek toplamı 500 MB'ı geçerse en eski açılanlar silinir.
- Kaynak yolu (kaynak.dosya) kitabın klasörüne göre çözülür; alt klasörler (defter/...) desteklenir. Bulunamayan dosya kitabı bozmaz: o sayfa yerine "Dosya bulunamadı: <ad>" sayfası gösterilir.
- sayfalar alanı: "3", "3-7", "1-2,5,9-11"; yoksa tüm PDF.

### Sayfa ve bellek
- Her PDF sayfası kitabın bir sayfası. Sayfa oranı PDF'in kendi oranı (çoğu A4; yatay slaytlar yatay kalır, kitap modunda sayfaya sığdırılır).
- Aynı anda sadece görünen sayfalar + 2 önceki + 2 sonraki çizilir; uzaklaşan canvas'lar serbest bırakılır (width = height = 0).
- Canvas boyutu: devicePixelRatio en fazla 2; tek canvas en fazla 16 milyon piksel (iPad Safari sınırı). Yakınlaştırmada görüntü önce CSS ile büyür, parmak kalkınca keskin olarak yeniden çizilir.

### Yazılan alanlar (Faz 3)
- kitaplik.json: raflar ve oda (Faz 1'deki gibi); 6.5-2b'den beri `ayarlar.dil`.
- kitap.json: kapak, sonAcilis, kurdele, uniteler[].konular[].durum ve .kurdeleler (surum 1: kurdele ({ bolum, sayfa }), bolumler[].durum). 6.K5a: ayrıca uniteler[].baslik/.klasor, konuların başlığı ve sırası, yeni ünite/konu (bkz. İçindekiler düzenleme). Başka alana dokunma; bilinmeyen alanları koru. Yazmadan önce dosyanın son halini oku, sadece bu alanları güncelle.

### Okuma durumu ve kurdele (Görev 3.5)
- Durum değerleri: `okunmadi` (Okunmadı), `okunuyor` (Okunuyor), `okundu` (Okundu), `calisildi` (Çalışıldı), `tekrar` (Tekrar). Duruma dokununca bu sırayla döner.
- Otomatik sadece ileri: konuya girince okunmadi → okunuyor; özetin (yoksa orijinalin) son sayfası ekrana gelince okunmadi/okunuyor → okundu. okundu, calisildi, tekrar otomatik değişmez.
- surum 2: `konular[].kurdeleler.<materyal> = { dosya, sayfa }` (materyal: orijinal|ozet|uebungen|oedevler; dosya = Drive'daki dosya adı; sayfa = o PDF'teki sayfa, 1'den). Kitap düzeyinde `kurdele = { konu, materyal, dosya, sayfa }`; konu = konunun `klasor` yolu.
- surum 1: `kurdele = { bolum, sayfa }` (bolum 0'dan, sayfa bölüm içinde 1'den). Eski tip kurdele (sadece sayı) okunur, ilk yazmada yeni biçime geçer.

### Yazma güvenliği (okuma durumu)
- Değişiklikler bir yama olarak birikir; sadece bu oturumda değişen alanlar yazılır. Başka cihazın değiştirdiği konulara dokunulmaz. Konular `klasor`'a göre eşleşir (surum 1: sıra + başlık).
- Her yazmadan önce: modifiedTime oku → kitap.json'un son halini oku → yamayı uygula → değişen yoksa yazma → modifiedTime'ı tekrar oku; değiştiyse (başka cihaz yazmış) baştan bir kez daha dene.
- Sadece şu alanlar değişir: sonAcilis, kurdele, uniteler[].konular[].durum ve .kurdeleler (surum 1: bolumler[].durum ve kurdele). Bilinmeyen alanlar korunur; baslik, kapak, klasor vb. alanlara dokunulmaz.
- Aynı dosyanın üstüne yaz: PATCH upload ile mevcut dosya id'si. kitap.json için asla yeni dosya oluşturma ("kitap (1).json" oluşmamalı). kitap.json'u olmayan kitapta okuma durumu yazılmaz. İçi bozuk (JSON olmayan) dosyanın üstüne yazılmaz.
- Demo/örnek kitaplıkta (Drive yok) hiç yazılmaz.
- Ne zaman: son değişiklikten 5 sn sonra; okuyucu ya da masadaki kitap kapanınca; sekme gizlenince/sayfa kapanınca (visibilitychange/pagehide, keepalive).
- Hata/çevrimdışı: yama bellekte kalır, bağlantı gelince ve 30 sn'de bir tekrar denenir; küçük uyarı gösterilir. Yeni Google izni istenmez; kapsam yetmezse dur ve Deniz'e söyle.
- Kod: `src/model/okumaYamasi.ts` (saf birleştirme, testli), `src/drive/okumaKaydi.ts` (yazıcı, testli), `src/okuma/okumaDurumu.ts` (bellekteki kitap + yazıcıya iletme).

### Güvenlik
- Ders PDF'leri telifli: public/ veya git'e asla girmez. Demo için kendi ürettiğin örnek PDF'leri kullan.
- Kalem ve çizimler: Faz 4 kurallarına bak (aşağıda).

### Veri modeli (kitap.json surum 2)
- `kitap.json`: `{ surum: 2, baslik, sirt, kod, ders, kapak, sonAcilis, kurdele, uniteler: [ { baslik, klasor?, konular: [ { baslik, klasor, durum, kurdeleler? } ] } ] }`.
- `uniteler[].klasor` (6.K5a, isteğe bağlı): ünitenin klasörü (ör. `Unite-03-Graphen`). Sihirbaz ve içindekiler düzenleme yazar; yoksa konuların yolundan çıkarılır.
- `klasor` kitabın klasörüne göre yoldur (ör. `Unite-01-Logik/Konu-01-Aussagenlogik`). Dosyalar kitap.json'da tek tek yazılmaz; konu klasörüne bakılarak bulunur.
- Konu klasörü (dosya adları büyük/küçük harf duyarsız, ASCII):
  - Orijinal: `orijinal.pdf`
  - Özet: `ozet.pdf`; yoksa `brifing.pdf` ve varsa `sorular.pdf` arka arkaya
  - Übungen: `Uebungen/` altındaki `*.pdf`, alfabetik
  - Ödevler: `Oedevler/` altındaki `*.pdf`, alfabetik
  - `X_cozum.pdf`, aynı klasördeki `X.pdf`'in çözümüdür; listede ayrı öğe olmaz.
- Bulunmayan materyal gizlenir. Hiçbiri yoksa konu "Henüz materyal yok" gösterir.
- surum 1 (düz `bolumler`) okunmaya devam eder: bölümler "Genel" adlı tek ünite altında birer konu olarak görünür; `kaynaklar` ve `sayfalar` aynen çalışır.
- Okuyucuda konu açılınca sekmeler: Orijinal · Özet · Übungen · Ödevler. Varsayılan Özet (yoksa Orijinal, o da yoksa ilk bulunan).

## Faz 4 — PDF'e çizim yazma (güvenlik)

### Biçim
- Çizimler PDF'e standart Ink annotation (not) olarak yazılır; görünüm akışı (/AP) eklenir, böylece Drive önizlemesi, iPad ve Windows'ta görünür. Var olan sayfaların içeriğine (content stream) asla dokunulmaz.
- Uygulamanın notları özel `/DefterId` anahtarıyla (ve /T "Defter") işaretlenir. Sadece /DefterId işaretli Ink annotation'lar eklenir/değişir/silinir. Sayfa içeriği, başka notlar, form alanları, metadata ve sayfa sırası korunur (Faz 5: sona yeni sayfa eklenebilir; 6.S-4: Defter'in boş sayfası araya girebilir; 6.S-4d: her sayfa onaylı silinebilir, yedek + Geri al zorunlu, bkz. 6.S-4d). İmzalı PDF'e yazılmaz.
- Çizgi şekli tek kaynak: `src/kalem/cizgiSekli.ts`. Kalem = perfect-freehand dış hattı, dolgu; fosforlu = orta noktalardan yumuşatılmış eğri, sabit kalınlık. Canlı çizim, okuma katmanı ve /AP aynı fonksiyonu kullanır. /AP kalemde dış hat dolgu (f), fosforluda yumuşak eğri (S). /InkList merkez çizgi olarak kalır.
- Apple Pencil basıncı `basinc` (nokta başına 0–1, 2 ondalık) PDF'te `/DefterBasinc` dizisinde; basınç yoksa (fare, parmak) hızdan tahmin edilir.
- 6.H2b (Deniz kararı): düz basınç (en çok − en az < 0.02, ör. ESR kalem hep 0.12) = basınç yok → kalemde sabit kalınlık (seçilen kalınlık, hız tahmini yok). Düz basınç `/DefterBasinc`'e yine yazılır (basınçsız kalem işareti); eski 0.12'li çizgiler de sabit çizilir. Fare/parmak (basınç hiç yok) hızdan tahminle kalır. Karar: `hasRealPressure` (`cizgiSekli.ts`).
- 6.H2b: perfect-freehand 1/16 pt biriminde çalışır (sabit uzunlukları pt'de çok büyüktü: uçlarda 2–3.6 pt düz parça); uçta yuvarlak başın kapladığı kanca noktaları çizimde atlanır. Canlı çizim bitmiş hâliyle çizilir (kalkınca şekil değişmez).
- 6.H2b nokta kuralları (`koordinat.ts`): adım ≤ 1 ekran px, en çok 0.5 pt (`minStep`); noktalar 0.01 pt'ye yuvarlanır; pointerup noktası son nokta olarak eklenir (basıncı son basınç); son alınan noktadan eski (ya da aynı zaman + aynı yer) coalesced/move atılır (`EventOrder`; iPad'de aynı move iki kez geldi).
- 6.H2b fosforlu: merkez eğri 0.5 pt'lik kısa düz parçalarla stroke edilir (SVG `L`, /AP `l`, round cap/join); sıkı kıvrımda katlanma deliği olmasın diye. Dev: `?kalemTest=1` eski/yeni karşılaştırma, `node scripts/kalem-test-kontrol.mjs` ekran görüntüleri.
- Kalemin opaklığı her zaman 1, fosforlununki 0–1 arası (1 hariç).
- 6.4e-4 (Deniz kararı): temiz yazı görünümünde çizilen Ink notu `/DefterGorunum /Temiz` + Hidden bayrağı (`/F 6` = Print + Hidden) taşır; başka görüntüleyiciler (Drive önizleme vb.) onu fotoğrafın üstünde göstermez. Anahtarsız (bütün eski notlar) = orijinal. Defter bayrağa değil anahtara bakar (pdf-lib); sadece pdf-lib modeli yüklenmeden önceki pdf.js ara katmanında Hidden bayrağı yedek ipucudur (pdf.js özel anahtar vermez). Bellekte `Stroke.gorunum?: 'temiz'` (`cizgi.ts`); bekleyen kayıt (IndexedDB) alanı aynen saklar.

### Okuma modu
- Defter notları pdf.js canvas'ında çizilmez (annotationMode ENABLE_STORAGE + noView); başka programların notları görünür.
- Çizgiler önce getAnnotations verisiyle SVG katmanında gösterilir (Ink + /T "Defter"; kalınlık: borderStyle.rawWidth; opaklık < 1 → fosforlu). Dosyanın modeli (pdf-lib, basınç dahil) yüklenince modelden çizilir. Kalem modunda id ve araç pdf-lib readDefterStrokes ile kesin okunur.
- Hata ayıklama: `?defterNot=goster` (katman yok, pdf.js kendisi çizer).

### pdf-lib
- Tam sürüm 1.17.1, tembel yüklenir (`await import('pdf-lib')`): kalem modunda, ya da okuma modunda Defter notu veya bekleyen kaydı olan bir dosya açılınca, ya da açık listede sayfalı bir `.ocr.json` kaydı olunca (parmak izi, 6.4e-2; Deniz onayı), ya da "Sayfa ekle" balonu açılınca (6.S-4: kalem yazabilir mi, boş sayfa mı). Diğer dosyalarda hiç yüklenmez; ilk açılış paketine girmez.

### Cihazda saklama
- Çizgiler önce cihazda, sonra Drive'a. Kaydedilmemiş çizimler dosya başına net fark olarak IndexedDB'de (`defter-kalem`) tutulur; sadece Drive'a başarılı yüklemeden sonra silinir, hiçbir hatada silinmez.
- Depo ilk kullanımda navigator.storage.persist() ister. iPad'de uygulamayı ana ekrana eklemek önerilir (Safari, ana ekranda olmayan sitenin verisini 7 gün kullanılmayınca silebilir).
- Sayfa kapanırken (pagehide) PDF yüklenmez (keepalive sınırı); bekleyen çizgiler bir sonraki açılışta yazılır.

### Drive'a yazma (`src/drive/pdfYazici.ts`, `src/kalem/pdfKayit.ts`)
- Aynı dosya id'sine PATCH (≤ 5 MB uploadType=media, > 5 MB resumable). Çizim yazarken asla yeni dosya veya kopya oluşturulmaz (yeni PDF sadece Faz 5 kurallarıyla). Kör üstüne yazma yok.
- Yedek: ilk yazmadan önce head sürüm keepForever=true yapılır (ensureOriginalKept).
- Kontroller: capabilities.canEdit; modifiedTime beklenenle aynı mı; headRevisionId yedekten önce ve sonra okunur, farklıysa içerik bu arada değişmiştir, yazılmaz (PdfConflict). keepForever modifiedTime'ı değiştirebileceği için yedekten sonra modifiedTime değil headRevisionId karşılaştırılır.
- Akış (dosya başına, dosyalar sırayla, aynı dosyaya aynı anda tek yükleme): son meta oku (modifiedTime) → son baytları al (aynı sürüm önbellekteyse oradan) → Drive'daki Defter çizgilerine bekleyen farkı id'lerle uygula → sadece farkın dokunduğu sayfaları yaz → uploadPdf → PdfConflict'te en fazla 3 kez baştan.
- Başarıda: yeni baytlar PDF önbelleğine; bellekteki sürümler (sayfalar, önbellekler, model) yeni modifiedTime'a taşınır; yükleme sırasında yapılan değişiklikler kalan fark olarak bekler (remainingDiff). Açık pdf.js belgesi yeniden açılmaz (Defter notları canvas'ta zaten gizli, katman modelden çizer).
- Ne zaman: kalem kapanınca, materyal/konu değişince, okuyucu kapanınca (yükleme kapandıktan sonra sürer, sonuç toast'la söylenir), son değişiklikten 30 sn sonra, "Kaydet" düğmesi, önceki oturumdan kaydı olan dosya açılınca, çevrimiçi olunca.
- Hatalar: çevrimdışı/ağ hatası ve Drive 429/5xx → online olayında ve 60 sn'de bir tekrar; yazma izni yok, imzalı PDF, yükleme oturumu açılamadı, 3 kez çakışma → Türkçe mesaj + "Tekrar dene".
- Gerçek Drive testleri 4.8c'de tamamlandı (media, resumable 14 MB, keepForever, çakışma). Drive kitaplığında yükleme her zaman açık; örnek kitaplıkta hiç yok.

### Sınırlar
- Demo/örnek kitaplıkta hiçbir koşulda Drive'a yazma yok.
- Telifli ders PDF'leri asla public/ veya git'e girmez; testler demo PDF'lerle yapılır.
- Mevcut `drive` kapsamı yeterli; yeni Google izni istenmez.

## Faz 5 — Defter ve ekleme kuralları

### Yeni dosya
- Yeni dosya sadece `kitaplar/<kitap>/` altında oluşturulur ve sadece PDF olabilir. Başka yerde, başka türde dosya oluşturulmaz (kitaplik.json istisnası aynen kalır). Tek PDF-dışı istisna: Faz 6'daki geçici Google çeviri dosyası.
- Oluşturmadan önce aynı klasörde aynı isimde dosya (büyük/küçük harf duyarsız, tüm sayfalar) var mı bakılır. Varsa hata verilir; üzerine yazılmaz, yeniden adlandırma yok (5.5).
- Çift dosya koruması: generateIds ile önceden alınan id + tekrar denemede aynı id (5.5). Drive "zaten var" derse boyut eşleşiyorsa oluşmuş kabul edilir. Klasörü yeniden listeleme sadece yedek kontrol.
- Kod: `src/drive/pdfOlustur.ts` (createPdf). Faz 5 yazma kilidi (`?dosyaOlustur=1`) 5.9b'de kaldırıldı (gerçek testler tamam).
- Uygulamanın oluşturduğu dosyalar işaretlenir: appProperties `defter: "1"`.
- Konuda özet yoksa, defter fotoğraflarından o konunun klasörüne yeni bir `ozet.pdf` oluşturulabilir. "Özet yok" kuralı onaylandı: karar okuyucuyla aynı yerden (`classifyTopic`) gelir; `ozet.pdf` varsa o, yoksa `brifing.pdf`/`sorular.pdf`; hiçbiri yoksa yeni `ozet.pdf`. Özet varsa yeni `ozet.pdf` oluşturulmaz; sayfalar var olana eklenir (kod: `src/defter/konuyaEkle.ts`).
- Hiçbir dosya silinmez, çöpe atılmaz, taşınmaz (değişmedi).

### PDF'e sayfa ekleme
- Sayfa sadece sona eklenir. Var olan sayfaların içeriği ve sırası değişmez; Defter notları, kurdeleler ve sayfa numaraları korunur. İstisnalar (Deniz kararları): Defter'in boş not sayfası (`/DefterBosSayfa`) araya girebilir (6.S-4); her sayfa onaylı silinebilir, yedek (cihazda tek sayfalık PDF + Drive keepForever) ve Geri al zorunlu (6.S-4d). Son sayfa ve form alanlı sayfa silinmez.
- Sayfa ekleme kalemin yazma kuyruğundan (PdfKayit) geçer; aynı dosyaya iki ayrı yükleyici yazmaz. Önce bekleyen çizgiler, sonra sayfa ekleme.
- Yedek (keepForever, ensureOriginalKept) ve çakışma kontrolü (modifiedTime, headRevisionId, PdfConflict) aynen uygulanır.

### Cihazda saklama
- Eklenmeyi bekleyen fotoğraflar yükleme bitene kadar IndexedDB'de saklanır; hiçbir hatada silinmez.

### Dosya ekle (5.10)
- Okuyucudaki "Dosya ekle": dosya sadece açık konunun klasörüne (`kitaplar/<kitap>/` altında) ve sadece PDF olarak eklenir. Görsel → tek sayfalı PDF; birden çok görsel → tek PDF (sırala/sil/+, kırpma yok). Kod: `src/defter/dosyaTuru.ts`, `dosyaHazirla.ts`, `konuyaDosyaEkle.ts`, `src/ui/dosyaPanel.ts`.
- Hedefler: Übungen (`Uebungen/`), Ödevler (`Oedevler/`), Çözüm (`X_cozum.pdf`, `X.pdf`'in klasörüne), Orijinal (sadece `orijinal.pdf` yoksa), Özet (hiç özet yoksa yeni `ozet.pdf`; tek `brifing.pdf` de özet sayılır).
- Özet hedefi: özet varsa sona ekler (6.S-3, Deniz kararı). Etiket "Özetin sonuna ekle (<dosya adı>)", ad kutusu yok; yeni dosya oluşmaz. Girdi önce PDF baytına (görsel(ler) → tek PDF, Word/PPT → çeviri, ön ekli PDF temizlenir), sonra bütün sayfaları fotoğrafların yolundan (`ozeteSayfaEkle`, `{ pdf }`: kalem kuyruğu, /DefterEkId + islemId, çakışma/yedek/headRevisionId aynen) özetin sonuna. İki dosyalı özet: odaktaki dosya özetteyse o, değilse panelde seçim. Ek PDF şifreli/okunamaz/boş → ret (`EkPdfYazilamaz`, istek yok); imzalı ek kabul edilir (sadece okunur, sayfaları kopyalanır). Hedef özet şifreli/imzalı → `PdfYazilamaz` (aynen). Ek PDF'teki notlar korunur; Defter notlarına yeni id (`<islemId>-<n>`, aynı dosya iki kez eklenince aynı id olmasın). `.ocr.json` değişmez. Yükleme yüzdesi Ekle düğmesinde; bitince okuyucu yerinde kalır, toast "Göster" eklenen ilk sayfaya. Kod: `isaretliPdfEkle` (`ozeteEkle.ts`), `{ ozetSonu }` (`konuyaDosyaEkle.ts`), `ozetHedefi` (`dosyaPanelDurumu.ts`).
- `Uebungen/` ya da `Oedevler/` yoksa 6.K6a'dan beri ilk dosyada açılır (bkz. Faz 6.K6a). 6.K8b ile URL kilidi kaldırıldı; kök/ebeveyn doğrulaması korunur. Geçerli Drive bağlamı yoksa hedef gri; doğrudan istenirse KlasorYok, yazma yok.
- Aynı ad (büyük/küçük harf duyarsız) = uyarı; üzerine yazılmaz, otomatik yeniden adlandırma yok; kullanıcı adı değiştirir. `_cozum` ile biten ad Übungen/Ödevler'e normal dosya olarak eklenmez (AdCozumGibi).
- Kilit: aynı sekmede aynı konu + hedef + ad için aynı anda tek ekleme (kilitAnahtari → EklemeSuruyor).
- islemId: hedef + ad (+ görsel listesi) için bir kez üretilir, bunlar değişmedikçe aynı kalır; `appProperties.defterIslem`'e yazılır. Tekrar denemede aynı ad + aynı islemId + aynı boyut → "zaten eklenmiş" (çift dosya yok). generateIds ile önceden alınan id kuralı (5.5) aynen geçerli.
- Sınırlar: en fazla 50 MB (`MAX_DOSYA_MB`); boş dosya, bozuk PDF ve desteklenmeyen tür reddedilir; başında fazla bayt olan PDF pdf-lib ile temizlenip yüklenir.
- Dosya önce cihaza kaydedilmez (fotoğraftan farklı). Hata olursa panel açık kalır + "Tekrar dene" (aynı islemId).
- Eklenen dosya açık okuyucuda hemen görünür (5.10f).

### Word / PowerPoint
- Faz 5'te uygulama dönüştürmez: .doc/.docx/.ppt/.pptx/.odt/.odp/.key/.pages/.rtf reddedilir, mesaj "PDF olarak kaydedip ekle". Kullanıcı PDF'e çevirip ekler.
- 5.11 denemesi: dev-only `window.defterOfisDene()`, Drive kökünde "Defter-ceviri-deneme" klasörü. Karar: otomatik çeviri Faz 6'ya ertelendi. `src/drive/ofisDene.ts` 6.1e'de kaldırıldı (git geçmişinde duruyor); Drive'daki Defter-ceviri-deneme klasörüne dokunulmaz.
- Faz 6 (6.1e) ile tek Word/PowerPoint dosyası Drive kitaplığında çevrilir (bkz. Faz 6); örnek kitaplıkta ve Keynote/Pages için "PDF olarak kaydedip ekle" reddi aynen.
- Faz 6 kuralı (Deniz kararı, 17 Ekim 2026): otomatik çeviride Drive'da oluşan geçici Google dosyası çöpe atılır (`files.update` ile `trashed=true`; 30 gün geri alınabilir). Bu, "hiçbir dosya silinmez" kuralının tek istisnasıdır ve sadece uygulamanın kendi oluşturduğu ara dosya için geçerlidir.

### iOS / iPad
- Fotoğraf ve dosya seçici dokunuşun içinde açılır (`input.click()` tıklama olayında); panel seçimden sonra açılır (iPad Safari kuralı).
- Klavye / görünür alan (5.10g-ek, ek2): `#app` ve `#reader` `position: fixed; inset: 0` kalır. Dokunmatik ekranda panel üste yaslıdır; odak `preventScroll` ile verilir; klavye kapanınca sayfa kaydırması 0'a döner (`src/ui/gorunurAlan.ts`, `klavyeKaydirma.ts`). Sayfa kilidi ve `--gorunur-h` yedeği denendi, kötüleştirdi, kaldırıldı; geri getirme.
- `?olcum=1`: görünür alan ölçümleri küçük bir kutuda (Vercel'de de açılır; iPad testi için).

### Onaylanan varsayılanlar (5.9 ve 5.10 testlerinde Deniz onayladı; kolay değiştirilebilir sabitler)
- İki dosyalı özette (brifing + sorular) fotoğraf sayfaları açık olan dosyanın sonuna eklenir.
- "Dosya ekle" ile gelen görsel PDF'e çevrilir; birden çok görsel → tek PDF, kırpma yok.
- Fotoğraf: sayfa otomatik kırpılır + perspektif düzeltme (saf TS, src/defter/kirp/), istenirse tüm fotoğraf; güven düşükse tüm fotoğraf; uzun kenar 2000 px, JPEG 0.85, renkli, filtre yok.
- Uebungen/Oedevler yoksa hedef gri, klasör oluşturulmaz; aynı ad = uyarı + kullanıcı değiştirir; dosya önce cihaza kaydedilmez, hata olursa panel açık + Tekrar dene.
- Defter fotoğraflarında Renk düzelt (filtre E) varsayılan açık, fotoğraf başına kapatılabilir (6.2c; `RENK_DUZELT_VARSAYILAN`). "Dosya ekle" görselleri filtrelenmez.

## Faz 6 — Word/PowerPoint çeviri kuralları

### Geçici Google dosyası (6.1b)
- Çeviri: dosya Drive'a Google türüne çevrilerek yüklenir (docx/doc/odt/rtf → Google Doküman, pptx/ppt/odp → Google Slayt), `files.export` ile PDF alınır, sonra geçici dosya çöpe atılır.
- Yer: hedef konu klasörü (`kitaplar/<kitap>/` altında, yerKontrol ile). Yeni klasör oluşturulmaz.
- Ad: `~çeviri – <dosya adı>`. appProperties: `defter: "1"`, `defterGecici: "1"`, `defterIslem: <islemId>`.
- ≤ 5 MB multipart, > 5 MB resumable. PDF'i 10 MB'ı aşan dosya: Drive 403 `exportSizeLimitExceeded` → OfisCokBuyuk.
- key/pages reddedilir. Eski .doc/.ppt kabul edilir ama test edilmedi; Drive çeviremezse anlaşılır hata (OfisCevrilemedi).
- Çeviri sadece Drive kitaplığında (writer() null değilse); örnek kitaplıkta hiç çağrılmaz.

### Çöp istisnası
- "Hiçbir dosya silinmez" kuralının tek istisnası (Deniz kararı, 17 Ekim 2026; bkz. Faz 5 → Word / PowerPoint): sadece uygulamanın kendi geçici Google dosyası çöpe atılır.
- Önce metadata okunur; sadece `appProperties.defterGecici = "1"` + Google türü (`vnd.google-apps.document` | `vnd.google-apps.presentation`) + `trashed = false` ise `files.update` ile `trashed: true`. Koşul tutmazsa dokunulmaz (OfisGeciciDegil). `files.delete` asla.
- Çöpe atma hatası PDF'i bozmaz (`copeAtildi: false`, bir sonraki süpürmede tekrar denenir). Çeviri hatasında ve iptalde (yükleme bittiyse) geçici dosya yine çöpe atılır.
- Süpürme: her çeviriden önce `defterGecici = "1"` + Google türü + `trashed = false` + `createdTime` 1 saatten eski olanlar (en fazla 20) çöpe atılır. Süpürme hatası çeviriyi durdurmaz (console.warn).

### Korumalar ve panel (6.1e)
- `?ofisCevir=1` kilidi 6.1e'de kalktı (Deniz kararı, 6.1d gerçek testlerinden sonra): "Dosya ekle"de seçilen tek Word/PowerPoint dosyası Drive kitaplığında her zaman çevrilir.
- Kalan korumalar: örnek kitaplıkta çeviri yok ("PDF olarak kaydedip ekle" reddi); yerKontrol (sadece `kitaplar/<kitap>/` altı); copeAtGecici koşulları (yukarıda); en fazla 50 MB (`MAX_DOSYA_MB`); key/pages reddedilir; birden çok dosya seçiminde Word/PPT reddedilir.
- Panel: çeviri sürerken ve çeviri başarıyla bittikten sonra panel dışına dokunma paneli kapatmaz; Ekle'ye basılıp ekleme bitene ya da Vazgeç/Esc'ye kadar açık kalır (çevrilen PDF kaybolmasın). Çeviri hatasında dışa dokunma paneli kapatır.
- "Tekrar çevir" sadece yeni denemenin işe yarayabileceği hatalarda görünür. Google izni (kapsam) yetmiyorsa görünmez (`OfisYuklenemedi.neden = 'izin'`; diğerleri `'ag'` | `'sunucu'`).

### Kod
- `src/drive/ofisCevir.ts` (cevirTuru, ofisuPdfeCevir, copeAtGecici, supurGecici; testli). `dosyaTuru` sonucu `cevrilebilir` alanını taşır (aynı tablo). Panel: `src/ui/dosyaPanel.ts`; karar `tekDosyaYolu` (`src/defter/dosyaPanelDurumu.ts`); hata metni `ofisHataMetni` (`src/defter/dosyaEklemeMetin.ts`).
- Dev: `window.defterOfisCevirDene(kitapAdi, konuYolu)` (sadece `npm run dev`, `src/drive/ofisCevirDene.ts`): dosya seçtirir, o konunun klasöründe çevirir, sonucu loglar; konuya eklemez.

### Fotoğraf yükleme (6.2e-2)
- Daha az istek: yer zinciri oturum boyunca bellekte (`yerKontrol`, `yerBellekte`); uploadPdf öncesi canEdit + modifiedTime + headRevisionId tek `durum` isteği; yedek adımı (listRevisions, keepForever, tekrar durum) dosyada saklı sürüm görülene kadar (oturum belleği).
- Ekle'den sonra panel kapanır, yükleme arka planda sürer; şerit: "Fotoğraflar yükleniyor… %42 · 3 fotoğraf sırada". Yükleme sürerken beforeunload uyarısı.
- Kilit 6.2e-3'te kalktı (laptop + iPad gerçek testlerinden sonra): XMLHttpRequest ile yüzde + kesintide kaldığı yerden devam her zaman açık (fotoğraf ve kalem yüklemeleri). Yeni dosya oluşturma (`pdfOlustur.ts`) fetch ile, devamsız kalır.
- Devam sırası: önce durum sorgusu (`Content-Range: bytes */N`); 200/201 → bitmiş say (devamOncesi yok); 308 → devamOncesi (modifiedTime + headRevisionId aynı mı) → kalan baytlar; 404/410 → baştan. En fazla 3 devam (2/4/8 sn).

### Köşe bulma (6.2d)
- koseB'ye (6.2d-2) açma (ince köprüleri kesme), iki geçişli kenar inceltme (±%12 sonra ±%2 şerit, RANSAC) ve kenar desteğiyle güven eklendi. Kod: `src/defter/kirp/koseB.ts`, `src/defter/kirp/kenarIncelt.ts` (testli).
- Ölçüm: `scripts/kose-olcum.test.ts` (IoU, bugün/yeni tablosu, süre), kontrol görüntüleri `scripts/kose-kontrol.mjs`. Fotoğraflar repo dışında (`../defter-test-dosyalari/kose/`); yoksa ölçüm atlanır.

### 6.2 kararları (özet)
- Renk düzelt (filtre E) defter fotoğraflarında varsayılan açık, fotoğraf başına aç/kapa (6.2c).
- koseB: açma + iki geçişli kenar inceltme + kenar desteğiyle güven (6.2d-2).
- Yükleme: yer belleği + birleşik `durum` kontrolü (6.2e-2); arka planda yükleme + yüzde + kaldığı yerden devam, her zaman açık (6.2e-3).

### Test temizliği (6.3-0b)
- Tek seferlik test temizliği (Deniz kararı, 18 Ekim 2026): listedeki test dosyaları (Defter-ceviri-deneme ve Konu-99-Test-5.7 klasörleri dahil) çöpe (sadece `trashed=true`), Konu-01 ozet.pdf keepForever sürümüne (27 sayfa) döndü. Dev aracı `window.defterTemizlikUygula()`, sadece `?temizlik=1` ile; izin listesi kodda sabit (`src/drive/temizlikIzin.ts`). Bu, "çöpe atılmaz", "Defter-ceviri-deneme'ye dokunulmaz" ve "sayfa sadece sona eklenir" kurallarının tek seferlik istisnasıdır.
- Temizlik yapıldı; araçlar (`temizlikListesi`, `temizlikKurallari`, `temizlikIzin`, `temizlikUygula`) 6.3f'te kaldırıldı (git geçmişinde). `saltOkunur.ts` kaldı (arama kullanıyor).

## Faz 6.3 — Arama kuralları

### Kitaplıkta arama
- Kitap, konu ve dosya adı cihazda aranır, alt dize olarak ("blatt" → `blatt-01_cozum.pdf`). Ağaç kitap klasörlerinden katman katman kurulur, 10 dk bellekte kalır (`src/arama/kitaplikAgaci.ts`); dosya/fotoğraf eklenince ya da kitaplık yeniden yüklenince geçersiz olur.
- Metin Drive `fullText` ile aranır: sadece tam kelime (önek yok), her kelime dosyada olmalı (and). Sorgu Kitaplık'taki PDF klasörleriyle sınırlı (40'lık gruplar); sonuçlardan sadece ağaçta bilinen id'ler kalır. `defterGecici` dosyaları ve çöptekiler hariç (`src/drive/aramaDrive.ts`).
- Arama Drive'a sadece GET gönderir (`saltOkunurFetch`); hiçbir şey yazmaz.
- Örnek kitaplıkta metin araması yok (sadece adlar).
- Masada kitap açıkken kitaplık araması açılmaz ("/" ve Ctrl+F çalışmaz).
- Sonuca gitme: dosya → okuyucuda doğru konu/sekme/dosya (çözüm açık) + ilk eşleşme; konu → okuyucu o konuda; kitap → kitaba dokunmak gibi (masaya uçar).
- Dizinlenme (6.3f ölçümü, 18 Ekim 2026): 1 sayfalık PDF (Kolibri5826), yüklemeden (modifiedTime 21:06:34) en geç 17 sn sonra fullText ile bulundu; yüklemeden önceki 13 tur "yok" dedi. Büyük/çok sayfalı PDF'lerde daha uzun sürebilir; ölçülmedi.

### Okuyucuda arama
- İlk aramada dosyanın metni pdf.js ile çıkarılır, sonra aramalar bellekten.
- Vurgu: sarı, geçerli eşleşme turuncu; genişlik harf ölçümüyle (canvas `measureText`, oransal), ölçülemezse eşit genişlik. PDF ve kitap modunda.

### Dev araçları
- `window.defterKitaplikAra(q)`: kitaplık araması, süreler ve sonuçlar (kutu + Kopyala).
- `window.defterDizinOlc(kelime)` (`src/arama/dizinOlc.ts`): her 30 sn fullText (her turda yeni ağaç), en fazla 30 dk; ilk bulunduğu an + geçen süre (başlangıçtan ve dosyanın modifiedTime'ından). `.dur()` durdurur. Deneme dosyası: `node scripts/dizin-deneme-uret.mjs` → `dizin-deneme.pdf` ("Zebrafink4711").
- `window.defterAramaDene(q)`, `defterAramaHepsi()` (6.3a keşif).

## İzin modu (6.K1)
- Not: varsayılan kapsam `drive.file`; sahip hesabı (`VITE_SAHIP_EPOSTA`, .env.local + Vercel Production/Preview) tam `drive` ister. Değişken yoksa herkes `drive.file`. Bu güvenlik değil, sadece hangi iznin isteneceğini seçer.
- Karar ve aktif kapsam: `src/drive/kapsam.ts` (saf, testli) ve `src/drive/auth.ts` (token'daki scope → `aktifKapsam()`; token yenilenirken aktif kapsam korunur).
- Sahip + `drive.file` → "Tam erişim gerekiyor" kartı; popup sadece "Tam erişimi aç" dokunuşunda açılır.
- Deneme anahtarları: `?kapsam=dar` (sadece drive.file, eski izinler dahil değil), `?sahip=0` (sahip değil gibi). `?olcum=1` kutusu kapsam, sahip ve scope listesini gösterir.
- Kök bulma, yazma ve kurulum bu adımda değişmedi (K2 ve sonrası).

## Faz 6.K — Kendi kökü ve kurulum

### Kural istisnası (6.K2a, Deniz kararı)
- Uygulama klasör ve yeni JSON dosyası (kitaplik.json, ileride kitap.json) oluşturabilir – SADECE kendi kökü (appProperties `defterKok=1`) altında ve SADECE kullanıcı düğmeye basınca.
- Oluşturulan her şeyde appProperties `{ defter: '1', defterIslem: <islemId> }` (kökte ayrıca `defterKok: '1'`).
- Önce "var mı" kontrolü, çift oluşturma yok. `files.delete` asla. Mevcut dosya/klasörlere (ör. eski "Kitaplık") yazılmaz, işaret de eklenmez.

### Kökü bulma (`src/drive/kok.ts`, saf seçim testli)
- Dar mod (`drive.file`): sadece `appProperties has { key='defterKok' and value='1' }` klasörü. Ad araması yapılmaz.
- Sahip modu (`aktifKapsam() === 'tam'`): önce eski adla "Kitaplık" (davranış aynen: ilki + çoklu uyarısı); yoksa defterKok araması. Dar testte açılan "Defter Library" gerçek Kitaplık'ı gölgelemez.
- Sonuç: `bulundu` (kaynak `defterKok` | `ad`) · `yok` · `cokKok` (en eski createdTime + uyarı) · `yarim` (kök var, `kitaplar/` ya da `kitaplik.json` eksik). Kökü bulma sadece GET (`saltOkunurFetch`).

### Kurulum (`src/drive/kurulum.ts`, testli)
- `kitaplikKur`: "Defter Library" (Drive kökünde) → `kitaplar/` → `kitaplik.json` (en son = kurulum tamam). `yarim` durumda sadece eksikler.
- Yazma sadece `yok` ya da defterKok kaynaklı `yarim` durumda. Sahibin eski "Kitaplık"ı bulunursa (tam ya da yarım) hiçbir şey yazılmaz: `{ zatenVardi: true, kaynak: 'ad' }`. Sahip tam izindeyken ikinci kök oluşmaz.
- kitaplik.json içeriği: bugünkü varsayılan (5 boş raf "Raf 1…5", varsayılan oda), `parseLibrary` ile okunur.
- Çift koruması: önce ebeveynde `defterIslem` araması; `files.generateIds` ile önceden alınan id, tekrar denemede aynı id (409 = var; ad + defterIslem doğrulanır). generateIds çalışmazsa her tekrardan önce defterIslem araması.
- Korumalar: 6.K8b itibarıyla URL şartı yok; işlem bağlamı uygun değilse `KurulumKilitli`, hiç istek yok; girişli ve örnek kitaplık değil (yoksa `KurulumYazmaYok`). Hatalar: `KurulumIzinYok`, `KurulumAgHatasi`, `KurulumBeklenmedik`.
- Dev (sadece `npm run dev`): `window.defterKokDurumu()` (salt okunur), `window.defterKurulumDene(islemId?)` (URL şartı yok; girişli ve yazılabilir bağlam şart). Örnek kitap K3'te.

### "Kitaplığını kur" kartı (6.K2b)
- Eski "Kitaplık bulunamadı" kartının yerine. Kök yok → "Kitaplığı kur"; defterKok kökü yarım (ya da cokKok'ta en eskisi yarım) → "Kurulumu tamamla". Sahibin eski "Kitaplık"ı (yarım da olsa) eskisi gibi yüklenir.
- Öncelik: sahip `drive.file` ile girdiyse "Tam erişim gerekiyor" kartı. Karar saf: `kartSec` (`src/ui/kurulumDurumu.ts`, testli).
- 6.K8b: URL parametresi gerekmez; kurulum sadece kullanıcı düğmeye basınca başlar. Girişsiz/örnek kitaplıkta ve işlem sürerken istek başlamaz.
- islemId kart açılınca bir kez üretilir (`KurulumAkisi`); Tekrar dene aynı islemId. Kurulum sürerken düğmeler kapalı.
- Başarı → kitaplık yüklenir + "Kitaplığın hazır." Hata → kartta kurulum.ts mesajı + Tekrar dene; `KurulumIzinYok` → "Tekrar giriş yap". cokKok uyarısı sayfa başına bir toast; `?olcum=1` kutusunda `kök:` satırı.
- Ekran görüntüleri: `node scripts/kurulum-karti-kontrol.mjs` (giriş ve Drive yok).

### Örnek kitap (6.K3)
- Kartta "Örnek bir kitap da koy" kutusu (varsayılan işaretli, kurulum sürerken kapalı). İşaretliyse kurulum örnek kitaplıktaki `programlamaya-giris` kitabını (telifsiz demo PDF'ler, `npm run demo-pdf`) `kitaplar/programlamaya-giris/` altına koyar. Telifli PDF asla kullanılmaz.
- Kaynak: build'deki `ornek/index.json` (`klasorler`) + `ornek/kitaplar/programlamaya-giris/kitap.json` + `demo/*.pdf` (aynı origin, `fetch`). kitap.json'da durumlar `okunmadi`, `kurdele` ve `sonAcilis` null; diğer alanlar aynen.
- Sıra: kök → `kitaplar/` → örnek (kitap klasörü → alt klasörler → PDF'ler → en son kitap.json) → `kitaplik.json` (örnek başarılıysa Raf 1'de). Düğmede ilerleme: "Kuruluyor… (örnek kitap 7/18)".
- Her örnek öğesinde appProperties `{ defter: '1', defterIslem, defterOrnek: '1' }`. Örnek öğeleri islemId'ye değil `defterOrnek`'e göre aranır; "Kurulumu tamamla" eksikleri tamamlar, çift oluşturmaz. Aynı adda işaretsiz öğe varsa dokunulmaz (`OrnekAdDolu`).
- Örnek hatası kurulumu durdurmaz: `kitaplik.json` örneksiz yazılır, sonuç `ornekHata`, toast "Örnek kitap eklenemedi".
- Yarım örnek (defterOrnek klasörü, kitap.json yok) kitaplıkta sessizce atlanır (`driveLibrary.ts`); kullanıcının kitap.json'suz klasörleri eskisi gibi gri kapakla görünür. 6.K4b-2: yarım sihirbaz kitabı (defterIslem klasörü, kitap.json yok) da aynı yerde atlanır; kural tek yerde: `yarimKitapNedeni` (`src/model/yarimKitap.ts`).
- Kod: `src/drive/kurulum.ts` (`ornekKitapKur`, `ornekPlani`, `webOrnekKaynak`; testli). Dev: `window.defterKurulumDene(islemId?, ornek = true)`.

### Kitap sihirbazı (6.K4a)
- Özelleştir → "＋ Yeni kitap" (sadece Drive kitaplığında; örnek kitaplıkta yok). Boş Drive kitaplığında oda ipucunun yerinde "Kitaplığın boş · ＋ Yeni kitap".
- Alanlar: kitap adı, raf (mevcut raflar), renk (`COVER_SWATCHES`), satır satır liste + canlı önizleme ağacı (+ / ↑ / ↓ metni `listeYaz` ile yeniden yazar).
- Liste: `# Ünite` satırı + altındaki konular; boş satır sayılmaz; konuda baştaki `- `, `* `, `• `, `1.`, `1)` silinir; ilk `#`'ten önceki konular "Genel" + uyarı. Sınırlar 30 ünite / 50 konu / 80 karakter (aşılırsa Oluştur kapalı); aynı konu adı ve konusuz ünite sadece uyarı.
- Klasör adları: `Unite-NN-<ad>`, `Konu-NN-<ad>`; konu numarası kitap boyunca artar (programlamaya-giris gibi). ASCII (ä→ae, ö→oe, ü→ue, ß→ss, ğ→g, ı→i, ş→s, ç→c, İ→I), işaretler → `-`, en fazla 40 karakter. Kitap id = küçük harf (`mathe-1`); var olan id ile çakışma = Oluştur kapalı, otomatik `-2` yok.
- Plan (`kitapPlani`): kitap klasörü → ünite klasörleri → konu klasörleri → kitap.json → raf kaydı (kitaplik.json). Uebungen/Oedevler açılmaz (K6). Renk kitap.json `kapak.renk`'te, raf kitaplik.json'da.
- K4a'da Drive'a hiçbir şey yazılmadı; Oluştur K4b'de açıldı (aşağıda). `?olcum=1`: planın listesi kartta + Kopyala.
- Kod: `src/kitap/kitapListesi.ts`, `klasorAdi.ts`, `kitapPlani.ts` (saf, testli), `src/ui/kitapSihirbaziDurumu.ts` (saf, testli), `src/ui/kitapSihirbazi.ts`. Ekran görüntüleri: `node scripts/kitap-sihirbazi-kontrol.mjs`.

### Kitap oluşturma (6.K4b)
- 6.K8b: Oluştur URL parametresi gerektirmez; girişli Drive bağlamı ve doğrulanmış kök gerekir (6.K4c'den beri sahibin "Kitaplık"ında da; aşağıya bak). Örnek kitaplıkta sihirbaz yok.
- Sıra: kitap klasörü (`kitaplar/` altında) → ünite → konu klasörleri → kitap.json (surum 2) → kitaplik.json raf kaydı. Her öğede appProperties `{ defter: '1', defterIslem }`; id'ler işlem başında generateIds ile bir kez alınır, islemId ile bellekte (`KitapIslemi`; cihazda saklanmaz).
- Tekrar dene: aynı islemId + aynı id'ler; başta defterIslem araması, daha önce denenen öğede id ile get, 409 = var → kaldığı yerden, çift yok.
- Güvenlik: `kitaplar/` altında aynı adlı (bu işlemin olmayan) klasör → hiçbir şey yazılmaz: `AyniKitapVar`, defter=1 ve kitap.json yoksa `YarimKitapVar` ("Yarım kalmış bir kitap var"). Var olan klasörün içine yazılmaz.
- Raf kaydı: modifiedTime → son kitaplik.json → id hiçbir rafta yoksa seçilen rafa (yoksa ilk rafa) eklenir → modifiedTime tekrar; değiştiyse bir kez baştan, yine değiştiyse `RafKaydiCakisma`. Bilinmeyen alanlar korunur. Bekleyen raf değişikliği varsa Oluştur başlamaz.
- Hata: sihirbaz açık, metin + Tekrar dene (izin hatasında "Tekrar giriş yap"); alanlar kilitli kalır. Oluşturma sürerken Vazgeç/Esc/dışa dokunma kapalı. Başarı: sihirbaz kapanır, kitaplık yeniden yüklenir, toast "Kitap oluşturuldu: <ad>".
- Yarım kitap (6.K4b-2): defterIslem'li, kitap.json'suz kitap klasörü kitaplıkta ve arama ağacında görünmez (ağaç sadece kitaplıktaki kitapların klasörlerini tarar: `agacKitapKlasorleri`). Sihirbazda aynı ad plan engeline takılmaz; Drive kontrolü `YarimKitapVar` der ("…Başka bir ad seç; yarım klasör daha sonra çöpe atılabilir."), hiçbir şey yazılmaz. `?olcum=1` kutusunda `yarım kitap:` satırı (sayı, ad, neden, id).
- 6.K4b-3: mesaj alanı (`.ks-neden`) yapışkan alt satırda (geniş: Vazgeç/Oluştur'un solunda; ≤ 600 px: üstünde), en çok 3 satır, `aria-live`; ad hatasında (plan engeli, `AyniKitapVar`, `YarimKitapVar`) Kitap adı kutusu kırmızı çerçeve. `#kitapSihirbazi` `box-sizing: border-box` (klavye takibinin yüksekliğine dolgu eklenmesin).
- Sahip kitaplığı (6.K4c): 6.K8b itibarıyla URL şartı olmadan adla bulunan "Kitaplık"a da yazılır, sadece kökün `kitaplar/` klasörü altına. `kitaplar/` ve `kitaplik.json` kökün çocukları arasında adla bulunur (sahibinkiler işaretsiz). `kitaplar/` yoksa hiçbir şey yazılmaz (`KitaplikYapisiBeklenmedik`, klasör oluşturulmaz). Sahipte `kitaplik.json` yoksa oluşturulmaz: raf adımı atlanır, kitap "Yeni gelenler"de (toast + olcum `raf: yok`); kendi kökümüzde bu yine hata. Her oluşturmadan önce ebeveyn = kökün `kitaplar/`'ı ya da bu işlemin klasörü (`ebeveynGecerliMi`). İşaretsiz aynı adlı klasör = `AyniKitapVar`; yarım kitap kuralı ve hasUnsaved koruması aynen. kitaplik.json'da olup klasörü olmayan (çöpteki) kitap id'si sessizce atlanır, dosyadan silinmez; sihirbaz aynı id'yi seçilen raftan başka bir rafta bulursa eski kaydı oradan alır (6.K5b).
- Kod: `src/drive/kitapOlustur.ts` (testli), `OlusturAkisi`/`olusturHatasi` (`kitapSihirbaziDurumu.ts`, testli). Dev (DEV ya da `?olcum=1`): `window.defterSihirbazHata = n` → n'inci öğede yazmadan önce yapay ağ hatası (−n: yazdıktan sonra, cevap kayıp), bir kez; `?olcum=1` kutusunda işlem özeti (islemId, n/N, vardı).

### İçindekiler düzenleme (6.K5a)
- Okuyucudaki İçindekiler panelinde "Düzenle" (sadece Drive kitaplığı, sadece surum 2 + kitap.json; surum 1 / kitap.json yok → gri + not; örnek kitaplıkta düğme yok). 6.K8b: yazma URL şartı olmadan (dar ve sahip modu aynı), yalnız geçerli Drive/kök bağlamında kullanıcı işlemiyle yapılır; bağlam yoksa istek gitmez.
- İşlemler: + Ünite, + Konu (ünite altında), ad değiştir (✎ / çift dokunuş; kural `adTemizle`, `kitapListesi.ts`), ↑↓ (konu kendi ünitesinde, üniteler). Taşıma, silme, çöpe atma yok (K5b).
- Ad ve sıra SADECE kitap.json'da; Drive klasör adı ve yeri değişmez. Bellek hemen değişir (iyimser); ↑↓ 800 ms içinde tek yazma. Ekleme iyimser değil: klasör + kitap.json yazılınca görünür, o sırada "Ekleniyor…".
- Yeni ünite/konu = yeni klasör (kitapOlustur desenleri: generateIds, `defter=1` + `defterIslem`, islemId ile "var mı", 409 = var, Tekrar dene kaldığı yerden). Ünite → kitap klasörüne, konu → o kitabın ünite klasörüne; kitap klasörü kökün `kitaplar/`'ında olmalı (`ebeveynGecerliMi`, `ebeveyn.ts`).
- Numara: kitap.json'daki ve Drive'daki (yarım dahil) klasörlerin en büyüğü + 1; Konu-NN kitap boyunca; aynı ad → sonraki numara (`klasorNumarasi.ts`). Uebungen/Oedevler açılmaz.
- Klasörü bilinmeyen eski boş ünite: kitap klasöründe, `defter=1`, başka ünitenin kullanmadığı, adı tam `klasorAdi('unite', sıra, başlık)` olan TEK klasör kullanılır ve kitap.json'a `klasor` olarak yazılır; yoksa "+ Konu" gri + not (`uniteKlasoruBul`).
- kitap.json: önce okuma kaydı ve kapak kaydı bekleyenleri yazılır (`reading.flush`, `DriveSaver.bekleyenleriYaz`) → modifiedTime → son hal → değişiklik (`icindekilerUygula`; bilinmeyen alanlar, kurdeleler, kapak, durum korunur) → modifiedTime; değiştiyse bir kez baştan, sonra `IcindekilerCakisma`. Klasör önce, kitap.json en son. Ünite/konu anahtarla eşleşir (konu: `topicKey` = klasor; ünite: klasor ya da başlık).
- Hata: panelin üstünde durum satırı (Kaydediliyor…/Kaydedildi/hata + Tekrar dene / izinde Tekrar giriş yap / Vazgeç); kuyruk sırayla, hatada bekler. Başarıda arama ağacı geçersiz, masadaki sayfa yeniden çizilir.
- 6.K5a-2: Tekrar dene ilk denemeyle aynı yoldan geçer (`src/ui/icindekilerBaglami.ts`, testli): bellek → arama ağacı + masadaki sayfa → panel. Okuyucu kuyruğu her zaman dinler (düzenleme modu kapalıyken de). Yenileme hatası yazılmış işi "hata" yapmaz. Vazgeç (ad/sıra) → kitap.json son hali (`kitabiEsitle`: sadece ad ve sıra; bekleyen değişiklikler üstüne), okunamazsa işlem öncesi (`geri`). `?olcum=1` → `içindekiler:` satırı (son olaylar).
- 6.K5b-3: masadaki İçindekiler sayfasında "İçindekileri düzenle" (Düzenle ile aynı kural, `duzenleKarari`; örnek kitaplıkta yok; konulu kitapta da). Okuyucu konusuz modda açılır (`openOkuyucuDuzenle`): içerik alanında `bosDurumMetni`, panel düzenleme modunda; kalem, arama, Kitap/PDF gizli, Fotoğraf/Dosya ekle yok. Konuya dokununca normal okuma. Ekran görüntüleri: `node scripts/konusuz-kontrol.mjs`.
- Kod: `src/kitap/icindekiler.ts`, `klasorNumarasi.ts`, `src/drive/icindekilerYaz.ts` (kuyruk dahil), `src/ui/icindekilerBaglami.ts`, `src/ui/icindekilerDurumu.ts` (testli), `src/ui/icindekilerDuzenle.ts`. Ekran görüntüleri: `node scripts/icindekiler-kontrol.mjs` (Drive yok).

### Çöpe atma (6.K5b, Deniz kararı)
- "Hiçbir dosya silinmez" kuralının istisnası: konu, ünite, kitap ve yarım kitap KLASÖRÜ çöpe atılabilir; sadece `files.update` `trashed=true` (Geri al = `trashed=false`; Drive çöpünde 30 gün). `files.delete` ve `emptyTrash` asla (`scripts/silme-yok.test.ts`). Tek dosya: sadece okuyucuda açık dosya (6.K6b).
- Kök, `kitaplar/` ve `kitaplik.json` asla. Ebeveyn zinciri her denemede, yazmadan önce: konu → bu kitabın ünite klasörü → kitap klasörü → kökün `kitaplar/`'ı; kitap / yarım kitap → kökün `kitaplar/`'ı (yarım: `defter=1` + kitap.json yok). Sahip modunda da sadece kitaplık kökünün içi. Uymazsa istek yok.
- 6.K8b: URL şartı yok (dar ve sahip modu aynı); geçerli Drive/kök bağlamı ve çöpe atma onayı gerekir. Örnek kitaplıkta yok. surum 1 / kitap.json'suz kitapta sadece "Kitabı çöpe at".
- Sıra: konu/ünite → önce kitap.json'dan çıkar (K5a kuyruğu, `jsonDegistir`: modifiedTime, bilinmeyen alanlar/kurdeleler/kapak korunur; kitap `kurdele`'si çöpe giden konuya bakıyorsa `null`), sonra klasör. Kitap → önce `kitaplik.json` raf kaydı, sonra klasör. Zaten çöpte = başarı; Tekrar dene kaldığı yerden; Vazgeç = yapılanın geri alınması (kitap "Yeni gelenler"e düşmez).
- Onay penceresi gidecekleri sayar; bekleyen kalem/foto kaydı varsa önce uyarı (kayıtlar cihazdan silinmez). Kitapta ad yazılır (büyük/küçük harf ve İ/I/ı/i farkı yok).
- Geri al: 8 sn korumalı toast (diğer toast'lar sırada bekler; kitapta yeniden yüklemeden sonra en az 4 sn daha). Klasör önce, sonra kitap.json / raf eski yerine. Geri al hata verirse aynı pencere hata adımında açılır, toast gitse de tamamlanabilir. Toast kaybolunca öğe sadece Drive çöpünde kalır.
- Açık okuyucu: açık konu gidince komşu konuya geçer, konu kalmazsa kapanır; kitap gidince kitaplık yeniden yüklenir.
- Kod: `src/kitap/copeAt.ts` (saf), `src/drive/copeAt.ts`, `icindekilerCop.ts`, `kitapCop.ts`, `jsonDegistir.ts`, `src/ui/copOnay.ts`, `copOnayDurumu.ts`, `copAkisi.ts` (testli). Ekran görüntüleri: `node scripts/cop-kontrol.mjs` (Drive yok).

### Boş konu ve ilk dosyada klasör (6.K6a)
- Materyali olmayan konuda (`topic.kind = null`) çubukta Fotoğraf ekle ve Dosya ekle görünür; kalem, arama, Kitap/PDF gizli (`o-materyalsiz`). Metin "Henüz materyal yok. Dosya ekle ile başla." Konu klasörü yoksa (klasor boş ya da Drive'da yok) iki düğme gri + not. Karar: `bosKonuDurumu` (`src/okuma/bosKonu.ts`, testli).
- Boş konuda okuma durumu, kurdele ve kitap.json yazılmaz (`girildi` ancak materyal açılınca). İlk dosya eklenince materyal hemen açılır (toast var, "Göster" yok); dolu konuda 5.10f aynen.
- Dosya ekle: konu boşken varsayılan hedef Orijinal. Adlar 5.10'daki gibi (orijinal.pdf, ozet.pdf, Uebungen/<ad>, Oedevler/<ad>; aynı ad = uyarı, "(2)" yok).
- Uebungen/Oedevler yoksa URL şartı olmadan (6.K8b; dar ve sahip modu aynı, örnek kitaplıkta yok) ilk dosya eklenirken açılır; panelde not "(klasör ilk dosyada açılır)". Geçerli yazma bağlamı yoksa gri, `KlasorYok`, istek yok. Önce klasör, sonra dosya. Ofis çevirisinin geçici dosyası yine konu klasörüne; klasör sadece Ekle'de açılır.
- Klasör açma (`src/drive/altKlasorAc.ts`, testli): ebeveyn zinciri (konu → yolundaki klasörler → kitap klasörü → kökün `kitaplar/`'ı) yazmadan önce; "var mı" okuyucunun eşleştiricisiyle (`altKlasorBul`, trashed=false) → varsa o; `Übungen`/`Ödevler` adlı klasör varsa açılmaz (`AltKlasorAdiFarkli`, Deniz kararı: konuKesfi değişmez); generateIds id'si islemId başına bellekte, `defter=1` + `defterIslem`, islemAra / 409 = var; açılan klasör oturum belleğinde. Tekrar dene ikinci klasör ya da dosya açmaz.
- Ekran görüntüleri: `node scripts/bos-konu-kontrol.mjs` (Drive yok).

### Açık dosyayı çöpe at (6.K6b, Deniz kararı)
- Okuyucuda açık PDF (ve isterse çözümü) çöpe atılabilir; sadece `files.update` `trashed=true` (Geri al = `false`). Klasör hiç gitmez (boş kalan Uebungen dahil). 6.K8b: URL şartı yok; Drive kitaplığı, doğrulanmış kök, surum 2 + kitap.json gerekir; örnek kitaplıkta yok; kalem açıkken düğme gizli. Düğme `#oCop` (her genişlikte simge), dosya seçicinin yanında.
- Hedef: Übungen/Ödevler'de seçili dosya; çözüm sayfası odaktaysa sadece çözüm; Orijinal/Özet'te odaktaki sayfanın dosyası (brifing ya da sorular). X'in `X_cozum.pdf`'i varsa pencerede "Çözümü de çöpe at" (varsayılan işaretli).
- Ebeveyn (her denemede, yazmadan önce): konu → ünite → kitap → kökün `kitaplar/`'ı (`zincirKontrol`) ve dosya: beklenen adlı PDF, doğrudan konu klasöründe ya da konunun `Uebungen`/`Oedevler`'inde (`dosyaEbeveyniGecerliMi`, `ebeveyn.ts`). Uymazsa istek yok.
- Sıra: bekleyen okuma/kapak kaydı → kitap.json'dan o dosyalara bakan kurdeleler (konu `kurdeleler[materyal]`, kitap `kurdele` → null) → dosya → çözüm. Geri al tersi; kurdele sadece yeri boşsa geri konur. Bellekteki kitap da aynı.
- Geri al'da aynı klasörde aynı adlı (büyük/küçük harf duyarsız) çöpte olmayan dosya varsa hiçbir şey geri gelmez, kurdeleler konmaz: "Aynı adlı yeni bir dosya var; eski dosya Drive çöpünde kaldı." (sadece Kapat).
- Bekleyen kalem kaydı ya da yükleme → önce uyarı (kayıtlar cihazda kalır). Konuda bekleyen fotoğraf varken özet dosyası çöpe atılamaz (pencere sadece not + Kapat).
- Yükleyici: `durum` `trashed` okur; çöpteki dosyaya `uploadPdf` yazmaz (`PdfCopte`); kalem yükleyicisi bunu sessiz geçer (hata yok, tekrar yok, kayıt silinmez); Geri al'dan sonra `uploader.request`.
- Okuyucu: aynı türde komşu dosya, yoksa başka tür, hiç yoksa K6a boş konu. Dosya ekle hedefleri yeni listeden (ör. orijinal.pdf gidince Orijinal yeniden seçilebilir). Pencere açıkken Esc sadece pencereyi kapatır.
- Kod: `src/kitap/dosyaCop.ts` (saf), `src/drive/dosyaCop.ts`, `copAkisi.ts` (`dosyaCopIste`), `copOnay.ts` (`cozumKutusu`, `engel`) (testli). Ekran görüntüleri: `node scripts/dosya-cop-kontrol.mjs` (Drive yok; düğme ölçüm için zorla gösterilir).

## Faz 6.4c — El yazısı okuma (6.4c-4)
- Okuma (Claude, `api/oku`, varsayılan Haiku 5.5) SADECE kullanıcı isteyince: okuyucuda "El yazısını oku", fotoğraf eklerken "Temiz yazıya çevir" (varsayılan kapalı). Otomatik okuma yok (Deniz kararı: para boşa gitmesin).
- `api/oku` production'da da açık; sadece sahip hesabı (tokeninfo + Drive about, `VITE_SAHIP_EPOSTA`), 10 istek/dk, gövde ≤ 4 MB, JPEG ≤ 3 MB, uzun kenar ≤ 2000. Anahtar `ANTHROPIC_API_KEY` sadece Vercel env'de; yanıta/loga girmez.
- Durum sorgusu: GET `/api/oku` → `{ acik }` (sahip + anahtar; Anthropic'e istek yok, sayaca girmez). İstemci token başına bellekte tutar (`src/ocr/okumaIzni.ts`). `acik: false` ya da örnek kitaplık → okuma düğmeleri hiç görünmez.
- Arama herkes için: kitaplıkta `.ocr.json` bulguları + iki yazım (ä↔ae, ö↔oe, ü↔ue, ß↔ss), okuyucuda okunmuş sayfalar. "N sayfa henüz okunmadı" notu sadece okuyabilen hesapta.
- `?ocrKayit=1` kilidi kaldırıldı. Kontrol: `node scripts/ocr-production-kontrol.mjs [adres]`.

## Faz 6.4e — Temiz yazı görünümü (6.4e-2)
- Okunmuş fotoğraf sayfası (kaydı parmak iziyle eşleşen, `eslestir`; sayfa numarasıyla değil) okuyucuda el yazısı atlasıyla temiz yazı olarak ÖNDE görünür; fotoğraf PDF'te kalır. PDF'e ve Drive'a hiçbir şey yazılmaz (sadece GET).
- Düğme `#oTemiz` "El yazısını oku"nun yanında: "Temiz yazı (3/8)" = okunmuş / fotoğraf sayfası (fotoğraf = parmak izi `g:`); ≤ 1024 px simge + "3/8". Tek dokunuş Temiz ↔ Orijinal, aynı sayfada; ▾ balonu (6.H1b) Tükenmez / Yumuşak. Tercih `localStorage` `defter-temiz-yazi` (`{ acik, stil }`, try/catch; varsayılan açık + tükenmez). Kâğıt kareli, oynama açık.
- Düğme SADECE: Drive kitaplığı (örnek değil) + açık listede ≥ 1 eşleşen sayfa + atlas bulundu. Karar saf: `src/elYazisi/temizGorunum.ts`.
- Sıra (`okuyucuOcrKaynak.eslesmeler`): önce kayıtlar; listede sayfalı kayıt yoksa parmak izi yok (pdf-lib yüklenmez). Atlas (`atlasOkuBellekli`, oturumda bir kez; bulunamadı (null) da tutulur, hata unutulur; çıkışta temizlenir) 6.4e-2b'den beri kayıtlarla aynı anda istenir, sadece eşleşme varsa beklenir. Atlas yok/hata → düğme gizli + console.warn (eşleşme yoksa uyarı yok); okuyucu bozulmaz.
- 6.4e-2b hız (Deniz kararı): son okunan kayıt (anahtar hesap + PDF id) ve atlas (anahtar hesap) cihazda, IndexedDB `defter-temiz` (`src/okuma/temizDepo.ts`). Varsa hemen kullanılır, Drive arkadan okunur: kaydın tazesi her zaman cihaza yazılır, farklıysa liste yeniden değerlendirilir; atlas için tek arama ile id + modifiedTime bakılır, değiştiyse indirilip cihaza yazılır (sonraki açılışta). Kayda cihazda tek yazıcı: `kayitOnbellegeYaz` (`src/ocr/kayit/kayitOnbellek.ts`). `unut` cihazdaki kaydı da siler; çıkışta iki depo da boşalır; bozuk kopya / IndexedDB yok → Drive yolu. Atlas Drive'da: bilinen kök (`driveLocation().rootId`, kök araması yok) + dört ad tek aramada (`toplu`; fazlası → klasör klasör), png ve json paralel. Atlas kopyası sadece Drive araması BAŞARIYLA boş dönerse silinir; ağ hatası/401/çevrimdışında kalır. Kayıt: okuyucu PDF'in klasörünü biliyorsa (`listChildren` → `DriveFile.klasorId` → `BookPage.klasorId`) `parents` isteği atlanır; bilmiyorsa eski yol. `getPdf` aynı sürüm için aynı anda gelen çağrıları tek indirmede birleştirir. Parmak izi hesabı değişmedi (ölçümde 58 ms). Drive'a hiçbir şey yazılmaz (sadece GET). `?olcum=1` satırı: `kayıt N (bellek|cihaz|Drive) · atlas N (cihaz|Drive)`. Ölçüm (25 Ekim 2026, laptop vercel dev, ozet.pdf 3.9 MB): ilk açılış 4653 → 1931 ms (kayıt 1573 ∥ atlas 1466, Drive); F5 sonrası tekrar 418 ms (kayıt 2 ms cihaz, atlas 17 ms cihaz). Deniz kabul etti; preview/iPad ölçümü sonra.
- Açılışı bekletmez: sayfalar her zamanki gibi çizilir, cevap gelince sadece değişen sayfalar yeniden çizilir (`Mounted.yenile`; eski canvas yenisi çizilene kadar kalır, gri kutu yok). Süre `?olcum=1` kutusunda `temiz yazı:` satırı.
- Bellek: okuyucu kapanınca ocr kaynağı silinmez (izler sürüm başına, kayıt `KAYIT_OMRU_MS`); sadece çıkışta (`okuyucuOturumKapandi`).
- Çizim: aynı canvas, aynı bütçe (uyku, Safari serbest bırakma), zoom'da detail canvas'ta görünen bölge (`temizSayfaCiz` `bolge`). Kitap ve PDF modunda. `o-temizsayfa` sadece işaret (stil yok).
- 6.4e-4 (Deniz kararı, 25 Ekim): kalem açılınca görünüm değişmez; düğme kalemle de çalışır. Her görünümün kendi çizgileri: temiz gösterilen sayfada sadece temiz notlar, orijinalde sadece anahtarsız notlar; okunmamış sayfalar hep orijinal. Yeni çizgi sayfanın o anki görünümünü alır; silgi ve geri al/yinele sadece görünen kümeye (görünüm başına ayrı geçmiş; geri al, sayfaları şu an o görünümü gösteren en yeni işlemi alır; iki görünüme dokunan silgi sürüklemesi iki işlem). Katman hiç gizlenmez, sadece filtrelenir (`PenModel.inks(key, sayfa, görünüm)`, Okuyucu `sayfaGorunumu`).
- Kabul edildi (Deniz): temiz yazıdaki çizgiler, elle düzeltme ya da yeniden okuma sonrası yazı kayarsa yerinden kayabilir.
- 6.4e-4 canlıya çıktı (25 Ekim 2026, e56f592; production defter-jade.vercel.app). Sadece eski sürümü açık kalmış (yenilenmemiş) bir cihazda risk sürer: eski `pdfKayit` dokunduğu sayfanın bütün Defter notlarını /DefterGorunum'suz ve `/F 4` ile yeniden yazar: o sayfadaki temiz çizgiler silinmez ama kalıcı olarak orijinale döner (fotoğrafın üstünde görünür). Eski sürüm temiz çizgileri fotoğrafın üstünde gösterir, eski silgi onları silebilir.
- "El yazısını oku" panelinde kaydedilen sayfa ve "Temiz yazıya çevir" bitince: `unut` + yeniden değerlendirme (300 ms) → okuyucu kapanmadan temiz yazıya geçer.
- Dizgi (6.4e-2): yedek yazı ağırlık 400, kâğıda %15; atlasta olmayan `·` (formülde `\cdot` dahil) mürekkep renginde dolu nokta (yarıçap 0.1·xh, x-yüksekliğinin ortası), eksik sayılmaz.
- Kod: `src/elYazisi/temizGorunum.ts`, `src/okuma/temizYaziOkuyucu.ts` (testli), `temizYaziBagla.ts` (tembel), `src/ui/temizDugme.ts`, `src/okuma/temizIz.ts`. Dev: `window.defterTemizSahte({ sayfalar, fotograf?, atlasJson, atlasPng })` (sadece `npm run dev`, `src/okuma/temizSahte.ts`). Ekran görüntüleri: `node scripts/temiz-yazi-okuyucu-kontrol.mjs` (Drive yok; atlas paketi yoksa atlar).

## Faz 6.4e-3 — Okunan kelimeyi elle düzeltme
- "El yazısını oku" panelinde okunan metin kelime kelime dokunulabilir (sadece okuma izni olan hesapta, `okumaIzni`; diğerlerinde salt okunur). Satır içi kutu: Kaydet / Vazgeç (Enter / Esc) + elle düzeltilmiş kelimede Geri al. Formül ve üstü çizili parça düzenlenmez; boş kelime yok; boşluklu birden çok kelime olur. API çağrısı yok.
- Kayıt: parçanın `metin`i (yazıldığı gibi) DEĞİŞMEZ; `duzeltme` = (varsa düzeltme, yoksa metin) içinde o kelime değişmiş hali + `elle: true`. Metne dönünce iki alan silinir. Geri al: kelime sayısı aynıysa o kelime metindekine döner, değilse parçanın bütün elle düzeltmesi kalkar. Şema surum 1 (eski sürüm `elle`'yi bilinmeyen alan olarak korur).
- Yazma `duzeltmeYaz` (`kayitDrive.ts`): sayfaYaz ile aynı yol (kilit, son hal, headRevisionId, 3 tur); dosya oluşturmaz. Sayfa yeniden okunmuşsa (parmak izi + `okunma`) ya da parça değişmişse yazılmaz (`OcrSayfaDegisti`).
- Kaydedince: kayıt okuyucu belleğine ve cihaz kopyasına (`guncelle` → `kayitOnbellegeYaz`; `unut` değil), temiz yazı hemen yeniden değerlendirilir. "Tekrar oku" elle düzeltmeli sayfada önce sorar (`confirm`).
- Kod: `src/ocr/kayit/elleDuzelt.ts` (saf, testli), `okunanMetin.ts`, `okuyucuPanel.ts`.
- 6.4e-2b + 6.4e-3 canlıya çıktı (25 Ekim 2026, ba6c96e; production defter-jade.vercel.app).

## 6.S — Kitap modu yerleşimi
- 6.S-2: kitap modunda alan (`#oKitap`) değişince (kaydırıcı, kalem çubuğu, döndürme) kitap yeniden dizilir (ResizeObserver, `yenidenDuzenGerekir`); kalem basılıyken ertelenir, kalkınca bir kez dizilir.
- 6.S-2b: kitap modunda sayfa içeriği kâğıt yuvasının içinde her kenarda pay kadar içeride (`KITAP_KAGIT_PAYI = 0.04`, yuva eninin oranı; `fitPage`, `kitapDuzen.ts`). Kâğıt yuvanın tamamını kaplar. Kalem, arama, temiz yazı ve zoom aynı içerik kutusunu (`.o-page`) kullanır; PDF koordinatı değişmez.
- 6.S-2b: PDF canvas'ları (ana + zoom detay, temiz yazı dahil) `.o-baski` kutusunda; kitap modunda kutu tek parça `multiply` ile kâğıda basılır (beyaz → kâğıt rengi). Kalem ve arama katmanları kutunun dışında, multiply olmaz. PDF modu değişmez.
- 6.K5b-4 / 6.S-1b: okuyucu açıkken altında kayan bir şey olmayan yerde parmak/kalem hareketi iptal edilir (`okuyucuKaydirma.ts`; iPad sayfa kayması). İstisna (6.S-1b): dokunuş bir kontrolün (`KONTROLLER`, `sayfaZoom.ts`) üstünde başladıysa ve başlangıçtan 10 px'ten az kaydıysa iptal yok (`kaymaIptalMi`; kalemle düğme dokunuşu click üretsin). Pay bir kez aşılınca bugünkü kural.
- Kontrol: `node scripts/kitap-sigdir-kontrol.mjs` (Drive yok; sığma, pay, kalem 0.00 pt, pay 0 | 0.04 karşılaştırma görüntüleri).

## 6.S-4 — Araya boş not sayfası (Deniz kararı)
- Okuyucuda `#oSayfaEkle` (+, malzeme çubuğunda, kalem açıkken de): balon Önüne / Arkasına + Düz / Kareli / Çizgili; desene dokununca eklenir. Silme (boş sayfa dahil) 6.S-4d'deki "Bu sayfayı sil" ile. Sadece Drive kitaplığı, surum 2 + kitap.json, materyal açık. Kalem yazamazsa (şifreli/imzalı/okunamaz) desenler gri + aynı açıklama.
- Hedef: PDF modu odaktaki sayfa. Kitap modu (6.S-4b, Deniz kararı): okunan sayfa = son dokunulan taraf (dokunuş ya da kalem; yoksa sol); iki sayfa PDF ise balonda "Okuduğun sayfa: Sol (s. N) / Sağ (s. N)". Önüne/Arkasına o sayfaya göre. İş bitince (ekle ve kaldır) okunan sayfa ekranda kalır, boş sayfa karşı tarafta (kaldırmada komşu sayfa kendi tarafında); gerekirse çift bir sayfa kayar (`BookView.ofset` 0/1; ofset 1'de ilk çift solda boş kâğıt + 1. sayfa). Ofset çevirme, kaydırıcı/içindekiler/arama atlaması ve döndürmede korunur; yeni materyal/konu, mod değişimi ve okuyucu yeniden açılınca 0. Tek sayfa (dikey) ve PDF modu 6.S-4 gibi. Karar: `src/ui/sayfaEkleDurumu.ts` (`kitapCiftiSonrasi`), `src/okuma/kitapDuzen.ts` (`spreadStart` ofset).
- Sayfa (`src/defter/bosSayfa.ts`, saf, testli): pdf-lib ile gerçek sayfa; boyut = komşunun görünür kutusu (CropBox yoksa MediaBox, /Rotate uygulanmış; yeni sayfa döndürülmemiş, MediaBox [0 0 w h]). Kare 5 mm, çizgi 8 mm, sol üstten, kenar payı 0, vektör; ton ve kalınlık tek yerden (`src/elYazisi/kagitCizgi.ts`, temiz yazıyla aynı: kâğıt − 16, 0.35 pt). Sayfa sözlüğünde `/DefterBosSayfa` (islemId) + `/DefterBosDesen`; içerik akışı `% DefterBosSayfa <islemId>` ile başlar (her boş sayfanın parmak izi ayrı). Aynı islemId varsa ekleme yok (zatenVar). 6.S-4d'den beri eski "kaldır" yolu (`bosSayfaKaldir`) yok; `SayfaIsi.tur = 'kaldir'` sadece cihazda kalmış eski işlerin kalan adımları için.
- Yazma: `ozeteSayfaEkle` → kalem kuyruğu (`sirada`) → `ekleVeYukle` (3 deneme, PdfConflict, headRevisionId, yedek, yüzde); ikinci yükleme yolu yok. Kuyrukta önce dosyanın bekleyen çizgileri gider; sonra hâlâ kaydedilmemiş çizgi varsa yazılmaz (`KalemKaydiBekliyor`). İş sürerken o dosyaya kalem çizmez, kurdele kaydedilmez. Drive'daki sürüm ekrandakinden yeniyse komşunun parmak izi çapa olur (`komsuIzi`), bulunamazsa `SayfaYeriDegisti`.
- Sıra (`src/defter/bosSayfaIsi.ts`, testli): PDF → kitap.json kurdeleleri (`jsonDegistir`; o konunun `kurdeleler[*]` + kitabın `kurdele`'si, `dosya` = bu PDF) → `.ocr.json` sayfa numaraları (`kaydirmaYaz`, sadece varsa; kaldırılan sayfanın kaydı parmak iziyle silinir) → okuyucu yeni sürümde yeni sayfada. Kural: `src/kitap/sayfaKaydir.ts` (eklenen indeksten sonrası +1 / −1; kaldırılan sayfadaki kurdele bir öncekine).
- Yarıda kalırsa: PDF adımı bitince iş cihaza (IndexedDB `defter-sayfa-isi`, `src/okuma/sayfaIsiDepo.ts`); kalan adımlar "Tekrar dene", çevrimiçi olunca ve okuyucu açılınca; yapılmış adım tekrar yapılmaz. PDF adımı hatası saklanmaz (Tekrar dene aynı islemId). Kabul: kitap.json yazılıp cevap kaybolursa kurdele bir kez daha kayabilir. Çıkışta iş deposu boşalır.
- Önbellekler: yeni baytlar PDF önbelleğine; o dosyanın sayfa listesi önbellekleri, okuyucu metni, ocr kaynağı, balon bilgisi, arama ağacı geçersiz; kalem modeli yeni sürüme (dosyadaki çizgilerden), geri al/yinele geçmişi temizlenir (`gecmisiTemizle`); okuyucu araması kapanır.
- Dev: `window.defterBosSayfaSahte({ kitapJson, ocr })` (sadece `npm run dev`, `src/okuma/bosSayfaSahte.ts`): ekrandaki dosyaya bellek içi yazılabilir kopya. Kontrol: `node scripts/bos-sayfa-kontrol.mjs` (Drive yok).
- 6.S-4c boyut: komşunun görünür kutusu yatay ya da kare (en ≥ boy, /Rotate uygulanmış) → boş sayfa A4 dikey (595.28 × 841.89); dikeyse komşu boyutu (`dikeyBoyut`, `bosSayfa.ts`).
- 6.S-4c "Deftere yapıştır" (Deniz kararı): balonda okunan sayfa yatay/kare ise desen (Düz/Kareli/Çizgili) + "Bu sayfa" / "Dosyadaki tüm yatay sayfalar (N)"; yapıştırılmış sayfada "Deftere yapıştırmayı geri al". Kural: yapıştırma SADECE kutu büyütür, içerik taşınmaz. MediaBox ve sayfada olan CropBox/TrimBox/BleedBox/ArtBox görünür dikey yönde (Rotate 90/270: x'te) aynı d ile büyür: yeni görünür boy = en × √2. İçerik akışı, notlar ve koordinatları aynı; sayfa sayısı aynı → kurdele/.ocr.json kaydırması yok (işin sadece PDF adımı var).
- 6.S-4c bantlar: sayfanın akışlarının ÖNÜNE ayrı akış (`/DefterYapistir true`; q, bantlara kırpma, beyaz zemin, 6.S-4 deseni, Q); slaytın üstüne çizilmez. Bu akış parmak izine girmez (`parmakIzi.ts`): okunmuş metin eşleşmesi kaybolmaz. İşaret `/DefterYapistir << /Eski /Kalitim /EskiContents /Akis /Desen /IslemId >>`; aynı islemId = zatenVar, yapıştırılmış sayfa atlanır. Geri al: kutular ve Contents eski değerleriyle (kalıtılmış kutu sayfadan silinir), akış ve işaret gider. Bantta Defter Ink notu (Rect eski görünür kutunun dışına taşan) varsa onay "Slaytın dışındaki kalem yazısı da silinecek"; evet → o notlar silinir, hayır → iptal; iş sırasında yeni bant notu → `BantNotuVar`, hiçbir şey yazılmaz.
- 6.S-4c yazma: 6.S-4 gibi kalem kuyruğu, `ekleVeYukle` (`EkKaynak { yapistir } | { yapistirGeriAl }`), iş kaydı + Tekrar dene, bekleyen kalem kaydı varken başlamaz; kalem yazamaz dosyada düğmeler gri (aynı açıklama). Kod: `src/defter/yapistir.ts` (saf, testli), `yapistirHedefi` (`sayfaEkleDurumu.ts`). Kontrol: `node scripts/bos-sayfa-kontrol.mjs --4c`.

## 6.S-4d — Sayfa silme + Geri al (Deniz kararı)
- Kural: HER sayfa (kullanıcının, fotoğraf, ek dosya, boş, yapıştırılmış) silinebilir; sadece onaylı, yedekli ve Geri al ile. Son sayfa silinmez (`SonSayfaSilinemez`); form alanlı (Widget) sayfa silinmez (`FormAlaniVar`); imzalı/şifreli → `PdfYazilamaz`.
- Balon: okunan sayfa (6.S-4b seçimi) için "Bu sayfayı sil" (kırmızı metin). Onay: "s. N silinecek. Sayfadaki kalem yazısı ve okunmuş el yazısı da gider. Geri al ile hemen geri getirebilirsin." Gri nedenleri `silmeEngeli` (iş sürüyor, PDF sayfası değil, kalem yazamaz, el yazısı okunuyor, son sayfa). Bu oturumun son silineni açık listedeki bir dosyadaysa "Son silineni geri getir". Silince toast "Sayfa silindi · Geri al" (10 sn, korumalı).
- Saf (`src/defter/sayfaSil.ts`, testli): `sayfaSil` sayfayı parmak iziyle bulur (`izleBul`, indeks sadece yakınlık), silinen sayfa `copyPages` ile tek sayfalık PDF (notları, Defter Ink id'leri, kutular, Rotate), çapa = önceki sayfanın izi (ilk sayfada sonrakinin). `sayfaGeriKoy`: çapa ile yer; bulunamazsa sona (`sonaEklendi`, toast söyler); `/DefterGeriId = islemId` (zatenVar).
- Yazma: 6.S-4 yolu (`EkKaynak { sayfaSil } | { sayfaGeriKoy }`, kalem kuyruğu, `ekleVeYukle`: 3 deneme, çakışma, headRevisionId, keepForever yedeği). Yedek cihaza YÜKLEMEDEN ÖNCE yazılır (`yedekle`); yazılamazsa Drive'a hiçbir şey gitmez. Tekrar denemede cihazda yedek varsa ve dosya bir sayfa eksikse → zaten silinmiş (ikinci sayfa silinmez).
- Yedek deposu: IndexedDB `defter-silinen-sayfa` (`src/okuma/silinenSayfaDepo.ts`): sayfa baytı, yer, çapa, taraf, üstündeki kurdeleler; `tamam` PDF adımından sonra (sadece tamam olan geri getirilir). 7 gün / en çok son 5 (her silmeden sonra ve okuyucu açılınca budanır); başarılı Geri al'da silinir; çıkışta boşalır.
- Kayma: kurdele 6.S-4 gibi (silinen sayfadaki bir öncekine); üstündeki kurdeleler yedek kaydına yazılır, Geri al'da sayfa yerine dönünce eski sayfalarına geri (`silinenKurdeleler`, `kurdeleGeriKoy`). `.ocr.json`: silinen sayfanın kaydı `silinenler: [{ islemId, sira, sayfa }]` alanına (sonrakiler −1; aynı iz başka sayfada da varsa sadece o numaradaki), Geri al'da eski sırasına (`ocrSil`, `ocrGeriKoy`, `sayfaKaydir.ts`); sil + geri al sonrası JSON aynı. `silinenler` isteğe bağlı, eski sürüm bilinmeyen alan olarak korur; iki `.ocr.json` kopyası birleşirken `silinenler` de birleşir (islemId + parmak izi, okunması yeni olan kalır; `birlestir.ts`).
- Ekran: silmeden sonra kitap modunda yanındaki sayfa kendi tarafında (`silmeSonrasiOkunan`), PDF modunda bir önceki sayfa; Geri al'dan sonra geri gelen sayfa (kitap modunda silindiği tarafta). Önbellekler 6.S-4 gibi.
- Bilinen sınır: PDF'in yer imleri (bookmark) silinen sayfaya bakıyorsa Geri al'da yeniden bağlanmaz (geri gelen sayfa yeni nesne).
- Kod: `sayfaSil.ts`, `ozeteEkle.ts` (`SilinenYedek`), `bosSayfaIsi.ts` (`yeniSilmeIsi`, `yeniGeriKoymaIsi`), `sayfaKaydir.ts`, `silinenSayfaDepo.ts`, `sayfaEkleDurumu.ts` (`silmeHedefi`, `silmeEngeli`, `silOnay`, `geriGetirGorunur`), `sayfaEkleBalon.ts`, `Okuyucu.ts` (`sayfaSilBasla`, `silineniGeriGetir`). Kontrol: `node scripts/bos-sayfa-kontrol.mjs --4d`.

## 6.5-2b — Dil tercihi Drive'da (Deniz kararı)
- Yer: `kitaplik.json` → `ayarlar.dil` (`en` | `tr`, isteğe bağlı). Yeni dosya yok. Diğer yazıcılar dosyanın son halinin üstüne yazar, alanı korur (`save.test.ts`).
- Yazma (`dilTercihiYaz`, `src/drive/dilTercihi.ts`: `jsonDegistir` ile modifiedTime → son hal → sadece `ayarlar.dil` → modifiedTime): (a) girişli Drive kitaplığında dil düğmesine basınca, yeniden yüklemeden önce, en çok 3 sn (bu sırada dil düğmesi kapalı); hata/zaman aşımı dili durdurmaz. (b) Kurulumda yeni `kitaplik.json` seçili dille (adreste `?lang` varsa alan yok). (c) Girişten sonra Drive'da dil yoksa ve cihazda açık seçim varsa bir kez. Seçim hiç yoksa hiçbir şey yazılmaz. `kitaplik.json` yoksa (sahibin Kitaplık'ı) dil yazılmaz, dosya oluşturulmaz.
- Okuma: kitaplık yüklenince Drive'ın dili sayfanınkinden farklıysa localStorage'a yazılır + dönüş kaydıyla BİR KEZ yeniden yüklenir (sessionStorage `defter-dil-drive-yenilendi`; bayrak tutulamıyorsa yenileme yok). Bilinmeyen değer (ör. `de`) dokunulmaz.
- `?lang` adresteyse Drive tercihi o açılışta ne uygulanır ne yazılır. Düğmeye basmak açık seçimdir (adresten `?lang` silinir), yazılır.
- Bekleyen: yazılamayan seçim localStorage `defter-dil-bekleyen = { dil, fileId }`; bir sonraki açılışta önce o yazılır (Drive'daki eski dil sayfayı geri çevirmez). Başka `fileId` (başka hesap/kitaplık) → bayrak silinir, yazılmaz.
- Örnek kitaplıkta ve girişsizken Drive'a dil okunmaz/yazılmaz. Bilinen: başka cihazda ilk girişte kitaplık bir an eski dilde görünür, sonra yenilenir (kabul edildi).
- Kod: `src/dil/driveTercih.ts` (`tercihKarari`, `ayarlarDilYaz`, bayraklar; saf, testli), `src/drive/dilTercihi.ts` (testli), `main.ts` (`dilDriveYaz`, `dilTercihiUygula`). Kontrol: `node scripts/dil-drive-kontrol.mjs` (sahte GIS + Drive, `npm run dev` 5173).

## Sonra bakılabilir
- Oda zaman aşımı: şu an glb yüklemesine toplam 15 sn veriliyor; yavaş bağlantıda (masaüstü lightmap'leri ~3.3 MB) eski odaya düşüyor. Öneri: "15 sn hiç ilerleme yok" kuralı + yükleme göstergesi. Faz 2 kural metni değişeceği için Deniz'in onayı gerekir.
- Masaüstü lightmap PNG'lerinin küçültülmesi (boyut/sıkıştırma).
- gifsicle: sadece `npm run screenshots` için devDependency, `npm audit`'teki 20 uyarının kaynağı. Kaldırılması ya da başka araçla değiştirilmesi.
- İki sekmede aynı dosya: iki ayrı çizim modeli ve bekleyen kayıt; birbirini görmüyorlar.
- Hiç açılmayan dosyaların bekleyen kayıtları: yükleme dosya açılınca tetikleniyor; kaydı olan ama bir daha açılmayan dosya cihazda bekler.
- Brifing + sorular aynı listede görünürken sorular.pdf'e sayfa eklenirse açık listede sorular'ın sayfa sayısı konu yeniden açılana kadar eski kalır.
- İki sekme ya da iki cihaz aynı anda aynı dosyayı aynı konuya eklerse çift dosya oluşabilir (kilit sadece sekme içinde).
- Testler ara sıra 1 hata veriyor (647'den 1; hangi test olduğu bilinmiyor); kaynağı bulunmalı.
- Telefonda dosya seçim kutusu 56 px'e kadar daralıyor.
- koseB: el/köşe gölgesinde uyarlamalı eşik (6.2d-2 Öneri 2) yapılmadı; gölgeli sentetik örneklerde "Kırpılamadı" çıkıyor.
- koseB spiral/karşı sayfa: kenar görüntü çerçevesine dayanınca içeri daha geniş arama (wa-2303-2, wa-2303-4).
- koseB: wa-1857-kose güven 0.56 ile yanlış kırpıyor.
- Her fotoğraf eklemede ve kalem kaydında ozet.pdf'in tamamı yeniden yükleniyor (22 MB'ta ~26 sn). Mimari çözüm adayı: defter fotoğraflarını ayrı/küçük PDF'lere eklemek (Faz 5 kararını değiştirir, Deniz onayı gerekir).
- Fotoğraf küçültme (1600 px / JPEG 0.80) ile bugünkü (2000 px / 0.85) karşılaştırması yapılmadı.
- Sayfa yenilenince yarım kalan yükleme kaldığı yerden devam etmiyor (baştan yükleniyor).
- Masadaki açık kitabın İçindekiler sayfası uzun listede taşıyor (kesiliyor, kaydırma yok; 6.K5a'dan önce de böyleydi).
- Okuyucudaki × (kapat) düğmeleri 36 px (iPad için 40–44 px önerilir).
- 'Kurulumu tamamla'da `kitaplik.json` zaten varsa (sadece `kitaplar/` eksikse) örnek kitap rafa değil "Yeni gelenler"e düşüyor (kitaplik.json güncellenmez).
