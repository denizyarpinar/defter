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
- Uygulama Drive'daki dosyaları **kopyalamaz, taşımaz, silmez**. Faz 1'de sadece `kitaplik.json` ve `kitap.json` içindeki `kapak` alanı yazılabilir.
- Yazmadan önce dosyanın son halini oku (başka cihazda değişmiş olabilir).
- Erişim token'ını localStorage'a yazma; bellekte tut. `.env.local` git'e girmez.
- Hata mesajları Türkçe, kullanıcıya ne yapacağını söyler ("Drive'da Kitaplık klasörü bulunamadı. Klasörü ana dizine yükle ve yenile.").
- iPad performansı: pixel ratio en fazla 2, gölge haritası en fazla 2048, sahne değişmiyorsa render etme.
- Arayüz metinleri Türkçe; kod içindeki isimler İngilizce.

## Git
- Her görev bitip Deniz denedikten sonra commit at. Mesaj Türkçe ve açıklayıcı: `Faz 1.3: kitaplık rafları ve sürükle-bırak`.
- Commit atmadan önce `git status` ile neyin değiştiğini Deniz'e göster.

## Yol haritası (özet)
- Faz 1 Temel: proje, 3D oda, kitaplık, Google girişi, Drive'dan okuma, Vercel  ← ŞU AN
- Faz 2 Görsel kalite: hazır modeller + PBR dokular, Blender'da ışık pişirme
- Faz 3 Okuma: pdf.js, kitap/PDF modu, yakınlaştırma
- Faz 4 Kalem: çizimleri PDF'e kaydetme (MVP)
- Faz 5 Defter ve ekleme: fotoğraf notu, dönüştürme, özelleştirme
- Faz 6 Akıllı özellikler: OCR, arama, quiz/özet

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
- PDF Drive'dan files/{id}?alt=media ile indirilir (Authorization başlığıyla). PDF'ler Drive'da kopyalanmaz, taşınmaz, silinmez; değiştirilmesine sadece "Faz 4 — PDF'e çizim yazma (güvenlik)" kuralları çerçevesinde izin verilir.
- İndirilen PDF'ler IndexedDB'de önbelleğe alınır; anahtar = dosya id + modifiedTime. Drive'da dosya değişince yenisi indirilir. Önbellek toplamı 500 MB'ı geçerse en eski açılanlar silinir.
- Kaynak yolu (kaynak.dosya) kitabın klasörüne göre çözülür; alt klasörler (defter/...) desteklenir. Bulunamayan dosya kitabı bozmaz: o sayfa yerine "Dosya bulunamadı: <ad>" sayfası gösterilir.
- sayfalar alanı: "3", "3-7", "1-2,5,9-11"; yoksa tüm PDF.

### Sayfa ve bellek
- Her PDF sayfası kitabın bir sayfası. Sayfa oranı PDF'in kendi oranı (çoğu A4; yatay slaytlar yatay kalır, kitap modunda sayfaya sığdırılır).
- Aynı anda sadece görünen sayfalar + 2 önceki + 2 sonraki çizilir; uzaklaşan canvas'lar serbest bırakılır (width = height = 0).
- Canvas boyutu: devicePixelRatio en fazla 2; tek canvas en fazla 16 milyon piksel (iPad Safari sınırı). Yakınlaştırmada görüntü önce CSS ile büyür, parmak kalkınca keskin olarak yeniden çizilir.

### Yazılan alanlar (Faz 3)
- kitaplik.json: raflar ve oda (Faz 1'deki gibi).
- kitap.json: kapak, sonAcilis, kurdele, uniteler[].konular[].durum ve .kurdeleler (surum 1: kurdele ({ bolum, sayfa }), bolumler[].durum). Başka alana dokunma; bilinmeyen alanları koru. Yazmadan önce dosyanın son halini oku, sadece bu alanları güncelle.

### Okuma durumu ve kurdele (Görev 3.5)
- Durum değerleri: `okunmadi` (Okunmadı), `okunuyor` (Okunuyor), `okundu` (Okundu), `calisildi` (Çalışıldı), `tekrar` (Tekrar). Duruma dokununca bu sırayla döner.
- Otomatik sadece ileri: konuya girince okunmadi → okunuyor; özetin (yoksa orijinalin) son sayfası ekrana gelince okunmadi/okunuyor → okundu. okundu, calisildi, tekrar otomatik değişmez.
- surum 2: `konular[].kurdeleler.<materyal> = { dosya, sayfa }` (materyal: orijinal|ozet|uebungen|oedevler; dosya = Drive'daki dosya adı; sayfa = o PDF'teki sayfa, 1'den). Kitap düzeyinde `kurdele = { konu, materyal, dosya, sayfa }`; konu = konunun `klasor` yolu.
- surum 1: `kurdele = { bolum, sayfa }` (bolum 0'dan, sayfa bölüm içinde 1'den). Eski tip kurdele (sadece sayı) okunur, ilk yazmada yeni biçime geçer.

### Yazma güvenliği (okuma durumu)
- Değişiklikler bir yama olarak birikir; sadece bu oturumda değişen alanlar yazılır. Başka cihazın değiştirdiği konulara dokunulmaz. Konular `klasor`'a göre eşleşir (surum 1: sıra + başlık).
- Her yazmadan önce: modifiedTime oku → kitap.json'un son halini oku → yamayı uygula → değişen yoksa yazma → modifiedTime'ı tekrar oku; değiştiyse (başka cihaz yazmış) baştan bir kez daha dene.
- Sadece şu alanlar değişir: sonAcilis, kurdele, uniteler[].konular[].durum ve .kurdeleler (surum 1: bolumler[].durum ve kurdele). Bilinmeyen alanlar korunur; baslik, kapak, klasor vb. alanlara dokunulmaz.
- Aynı dosyanın üstüne yaz: PATCH upload ile mevcut dosya id'si. Asla yeni dosya oluşturma ("kitap (1).json" oluşmamalı). kitap.json'u olmayan kitapta okuma durumu yazılmaz. İçi bozuk (JSON olmayan) dosyanın üstüne yazılmaz.
- Demo/örnek kitaplıkta (Drive yok) hiç yazılmaz.
- Ne zaman: son değişiklikten 5 sn sonra; okuyucu ya da masadaki kitap kapanınca; sekme gizlenince/sayfa kapanınca (visibilitychange/pagehide, keepalive).
- Hata/çevrimdışı: yama bellekte kalır, bağlantı gelince ve 30 sn'de bir tekrar denenir; küçük uyarı gösterilir. Yeni Google izni istenmez; kapsam yetmezse dur ve Deniz'e söyle.
- Kod: `src/model/okumaYamasi.ts` (saf birleştirme, testli), `src/drive/okumaKaydi.ts` (yazıcı, testli), `src/okuma/okumaDurumu.ts` (bellekteki kitap + yazıcıya iletme).

### Güvenlik
- Ders PDF'leri telifli: public/ veya git'e asla girmez. Demo için kendi ürettiğin örnek PDF'leri kullan.
- Kalem düğmesi Faz 4'te çizim kodu gelene kadar gizli kalır. Çizim kodu Faz 4 kurallarına uyar (aşağıda).

### Veri modeli (kitap.json surum 2)
- `kitap.json`: `{ surum: 2, baslik, sirt, kod, ders, kapak, sonAcilis, kurdele, uniteler: [ { baslik, konular: [ { baslik, klasor, durum, kurdeleler? } ] } ] }`.
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
- Çizimler PDF'e standart Ink annotation (not) olarak yazılır; görünüm akışı (/AP) eklenir, böylece Drive önizlemesi, iPad ve Windows'ta görünür. Sayfa içeriğine (content stream) asla dokunulmaz.
- Uygulamanın notları özel `/DefterId` anahtarıyla işaretlenir. Sadece /DefterId işaretli Ink annotation'lar eklenir/değişir/silinir. Sayfa içeriği, başka notlar, form alanları, metadata ve sayfa sırası korunur.
- Aynı dosya id'sine PATCH (uploadType=media veya resumable). Asla yeni dosya veya kopya oluşturulmaz.
- Yazmadan önce: capabilities.canEdit kontrolü; modifiedTime oku. Değişmişse son hali indir, bekleyen çizgileri onun üstüne yeniden uygula, tekrar dene. Kör üstüne yazma yok.
  Ayrıca headRevisionId yedekten (ensureOriginalKept) önce ve sonra okunur; farklıysa içerik bu arada değişmiştir, yazılmaz (PdfConflict). keepForever modifiedTime'ı değiştirebileceği için yedekten sonra modifiedTime değil headRevisionId karşılaştırılır.
- Çizgiler önce cihazda (IndexedDB) saklanır, Drive'a sonra yazılır. Sayfa kapanırken PDF yüklenmez (keepalive sınırı); bekleyen çizgiler bir sonraki açılışta yazılır.
- Kayıttan sonra yeni modifiedTime ile PDF önbelleği ve bellekteki kopyalar güncellenir.
- Demo/örnek kitaplıkta Drive'a yazma yok. Telifli ders PDF'leri asla public/ veya git'e girmez; testler demo PDF'lerle yapılır.
- Mevcut `drive` kapsamı yeterli; yeni Google izni istenmez.
- pdf-lib (tam sürüm 1.17.1) sadece kalem modu açılınca dinamik import (`await import('pdf-lib')`) ile yüklenir; ilk açılış paketine girmez.
- Yedek: ilk yazmadan önce head sürüm keepForever=true yapılır (ensureOriginalKept). Gerçek Drive PDF'ine ilk deneme Deniz'in onayıyla, test kitabında yapılır.
