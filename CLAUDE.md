# Defter – sanal kitaplık uygulaması

Bu dosya Claude Code'un her oturumda okuduğu proje kurallarıdır. Değiştirmeden önce Deniz'e sor.

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
- `kitaplik.json`: `{ surum, raflar: [{ id, ad, kitaplar: [kitapId] }], oda: { duvar, zemin, mod } }`
- `kitap.json`: `{ surum, baslik, sirt, kod, ders, dil?, kapak: { renk, stil: "kumas"|"deri" }, sonAcilis, kurdele, bolumler: [{ baslik, durum: "okunmadi"|"okunuyor"|"okundu"|"calisildi"|"tekrar", kaynaklar: [{ tur: "pdf"|"defter"|"claude"|"link", dosya, sayfalar? }] }] }`
- `dil` isteğe bağlıdır. `"en"` ise sırt ve kapak yazıları İngilizce kurala göre büyük harfe çevrilir (i → I). Yoksa ya da başka bir dilse Türkçe kural geçerlidir (i → İ). Dil başlıktan tahmin edilmez.
- `kitap.json` yoksa kitap yine görünür (klasör adıyla, gri kapak).
- Hiçbir rafta olmayan kitaplar "Yeni gelenler" yığınında görünür.
- Bilinmeyen alanları silme; okurken koru, yazarken geri yaz.

## Değişmez kurallar
- Uygulama Drive'daki dosyaları **kopyalamaz, taşımaz, silmez**. Faz 1'de sadece `kitaplik.json` ve `kitap.json` içindeki `kapak` alanı yazılabilir. Faz 5'ten itibaren: `kitaplar/<kitap>/` altında yeni PDF oluşturma ve PDF'in sonuna sayfa ekleme izinli (bkz. Faz 5).
- Tek istisna: Kitaplık/ klasöründe kitaplik.json yoksa ilk raf/oda değişikliğinde bir kez oluşturulur. Başka hiçbir dosya oluşturulmaz; tek ek istisna Faz 5'teki PDF oluşturma kuralıdır. Uygulamanın kendi kökü (kurulum) için bkz. Faz 6.K.
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
- Faz 6 Akıllı özellikler: Word/PPT otomatik çeviri (Drive) ← bitti (6.1), arama ← bitti (6.3), OCR, quiz/özet

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
- kitaplik.json: raflar ve oda (Faz 1'deki gibi).
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
- Uygulamanın notları özel `/DefterId` anahtarıyla (ve /T "Defter") işaretlenir. Sadece /DefterId işaretli Ink annotation'lar eklenir/değişir/silinir. Sayfa içeriği, başka notlar, form alanları, metadata ve sayfa sırası korunur (Faz 5: sadece sona yeni sayfa eklenebilir). İmzalı PDF'e yazılmaz.
- Çizgi şekli tek kaynak: `src/kalem/cizgiSekli.ts`. Kalem = perfect-freehand dış hattı, dolgu; fosforlu = orta noktalardan yumuşatılmış eğri, sabit kalınlık. Canlı çizim, okuma katmanı ve /AP aynı fonksiyonu kullanır. /AP kalemde dış hat dolgu (f), fosforluda yumuşak eğri (S). /InkList merkez çizgi olarak kalır.
- Apple Pencil basıncı `basinc` (nokta başına 0–1, 2 ondalık) PDF'te `/DefterBasinc` dizisinde; basınç yoksa (fare, parmak) hızdan tahmin edilir.
- 6.H2b (Deniz kararı): düz basınç (en çok − en az < 0.02, ör. ESR kalem hep 0.12) = basınç yok → kalemde sabit kalınlık (seçilen kalınlık, hız tahmini yok). Düz basınç `/DefterBasinc`'e yine yazılır (basınçsız kalem işareti); eski 0.12'li çizgiler de sabit çizilir. Fare/parmak (basınç hiç yok) hızdan tahminle kalır. Karar: `hasRealPressure` (`cizgiSekli.ts`).
- 6.H2b: perfect-freehand 1/16 pt biriminde çalışır (sabit uzunlukları pt'de çok büyüktü: uçlarda 2–3.6 pt düz parça); uçta yuvarlak başın kapladığı kanca noktaları çizimde atlanır. Canlı çizim bitmiş hâliyle çizilir (kalkınca şekil değişmez).
- 6.H2b nokta kuralları (`koordinat.ts`): adım ≤ 1 ekran px, en çok 0.5 pt (`minStep`); noktalar 0.01 pt'ye yuvarlanır; pointerup noktası son nokta olarak eklenir (basıncı son basınç); son alınan noktadan eski (ya da aynı zaman + aynı yer) coalesced/move atılır (`EventOrder`; iPad'de aynı move iki kez geldi).
- 6.H2b fosforlu: merkez eğri 0.5 pt'lik kısa düz parçalarla stroke edilir (SVG `L`, /AP `l`, round cap/join); sıkı kıvrımda katlanma deliği olmasın diye. Dev: `?kalemTest=1` eski/yeni karşılaştırma, `node scripts/kalem-test-kontrol.mjs` ekran görüntüleri.
- Kalemin opaklığı her zaman 1, fosforlununki 0–1 arası (1 hariç).

### Okuma modu
- Defter notları pdf.js canvas'ında çizilmez (annotationMode ENABLE_STORAGE + noView); başka programların notları görünür.
- Çizgiler önce getAnnotations verisiyle SVG katmanında gösterilir (Ink + /T "Defter"; kalınlık: borderStyle.rawWidth; opaklık < 1 → fosforlu). Dosyanın modeli (pdf-lib, basınç dahil) yüklenince modelden çizilir. Kalem modunda id ve araç pdf-lib readDefterStrokes ile kesin okunur.
- Hata ayıklama: `?defterNot=goster` (katman yok, pdf.js kendisi çizer).

### pdf-lib
- Tam sürüm 1.17.1, tembel yüklenir (`await import('pdf-lib')`): kalem modunda, ya da okuma modunda Defter notu veya bekleyen kaydı olan bir dosya açılınca. Diğer dosyalarda hiç yüklenmez; ilk açılış paketine girmez.

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
- Sayfa sadece sona eklenir. Var olan sayfaların içeriği ve sırası değişmez; Defter notları, kurdeleler ve sayfa numaraları korunur.
- Sayfa ekleme kalemin yazma kuyruğundan (PdfKayit) geçer; aynı dosyaya iki ayrı yükleyici yazmaz. Önce bekleyen çizgiler, sonra sayfa ekleme.
- Yedek (keepForever, ensureOriginalKept) ve çakışma kontrolü (modifiedTime, headRevisionId, PdfConflict) aynen uygulanır.

### Cihazda saklama
- Eklenmeyi bekleyen fotoğraflar yükleme bitene kadar IndexedDB'de saklanır; hiçbir hatada silinmez.

### Dosya ekle (5.10)
- Okuyucudaki "Dosya ekle": dosya sadece açık konunun klasörüne (`kitaplar/<kitap>/` altında) ve sadece PDF olarak eklenir. Görsel → tek sayfalı PDF; birden çok görsel → tek PDF (sırala/sil/+, kırpma yok). Kod: `src/defter/dosyaTuru.ts`, `dosyaHazirla.ts`, `konuyaDosyaEkle.ts`, `src/ui/dosyaPanel.ts`.
- Hedefler: Übungen (`Uebungen/`), Ödevler (`Oedevler/`), Çözüm (`X_cozum.pdf`, `X.pdf`'in klasörüne), Orijinal (sadece `orijinal.pdf` yoksa), Özet (sadece hiç özet yoksa; tek `brifing.pdf` de özet sayılır).
- Klasör oluşturulmaz: `Uebungen/` ya da `Oedevler/` yoksa o hedef gri (seçilemez); yine de istenirse hata (KlasorYok).
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
- Korumalar: `?kurulum=1` kilidi (yoksa `KurulumKilitli`, hiç istek yok); girişli ve örnek kitaplık değil (yoksa `KurulumYazmaYok`). Hatalar: `KurulumIzinYok`, `KurulumAgHatasi`, `KurulumBeklenmedik`.
- Dev (sadece `npm run dev`): `window.defterKokDurumu()` (salt okunur), `window.defterKurulumDene(islemId?)` (`?kurulum=1` şart). Örnek kitap K3'te.

### "Kitaplığını kur" kartı (6.K2b)
- Eski "Kitaplık bulunamadı" kartının yerine. Kök yok → "Kitaplığı kur"; defterKok kökü yarım (ya da cokKok'ta en eskisi yarım) → "Kurulumu tamamla". Sahibin eski "Kitaplık"ı (yarım da olsa) eskisi gibi yüklenir.
- Öncelik: sahip `drive.file` ile girdiyse "Tam erişim gerekiyor" kartı. Karar saf: `kartSec` (`src/ui/kurulumDurumu.ts`, testli).
- `?kurulum=1` yoksa ana düğme gri + "Kurulum şimdilik kilitli (deneme)"; istek gitmez.
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
- Oluştur sadece `?kurulum=1` ile açık (6.K4c'den beri sahibin "Kitaplık"ında da; aşağıya bak). Kilit yoksa gri. Örnek kitaplıkta sihirbaz yok.
- Sıra: kitap klasörü (`kitaplar/` altında) → ünite → konu klasörleri → kitap.json (surum 2) → kitaplik.json raf kaydı. Her öğede appProperties `{ defter: '1', defterIslem }`; id'ler işlem başında generateIds ile bir kez alınır, islemId ile bellekte (`KitapIslemi`; cihazda saklanmaz).
- Tekrar dene: aynı islemId + aynı id'ler; başta defterIslem araması, daha önce denenen öğede id ile get, 409 = var → kaldığı yerden, çift yok.
- Güvenlik: `kitaplar/` altında aynı adlı (bu işlemin olmayan) klasör → hiçbir şey yazılmaz: `AyniKitapVar`, defter=1 ve kitap.json yoksa `YarimKitapVar` ("Yarım kalmış bir kitap var"). Var olan klasörün içine yazılmaz.
- Raf kaydı: modifiedTime → son kitaplik.json → id hiçbir rafta yoksa seçilen rafa (yoksa ilk rafa) eklenir → modifiedTime tekrar; değiştiyse bir kez baştan, yine değiştiyse `RafKaydiCakisma`. Bilinmeyen alanlar korunur. Bekleyen raf değişikliği varsa Oluştur başlamaz.
- Hata: sihirbaz açık, metin + Tekrar dene (izin hatasında "Tekrar giriş yap"); alanlar kilitli kalır. Oluşturma sürerken Vazgeç/Esc/dışa dokunma kapalı. Başarı: sihirbaz kapanır, kitaplık yeniden yüklenir, toast "Kitap oluşturuldu: <ad>".
- Yarım kitap (6.K4b-2): defterIslem'li, kitap.json'suz kitap klasörü kitaplıkta ve arama ağacında görünmez (ağaç sadece kitaplıktaki kitapların klasörlerini tarar: `agacKitapKlasorleri`). Sihirbazda aynı ad plan engeline takılmaz; Drive kontrolü `YarimKitapVar` der ("…Başka bir ad seç; yarım klasör daha sonra çöpe atılabilir."), hiçbir şey yazılmaz. `?olcum=1` kutusunda `yarım kitap:` satırı (sayı, ad, neden, id).
- 6.K4b-3: mesaj alanı (`.ks-neden`) yapışkan alt satırda (geniş: Vazgeç/Oluştur'un solunda; ≤ 600 px: üstünde), en çok 3 satır, `aria-live`; ad hatasında (plan engeli, `AyniKitapVar`, `YarimKitapVar`) Kitap adı kutusu kırmızı çerçeve. `#kitapSihirbazi` `box-sizing: border-box` (klavye takibinin yüksekliğine dolgu eklenmesin).
- Sahip kitaplığı (6.K4c): `?kurulum=1` ile adla bulunan "Kitaplık"a da yazılır, sadece kökün `kitaplar/` klasörü altına. `kitaplar/` ve `kitaplik.json` kökün çocukları arasında adla bulunur (sahibinkiler işaretsiz). `kitaplar/` yoksa hiçbir şey yazılmaz (`KitaplikYapisiBeklenmedik`, klasör oluşturulmaz). Sahipte `kitaplik.json` yoksa oluşturulmaz: raf adımı atlanır, kitap "Yeni gelenler"de (toast + olcum `raf: yok`); kendi kökümüzde bu yine hata. Her oluşturmadan önce ebeveyn = kökün `kitaplar/`'ı ya da bu işlemin klasörü (`ebeveynGecerliMi`). İşaretsiz aynı adlı klasör = `AyniKitapVar`; yarım kitap kuralı ve hasUnsaved koruması aynen. kitaplik.json'da olup klasörü olmayan (çöpteki) kitap id'si sessizce atlanır, dosyadan silinmez (K5).
- Kod: `src/drive/kitapOlustur.ts` (testli), `OlusturAkisi`/`olusturHatasi` (`kitapSihirbaziDurumu.ts`, testli). Dev (DEV ya da `?olcum=1`): `window.defterSihirbazHata = n` → n'inci öğede yazmadan önce yapay ağ hatası (−n: yazdıktan sonra, cevap kayıp), bir kez; `?olcum=1` kutusunda işlem özeti (islemId, n/N, vardı).

### İçindekiler düzenleme (6.K5a)
- Okuyucudaki İçindekiler panelinde "Düzenle" (sadece Drive kitaplığı, sadece surum 2 + kitap.json; surum 1 / kitap.json yok → gri + not; örnek kitaplıkta düğme yok). Yazma `?kurulum=1` ile (dar ve sahip modu aynı); kilit yoksa düğmeler gri + not, istek gitmez.
- İşlemler: + Ünite, + Konu (ünite altında), ad değiştir (✎ / çift dokunuş; kural `adTemizle`, `kitapListesi.ts`), ↑↓ (konu kendi ünitesinde, üniteler). Taşıma, silme, çöpe atma yok (K5b).
- Ad ve sıra SADECE kitap.json'da; Drive klasör adı ve yeri değişmez. Bellek hemen değişir (iyimser); ↑↓ 800 ms içinde tek yazma. Ekleme iyimser değil: klasör + kitap.json yazılınca görünür, o sırada "Ekleniyor…".
- Yeni ünite/konu = yeni klasör (kitapOlustur desenleri: generateIds, `defter=1` + `defterIslem`, islemId ile "var mı", 409 = var, Tekrar dene kaldığı yerden). Ünite → kitap klasörüne, konu → o kitabın ünite klasörüne; kitap klasörü kökün `kitaplar/`'ında olmalı (`ebeveynGecerliMi`, `ebeveyn.ts`).
- Numara: kitap.json'daki ve Drive'daki (yarım dahil) klasörlerin en büyüğü + 1; Konu-NN kitap boyunca; aynı ad → sonraki numara (`klasorNumarasi.ts`). Uebungen/Oedevler açılmaz.
- Klasörü bilinmeyen eski boş ünite: kitap klasöründe, `defter=1`, başka ünitenin kullanmadığı, adı tam `klasorAdi('unite', sıra, başlık)` olan TEK klasör kullanılır ve kitap.json'a `klasor` olarak yazılır; yoksa "+ Konu" gri + not (`uniteKlasoruBul`).
- kitap.json: önce okuma kaydı ve kapak kaydı bekleyenleri yazılır (`reading.flush`, `DriveSaver.bekleyenleriYaz`) → modifiedTime → son hal → değişiklik (`icindekilerUygula`; bilinmeyen alanlar, kurdeleler, kapak, durum korunur) → modifiedTime; değiştiyse bir kez baştan, sonra `IcindekilerCakisma`. Klasör önce, kitap.json en son. Ünite/konu anahtarla eşleşir (konu: `topicKey` = klasor; ünite: klasor ya da başlık).
- Hata: panelin üstünde durum satırı (Kaydediliyor…/Kaydedildi/hata + Tekrar dene / izinde Tekrar giriş yap / Vazgeç); kuyruk sırayla, hatada bekler. Başarıda arama ağacı geçersiz, masadaki sayfa yeniden çizilir.
- 6.K5a-2: Tekrar dene ilk denemeyle aynı yoldan geçer (`src/ui/icindekilerBaglami.ts`, testli): bellek → arama ağacı + masadaki sayfa → panel. Okuyucu kuyruğu her zaman dinler (düzenleme modu kapalıyken de). Yenileme hatası yazılmış işi "hata" yapmaz. Vazgeç (ad/sıra) → kitap.json son hali (`kitabiEsitle`: sadece ad ve sıra; bekleyen değişiklikler üstüne), okunamazsa işlem öncesi (`geri`). `?olcum=1` → `içindekiler:` satırı (son olaylar).
- Kod: `src/kitap/icindekiler.ts`, `klasorNumarasi.ts`, `src/drive/icindekilerYaz.ts` (kuyruk dahil), `src/ui/icindekilerBaglami.ts`, `src/ui/icindekilerDurumu.ts` (testli), `src/ui/icindekilerDuzenle.ts`. Ekran görüntüleri: `node scripts/icindekiler-kontrol.mjs` (Drive yok).

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
