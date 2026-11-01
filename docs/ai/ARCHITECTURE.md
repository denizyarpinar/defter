# Defter — Architecture

Kaynak kod incelemesi: 1 Kasım 2026. Aşağıdaki yollar repo köküne göredir; Drive dosya adları ayrıca belirtilmiştir.

## 1. Kullanılan teknoloji
- TypeScript + Vite; HTML ve doğrudan DOM, UI framework bağımlılığı yok. ES2022, strict, bundler çözümlemesi; `src` ve `api` derleme kontrolünde (`package.json`, `tsconfig.json`, `index.html`, `src/main.ts`).
- Three.js WebGLRenderer, sRGB, ACES, PCF gölgeler, pixel ratio en fazla 2 (`package.json`, `src/scene/renderer.ts`).
- PDF.js dinamik yüklenir, worker ayrı Vite varlığıdır; pdf-lib PDF notlarını düzenler, perfect-freehand kalem dış hattını üretir (`package.json`, `src/okuma/pdf.ts`, `src/kalem/pdfNotlari.ts`, `src/kalem/cizgiSekli.ts`).
- Google Identity Services OAuth token client; Drive REST v3, fetch ve yükleme ilerlemesi için XMLHttpRequest (`src/drive/auth.ts`, `src/drive/drive.ts`).
- EN/TR sözlükleri ve özel dil yöneticisi; kaynak anahtarlar Türkçe sözlükten türetilir (`src/dil/index.ts`, `src/dil/sozluk.ts`, `src/dil/tr.ts`, `src/dil/en.ts`).
- Vercel: Vite çıktısı ve OCR API fonksiyonu; PWA manifesti standalone görünüm tanımlar (`vercel.json`, `api/oku.ts`, `public/manifest.webmanifest`).

## 2. Klasör ve dosya haritası
- `index.html`: sayfa DOM'u ve `src/main.ts` modül girişi.
- `src/main.ts`: oturum, kitaplık durumu, sahne, okuyucu ve dil akışlarını bağlar.
- `src/model/`: veri tipleri, JSON ayrıştırma ve kitaplık işlemleri (`src/model/types.ts`, `src/model/parse.ts`, `src/model/library.ts`).
- `src/drive/`: oturumlu Drive erişimi, kitaplık okuma ve yazıcılar (`src/drive/auth.ts`, `src/drive/drive.ts`, `src/drive/driveLibrary.ts`, `src/drive/save.ts`).
- `src/scene/`: oda seçimi, kamera, kitaplık ve kitap animasyonları (`src/scene/index.ts`, `src/scene/camera.ts`, `src/scene/library3d.ts`).
- `src/ui/`: DOM panelleri ve masadaki kitabın içindekiler görünümü (`src/ui/panel.ts`, `src/ui/reader.ts`, `src/ui/kitapSihirbazi.ts`).
- `src/okuma/`: tam ekran okuyucu, materyal keşfi, PDF açma/çizme ve önbellek (`src/okuma/Okuyucu.ts`, `src/okuma/konuKesfi.ts`, `src/okuma/pdf.ts`, `src/okuma/sayfaIcerik.ts`, `src/okuma/pdfOnbellek.ts`).
- `src/kalem/`: çizgi şekli ve PDF notları (`src/kalem/cizgiSekli.ts`, `src/kalem/pdfNotlari.ts`).
- `src/defter/`: fotoğraf/dosya ekleme, PDF'e sayfa ekleme/silme/yapıştırma (`src/defter/konuyaDosyaEkle.ts`, `src/defter/ozeteEkle.ts`, `src/defter/sayfaSil.ts`, `src/defter/yapistir.ts`).
- `src/kitap/`: kitap oluşturma planı ve klasör adları (`src/kitap/kitapPlani.ts`, `src/kitap/klasorAdi.ts`).
- `src/dil/`: sözlük, HTML çevirisi ve Drive dil tercihi kararı (`src/dil/index.ts`, `src/dil/html.ts`, `src/dil/driveTercih.ts`).
- `src/arama/`: kitaplıkta arama ve ağaç önbelleği (`src/arama/kitaplikAra.ts`, `src/arama/kitaplikAgaci.ts`).
- `src/ocr/`: OCR istemcisi ve okunmuş el yazısı kayıtları (`src/ocr/claudeMotor.ts`, `src/ocr/kayit/kayitDrive.ts`).
- `src/elYazisi/`: harf atlası ve temiz yazı görünümü (`src/elYazisi/atlasDrive.ts`, `src/elYazisi/temizGorunum.ts`).
- `api/oku.ts`: GET erişim sorgusu, POST OCR; sahip doğrulaması ve Anthropic çağrısı.
- `public/ornek/`: örnek kitaplık; okuyucu/kurulum kaynak listesi (`public/ornek/index.json`, `public/ornek/kitaplik.json`, `src/model/localSource.ts`, `src/drive/kurulum.ts`).
- `public/models/`: oda GLB'leri ve ışık haritaları; seçim/yükleme (`public/models/lightmap.json`, `src/scene/bakedRoom.ts`).
- `blender/`: oda üretme, ışık pişirme ve mobil varlık betikleri (`blender/build_room.py`, `blender/bake.py`, `blender/mobil.py`).
- `scripts/`: dil denetimi ve tarayıcı kontrol betikleri (`scripts/dil-kontrol.mjs`, `scripts/kurulum-parametresiz-kontrol.mjs`; komutlar: `package.json`).
- `src/styles.css`: ortak görünüm; giriş noktası içe aktarır (`src/main.ts`).

## 3. Ana akışlar
### Giriş ve Drive erişimi
- `index.html` → `src/main.ts`: `boot` sahneyi kurar; `googleSignIn` kullanıcı eyleminden `signIn` çağırır (`src/drive/auth.ts`).
- `prepareAuth` GIS betiğini yükler ve token client oluşturur. Token yalnız bellektedir; hatırlanan ad/e-posta ayrı yerel kayıttadır (`src/drive/auth.ts`).
- `girisKapsami` normal kullanıcıya drive.file, hatırlanan sahip hesabına full drive seçer; aktif kapsam token yanıtından belirlenir. Sahibe ayrıca tam erişim düğmesi sunulur (`src/drive/kapsam.ts`, `src/drive/auth.ts`, `src/main.ts`).
- `driveFetch` Authorization ekler; 401'de token yenileyip bir kez tekrar dener. Kullanıcı bilgisi Drive about üzerinden okunur (`src/drive/drive.ts`).
- `loadDriveLibrary` → `kokBul`: dar kapsamda defterKok işaretli kök; tam kapsamda önce eski Kitaplık klasörü (`src/drive/driveLibrary.ts`, `src/drive/kok.ts`).
- Kök eksikse giriş yalnız kurulum kartını gösterir. Kullanıcı düğmesine basınca `kitaplikKur`, uygulama kökü + kitaplar klasörü + beş raflı kitaplık JSON'u oluşturur; örnek kitap seçeneği vardır (`src/main.ts`, `src/drive/kurulum.ts`).

### Veri ve kitap yükleme
- Drive'daki kitaplık JSON'u raf sırası/oda ayarlarını, her kitap klasöründeki kitap JSON'u kitap bilgisini taşır; `loadDriveLibrary` dosyaları okur ve `parseLibrary` / `parseBook` uygular (`src/drive/driveLibrary.ts`, `src/model/parse.ts`, `src/model/types.ts`).
- Model v2: uniteler → konular → klasor; materyal dosyaları konu klasöründe keşfedilir. V1 bolumler/kaynaklar desteği de sürer (`src/model/types.ts`, `src/model/units.ts`, `src/okuma/Okuyucu.ts`).
- Bilinmeyen JSON alanları extra içinde korunur; raf/oda/kapak değişikliklerini DriveSaver son dosya üzerinde birleştirir (`src/model/parse.ts`, `src/model/serialize.ts`, `src/drive/save.ts`).
- Demo kitaplık ayrı yerel kaynak akışıdır; Drive yazıcısı yalnız gerçek Drive kitaplığı görünürken kullanılabilir (`src/model/localSource.ts`, `src/main.ts`, `src/ui/kitaplikDurumu.ts`).

### Kitap ve PDF açma
- Sahne kitabı masaya uçurur; `onBookOnDesk` masadaki içindekileri açar, `konuAc` tam ekran okuyucuya geçer (`src/scene/index.ts`, `src/scene/library3d.ts`, `src/main.ts`, `src/ui/reader.ts`, `src/okuma/Okuyucu.ts`).
- `discoverTopic`: orijinal.pdf, ozet.pdf (yoksa brifing.pdf + sorular.pdf), Uebungen ve Oedevler PDF'leri; aynı adlı _cozum.pdf çözümleriyle eşleşir. Sekme önceliği özet → orijinal → ilk bulunan (`src/okuma/konuKesfi.ts`).
- `getPdf` Drive alt=media ile indirir; IndexedDB anahtarı id + modifiedTime. 500 MB üstünde en eski açılan kayıtlar elenir, tek açılan dosya korunur (`src/okuma/pdfOnbellek.ts`).
- `openPdf` PDF.js worker'ını kullanır; PageContent sayfayı canvas'a çizer. Okuyucu görünür sayfaları sanal liste ve yakınlaştırma ile yönetir (`src/okuma/pdf.ts`, `src/okuma/sayfaIcerik.ts`, `src/okuma/Okuyucu.ts`, `src/okuma/sanalListe.ts`).

### 3D oda
- `createRoomScene` render aşamasını, ışıkları ve canlı kitaplığı kurar. GLB/ışık haritaları yüklenemezse veya 15 sn aşılırsa prosedürel odaya döner (`src/scene/index.ts`, `src/scene/renderer.ts`, `src/scene/bakedRoom.ts`, `src/scene/room.ts`).
- Dokunmatik cihazda mobil varlıklar seçilir; Blender ışığı gündüz/akşam haritaları arasında karışır. Kitaplığın dış ölçüsü beş raflı kalır (`src/scene/bakedRoom.ts`, `public/models/lightmap.json`, `src/scene/bookcase.ts`).
- Otomatik akşam cihaz saatinde 18:00–06:00'dır; durum 20 sn arayla kontrol edilir. Render döngüsü değişiklik/animasyon yokken çizimi atlar (`src/main.ts`, `src/scene/renderer.ts`, `src/scene/frame.ts`).

### Dil değiştirme
- İlk dil: geçerli URL lang → localStorage → İngilizce. Düğme sayfa yenilemesiyle dil değiştirir; HTML data-t alanları sözlükten doldurulur (`src/dil/index.ts`, `src/dil/html.ts`, `src/ui/dilDugmesi.ts`).
- Değişimden önce kayıtlar beklenir; kitap/konu/sayfa dönüş bilgisi tutulur. Uygun Drive kitaplığında ayarlar.dil yazılır; URL lang açıkken Drive tercihi uygulanmaz/yazılmaz (`src/main.ts`, `src/dil/donus.ts`, `src/dil/driveTercih.ts`, `src/drive/dilTercihi.ts`).

### OCR API
- İstemci JPEG ve model seçimini POST /api/oku ile yollar. GET yalnız erişim durumudur; sunucu Google token'ını ve sahip hesabını doğrular, POST Anthropic Messages çağırır (`src/ocr/claudeMotor.ts`, `api/oku.ts`).
- Sunucu ayarları ortamdan okunur; örnek başına istek sınırı vardır. Gizli değerler bu belgeye alınmaz (`api/oku.ts`).

## 4. Nerede değiştirilir?
- Raf ekleme davranışı: panel düğmesi → addShelf; sınırlar modelde, görsel yerleşim kitaplıkta, kayıt DriveSaver'da (`src/ui/panel.ts`, `src/model/library.ts`, `src/model/types.ts`, `src/scene/bookcase.ts`, `src/drive/save.ts`, `src/main.ts`).
- Kitap ekleme: sihirbaz → kitap planı → Drive oluşturucu → yeniden yükleme; örnek içerik ayrı listeden gelir (`src/ui/kitapSihirbazi.ts`, `src/kitap/kitapPlani.ts`, `src/drive/kitapOlustur.ts`, `src/main.ts`, `public/ornek/index.json`).
- Okuyucu: masadaki içerik için `src/ui/reader.ts`; tam ekran için `src/okuma/Okuyucu.ts`; materyal/PDF için `src/okuma/konuKesfi.ts`, `src/okuma/sayfaIcerik.ts`; görünüm `src/styles.css`.
- Çeviri: önce `src/dil/tr.ts`, ardından `src/dil/en.ts`; anahtar tipi `src/dil/sozluk.ts`, denetim `scripts/dil-kontrol.mjs` (`package.json`: npm run dil).

## 5. Build ve yayın
- npm run dev: Vite; npm run typecheck: tsc --noEmit; npm run build: Vite build; npm run preview: Vite preview; npm test: Vitest (`package.json`).
- Vite Three.js'i core/WebGL/addons gruplarına ayırır; Vercel npm run build çalıştırır ve dist çıktısını sunar (`vite.config.ts`, `vercel.json`).
- API GET/POST işleyicileri ayrı sunucu girişleridir; düz Vite geliştirme sunucusunda OCR'nin çalıştığı varsayılmaz (`api/oku.ts`, `package.json`, `vite.config.ts`).
- Google client kimliği tarayıcı ortamından, OCR sunucu ayarları sunucu ortamından okunur; değerler kaydedilmez (`src/drive/auth.ts`, `api/oku.ts`).

## 6. Unverified / unclear
- [doğrulanmadı] Vercel'de bağlı dal, etkin dağıtım, canlı ortam ayarları ve Google Console durumu bu kaynak incelemesinde sorgulanmadı; repo yalnız build yapılandırmasını ve kullanılan ayarları gösterir (`vercel.json`, `src/drive/auth.ts`, `api/oku.ts`).
- [doğrulanmadı] Tam çevrimdışı kullanım ve gerçek iPad/telefon davranışı bu belge göreviyle yeniden denenmedi; manifest ve PDF önbelleği tek başına bunları kanıtlamaz (`public/manifest.webmanifest`, `src/okuma/pdfOnbellek.ts`).
- Hedef–uygulama farkı: ilk girişte kendiliğinden kurulum ürün hedefidir; mevcut akış kullanıcı düğmesini bekler. Bu belge görevi davranış değişikliği onayı değildir (`docs/ai/PROJECT.md`, `src/main.ts`, `src/drive/kurulum.ts`).
