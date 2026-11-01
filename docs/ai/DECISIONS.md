# DECISIONS

Sadece mimari kararlar. Her karar Deniz onaylıdır; değiştirmek için Deniz'in açık onayı gerekir.
Yeni karar: en alta `Dxx – başlık (tarih)` + kural + tek cümle neden. Ayrıntı: `docs/ai/arsiv/CLAUDE_eski.md` (ilgili bölümü oku, tamamını yükleme).
Bu dosya AGENTS.md "Değişmez kurallar" ile çelişirse mimari konuda bu dosya geçerlidir.

## Temel
- D01 – Yapı: Vite + TypeScript, düz DOM, UI framework yok; 3D three.js. Neden: küçük paket, iPad'de hız, öğrenmesi kolay.
- D02 – Sunucu yok; tek istisna Vercel fonksiyonu `api/oku.ts` (OCR). Google girişi GIS token client, client secret yok; token bellekte + yalnız bu sekmenin sessionStorage'ında, süresine kadar (6.6-5b); localStorage'a asla yazılmaz. Neden: kullanıcı verisi sunucuya uğramasın; dil yenilemesinde oturum korunsun.
- D03 – Veri kullanıcının Drive'ında; uygulama katalog + okuyucu. Kendi veritabanı yok. Neden: dosyalar kullanıcının kalır, uygulama laptopa bağımlı olmaz.
- D04 – Görünüm kaynağı `referans/prototip.html`; değiştirilmez, davranış oradan alınır.

## Drive veri modeli
- D05 – `kitaplik.json` (raflar, oda, isteğe bağlı `ayarlar.dil`) + kitap başına `kitap.json`. surum 2: üniteler > konular > klasör; materyaller konu klasöründen keşfedilir (`src/okuma/konuKesfi.ts`). surum 1 (bolumler) okunmaya devam eder.
- D06 – Bilinmeyen JSON alanları korunur (okurken saklanır, yazarken geri yazılır).
- D07 – Drive klasör adı değişmez; kitap/konu adı ve sıra sadece `kitap.json`'da. `_` ile başlayan klasör kitap değildir (`src/model/gizliKlasor.ts`).
- D08 – Yazmadan önce son hal okunur (modifiedTime / headRevisionId), çakışmada en çok 3 deneme. Her işlem sabit `islemId` taşır; aynı islemId ikinci kez yazılmaz (zatenVar).

## Drive izinleri ve sınırlar
- D09 – İzin modu C: herkes `drive.file`; sahip hesabı tam `drive` (eski "Kitaplık" aynen çalışır). Neden: Google doğrulaması kolay, yabancı kullanıcı için güvenli.
- D10 – Kurulum: "Defter Library" kökü (appProperties `defterKok=1`) + `kitaplar/` + `kitaplik.json` (5 raf). Klasör/JSON yalnız kendi kökünde ve yalnız kullanıcı düğmeye basınca; hepsinde `defter=1` + `defterIslem`; önce "var mı", çift yok. İlk girişte otomatik kurulum ürün hedefidir, onaylı karar değildir.
- D11 – Oluşturulabilenler (başka dosya yok): yeni PDF yalnız `kitaplar/<kitap>/` altında; `kitaplik.json` yoksa bir kez; kurulum ve sihirbaz öğeleri (D10); `<pdf adı>.ocr.json`; `_sistem/el-yazisi/` içinde yalnız atlas png + json (yalnız `atlas-yukle.html` düğmesiyle).
- D12 – Silme: `files.delete` asla; kopyalama/taşıma yok. Yalnız `trashed=true` + Geri al: konu, ünite, kitap, açık dosya (6.K5b/6.K6b) ve Word/PPT çevirisinin geçici Google dosyası (6.1b). Kök, `kitaplar/`, `kitaplik.json` asla çöpe gitmez.
- D13 – Riskli yeni yazma kodu önce adres kilidiyle (`?…=1`) gelir, gerçek testten sonra kilit kalkar.

## PDF'e yazma
- D14 – Kalem: standart Ink annotation (/AP ile) PDF'in içinde; yan dosya yok, sayfa içeriğine dokunulmaz. Sadece `/DefterId` işaretli notlar değişir; imzalı/şifreli PDF'e yazılmaz.
- D15 – Kayıt sırası: önce IndexedDB'de net fark, sonra Drive. Hiçbir hatada bekleyen kayıt silinmez. İlk yazmadan önce head sürüm `keepForever`.
- D16 – Tek PDF yazma yolu: kalem kuyruğu → `ekleVeYukle` (3 deneme, çakışma, yedek, yüzde). Bekleyen kalem kaydı varken sayfa işi başlamaz.
- D17 – Sayfa işleri (6.S): fotoğraf özetin sonuna (özet yoksa yeni `ozet.pdf`); boş sayfa araya (`/DefterBosSayfa`); "Deftere yapıştır" sadece kutuyu büyütür; her sayfa silinebilir ama yedek önce cihaza yazılır + Geri al. Sayfa sayısı değişince kurdeleler ve `.ocr.json` aynı kuralla kayar (`src/kitap/sayfaKaydir.ts`).
- D18 – Özet ekleri `ozet-ek*.pdf` (6.EK): Defter eke yazmaz, ek salt okunur; "Ekle" eki özetin sonuna kopyalar (`/DefterEkId`).
- D19 – Word/PPT: Drive'da Google biçimine çevir → PDF export → geçici dosya çöpe (D12).

## Cihazda saklama
- D20 – IndexedDB: PDF önbelleği (id + modifiedTime, 500 MB), bekleyen kalem kayıtları, fotoğraflar, temiz yazı depoları, sayfa işi, silinen sayfa yedeği (7 gün / 5). localStorage yalnız tercihler (token asla). Token bellekte + yalnız bu sekmenin sessionStorage'ında, süresine kadar (6.6-5b); çıkış, token reddi ve geçerlilik kontrolünde süresi dolmuş kayıt silinir. Çıkışta hesap verileri silinir.

## El yazısı (OCR) ve Temiz yazı
- D21 – Okuma motoru Claude API, yalnız `api/oku` üzerinden; varsayılan Haiku 5.5. Sadece sahip hesabı, sadece kullanıcı isteyince (otomatik okuma yok), istek/boyut sınırlı. Anahtar yalnız Vercel env. Neden: maliyet ve gizlilik.
- D22 – Sonuç aynı klasörde `<pdf adı>.ocr.json`; PDF'e yazılmaz. Sayfa eşleşmesi parmak iziyle, sayfa numarasıyla değil.
- D23 – Temiz yazı okuyucuda bir görünümdür (gerçek harf görüntüsü atlası, kareli kâğıt); Drive'a yazmaz. Her görünümün kendi kalem notları (`/DefterGorunum /Temiz`; anahtarsız = orijinal).

## Dil
- D24 – Kütüphanesiz `src/dil/`: `tr.ts` kaynak, `en.ts` tipi ondan türer. İlk açılış İngilizce; seçim localStorage `defter-dil` + `?lang` + Drive `kitaplik.json` `ayarlar.dil`. Dil değişince sayfa yenilenir, yer korunur.
- D25 – Drive adları, JSON anahtarları, `/Defter…` işaretleri ve yapay zekâ istemi çevrilmez; raf adları kullanıcı verisidir. `npm run dil` 0 olmalı; modül yüklenirken `t()` çağrılmaz.

## Arama
- D26 – Kitaplıkta: ad/konu cihazda + Drive fullText (yalnız GET) + `.ocr.json`. Okuyucuda: açık PDF (pdf.js). Normalleştirme: ı→i katlama, ä↔ae gibi iki yazım.

## 3D ve performans
- D27 – Blender'da pişmiş ışık, gündüz/akşam haritaları; akşam 18:00–06:00 cihaz saati. Yükleme 15 sn'yi aşarsa prosedürel oda.
- D28 – iPad bütçesi: pixel ratio ≤ 2, gölge haritası ≤ 2048, sahne değişmiyorsa render yok.

## Dallar ve yayın
- D29 – main = canlı (defter-jade.vercel.app); faz-6 = önizleme. main'e push yalnız Deniz'in açık onayıyla; force push yok.
