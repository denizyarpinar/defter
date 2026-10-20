# Defter – Durum

**Son güncelleyen:** Codex, 20 Ekim 2026 · dal `faz-6` (HEAD `9991eb4`; 6.K6c değişiklikleri henüz commit edilmedi) · `main` b564351

Ayrıntılı tarihçe repo dışında (Cowork'ün devir notu); ortak ve güncel durum bu dosya.
Kurallar: `CLAUDE.md`. Codex için giriş: `AGENTS.md`.

## Amaç

Defter, Google Drive'daki notları (PDF, defter fotoğrafı, Claude çıktıları) 3D bir çalışma odasındaki kitaplıkta kitap olarak gösteren web uygulamasıdır (PWA). Dosyalar kullanıcının Drive'ında kalır; uygulama Vercel'de yayında. Önce kişisel kullanım, aynı zamanda GitHub portföy projesi. Ana cihaz iPad (Safari), ikinci cihaz Windows laptop.

## Çalıştırma

- `npm install`
- `npm run dev` → http://localhost:5173 (port 5173, `--strictPort`; eski vite süreçlerini önce kapat)
- `npm test` (vitest), `npm run typecheck` (`tsc --noEmit`), `npm run build`
- Görev bitmeden önce typecheck, test ve build hatasız geçmeli.
- `.env.local` (git'e girmez): `VITE_GOOGLE_CLIENT_ID`, `VITE_SAHIP_EPOSTA`. Değerler bu dosyaya yazılmaz.
- Örnek kitaplık (girişsiz): `http://localhost:5173/?demo`
- iPad'de yerel deneme: aynı Wi-Fi'da `npx vite --host` (Uni ağı engelleyebilir) ya da Vercel önizlemesi.
- Vercel:
  - Canlı (main): https://defter-jade.vercel.app
  - Dal önizlemesi: `https://defter-git-<dal>-deniz-b571.vercel.app` (ör. faz-6). Google Cloud → Authorized JavaScript origins'e eklenmiş olmalı. Vercel Authentication açık.

## Fazlar

| Faz | İçerik | Durum |
|---|---|---|
| 1 Temel | Proje, 3D oda, kitaplık, Google girişi, Drive'dan okuma, Vercel | Bitti |
| 2 Görsel kalite | Blender'da fırınlanmış ışık (gündüz/akşam lightmap) | Bitti |
| 3 Okuma | pdf.js, kitap/PDF modu, yakınlaştırma, kurdele, okuma durumu | Bitti |
| 4 Kalem | Çizimler PDF'e Ink annotation, Drive'a kayıt | Bitti (main) |
| 5 Defter ve ekleme | Defter fotoğrafı özete, Dosya ekle (PDF/görsel) | Bitti (main 9c7a897) |
| 6.1–6.3 | Word/PPT çeviri, Renk düzelt + koseB, arama | Bitti (main b564351) |
| 6.H | Kalem düzeltmeleri (çubuk, çizgi kalitesi) | Bitti (faz-6) |
| 6.K0–K6b | Çok kullanıcı + kurulum: izin modu, kök/kurulum, örnek kitap, sihirbaz, içindekiler, çöpe atma, boş konu | Bitti (faz-6, 1265 test) |
| **6.K6c** | Masadaki İçindekiler sayfalara bölünür | **Uygulandı; Deniz'in gerçek kitap/iPad denemesi bekleniyor** |
| 6.K7, 6.K8 | Yayına hazırlık, gerçek test, main | Sırada |
| 6.4 / 6.5 | OCR / iki dil (EN + TR) | Sonra |
| 7 | Quiz/özet (LLM API) | Sonra |

### Sıradaki 3 adım

**6.K6c – İçindekiler sayfalara bölünür**
- Uygulandı: fontlar yüklendikten sonra aynı genişlik/stillerle DOM ölçülür; başlık, düğmeler, satırlar, boşluklar, alt açıklama ve sayfa numarası için alan ayrılır. İlk İçindekiler sayfasında mevcut düğmeler; sonraki sayfalarda küçük "İçindekiler (devam)", bölünen ünitede "(devam)". Başlık ilk konusuyla birlikte taşınır; çok küçük alanda en az bir satır işlenir.
- Masadaki liste başlık sayfası + ölçülen İçindekiler sayfalarıdır. Dar ekranda birer, geniş ekranda ikişer sayfa çevrilir (‹ ›, klavye okları, kaydırma hareketi). Geniş ekranda tek yayılım varsa oklar görünmez; yerleri korunur, kitap boyutu değişmez. Son boş eş sayfa numarasızdır.
- Boyut/yön/font/içerik değişince yeniden ölçülür; görünen konu mümkün olduğunca korunur. Çevirme veya kapak açılışı sırasında yeniden ölçüm, eski animasyonları temizler. Konu ve durum düğmeleri mevcut işlevlerini kullanır. Ayrı PDF okuyucusunun sayfaları/numaraları/kurdeleleri değişmez.
- Kod: `src/ui/reader.ts`, `icindekilerSayfalama.ts` (saf, 12 test), `icindekilerOlcum.ts`, `src/styles.css`. Kaynak bağlantısı: `scripts/icindekiler-sayfa-kaynak.test.ts` (3 test). K5a/K5b paneli, K6a/K6b, kalem, okuyucuKaydirma.ts, Drive yazıcıları ve 3D oda değiştirilmedi. AGENTS.md'ye istenen "Yarım kalan iş" kuralı (8) eklendi.
- Kontroller: typecheck ve build geçti. Toplam **103 dosya / 1280 test geçti** (`npm test -- --testTimeout=20000 --maxWorkers=2`). İlk varsayılan koşuda mevcut filtre testi 5 sn sınırına, köşe ölçümü repo dışındaki tanı klasörünün yazma iznine takıldı; izinli ve 20 sn sınırıyla tam koşu geçti, bu testlerin kodu değiştirilmedi.
- Tarayıcı: `node scripts/icindekiler-sayfa-kontrol.mjs`; Drive'a bağlanmadan uzun/kısa/konusuz/örnek kitaplık, dört boyutta **16 senaryo** geçti. 30 konulu kontrol kitabı başlık sayfası dahil 390×844 ve 820×1180'de 7; 1180×820 ve 1920×632'de 6 sayfa. Konu sırası/kaybı/tekrarı, devam başlığı, taşma, numaralar, son boş sayfa, ileri/geri oklar, devam sayfasından konu açma, yeniden boyutlandırma ve çevirme sırasında yeniden boyutlandırma denendi. Kısa sayfanın öğe konumları ve boyutları HEAD sürümüyle karşılaştırıldı, aynı.
- Görüntüler + `olcum.json`: `%USERPROFILE%\iCloudDrive\uni_plan_claude_code\Claude outputs\kitap-6.K6c\`. Uzun/kısa kitaplar açıkça etiketli **kontrol verisidir**, gerçek `deneme-1` / `Mathe 1` değildir. Ölçüm kutusu yalnızca ekran görüntüsü çekilirken gizlenir.
- **Sıradaki:** Deniz, dar modda `http://localhost:5173/?kapsam=dar&sahip=0&kurulum=1&olcum=1` → `deneme-1`: 390, 820, 1180, 1920×632; gerçek iPad Safari dikey/yatay. Sahip modunda `http://localhost:5173/?kurulum=1&olcum=1` → `Mathe 1`: sadece kısa liste görünümüne bak. Bağlı tarayıcıda girişli Defter sekmesi yoktu; gerçek kitaplar ve fiziksel iPad bu oturumda denenmedi. Deniz denedikten ve onayladıktan sonra commit; ardından K7.

**6.K7 – Yayına hazırlık**
- Kabul: gizlilik sayfası İngilizce + Türkçe; README'de "Kullanmaya başla" bölümü; Google Cloud'da Branding sayfası tamam ve uygulama Production'da.
- Not: `*.vercel.app` alan adı doğrulaması belirsiz, K7'de bakılacak.

**6.K8 – Gerçek test ve main**
- Kabul: ikinci Google hesabıyla (Cowork geçici test kullanıcısı ekler) laptop + iPad'de kurulum ve kullanım çalışır; `?kurulum=1` kilidi kalkar; Drive'daki test kökü bütünüyle çöpe; faz-6 → main (sadece Deniz onayıyla).

Ardından: 6.4 OCR (önce keşif, kararlar Deniz'e örnekle) → 6.5 iki dil.

## Alınmış kararlar (özet; ayrıntı CLAUDE.md'de)

### Faz 4 – Kalem
- Çizimler PDF'in içine standart Ink annotation (/AP ile); sidecar dosya yok; sayfa içeriğine dokunulmaz.
- Sadece `/DefterId` işaretli notlar eklenir/değişir/silinir; başka notlar korunur; imzalı/şifreli PDF'e yazılmaz.
- Çizim katmanı SVG; kalem perfect-freehand + basınç, fosforlu sabit kalınlık ve opaklık < 1.
- Yedek: ilk yazmadan önce head sürüm keepForever=true.
- Kayıt: önce IndexedDB'de net fark, sonra Drive'a (kalem kapanınca, konu/materyal değişince, okuyucu kapanınca, 30 sn, Kaydet). Hiçbir hatada bekleyen kayıt silinmez.
- Silgi = çizgi silgisi.

### Faz 5 – Defter ve ekleme
- Defter fotoğrafı özet PDF'in sonuna eklenir; özet yoksa yeni `ozet.pdf`.
- Yeni dosya sadece `kitaplar/<kitap>/` altında ve sadece PDF; aynı ad = uyarı, üzerine yazma ve otomatik "(2)" yok.
- Fotoğraf: otomatik kırpma + perspektif (saf TS, OpenCV yok), elle köşe düzeltme; güven düşükse tüm fotoğraf.
- Fotoğraf önce cihaza, sonra Drive'a, başarıda silinir. Dosya ekle önce cihaza kaydetmez; hata → panel açık + Tekrar dene (aynı islemId).
- Dosya ekle hedefleri: Übungen, Ödevler, Çözüm, Orijinal ve Özet (sadece yoksa); çoklu görsel → tek PDF.

### Faz 6
- Word/PPT: Drive'da Google biçimine çevir → PDF export → geçici dosya çöpe (trashed=true). "Hiçbir dosya silinmez" kuralının istisnası, sadece uygulamanın kendi geçici dosyası. `files.delete` asla.
- Renk düzelt (filtre E): defter fotoğraflarında varsayılan açık, fotoğraf başına kapatılabilir.
- koseB: "bu kadar yeter"; yanlış kırpma yerine "Kırpılamadı" tercih edilir.
- Yükleme: daha az istek, arka planda yükleme, yüzde, kaldığı yerden devam.
- Arama: okuyucuda açık PDF (pdf.js) + kitaplıkta ad/konu/kitap (cihazda) ve metin (Drive fullText, sadece GET).
- Tek seferlik test temizliği yapıldı (18 Ekim).

### 6.K – Çok kullanıcı ve kurulum
- İzin (C): herkes `drive.file`; sahip hesabı tam `drive` (sahip modu, eski "Kitaplık" aynen çalışır).
- Dar izinde uygulama sadece kendi oluşturduğu/eklediği dosyaları görür; kullanıcı dosyaları uygulamadan ekler.
- Kurulum: Drive'da "Defter Library" kökü (appProperties `defterKok=1`) + `kitaplar/` + `kitaplik.json` (5 raf); "Örnek bir kitap da koy" varsayılan işaretli.
- Klasör ve yeni JSON sadece kendi kökünde ve sadece kullanıcı düğmeye basınca; her şeyde `defter=1` + `defterIslem`; önce "var mı", çift yok.
- Kitap sihirbazı: ad, raf, renk + satır satır liste ("# Ünite" + konular), canlı önizleme.
- İçindekiler: ad ve sıra sadece kitap.json'da; Drive klasör adı değişmez.
- Uebungen/Oedevler ilk dosyada açılır; Übungen/Ödevler adlı klasör varsa engel.
- Çöpe atma: konu, ünite, kitap ve açık dosya; sadece trashed=true, Geri al; kök, `kitaplar/`, `kitaplik.json` asla.
- Yazma kodu `?kurulum=1` kilidiyle gelir, K8'de kalkar.
- Genel kullanım için gizlilik sayfası (EN/TR) + Google Branding + Production (K7).

## Sonra bakılabilir (kısaltılmış; tam liste CLAUDE.md sonunda)

- **Büyük sorun:** ozet.pdf her fotoğraf eklemede ve kalem kaydında baştan yükleniyor (22 MB ≈ 26 sn). Aday çözümler Faz 5 kararını değiştirir, Deniz onayı gerekir.
- Oda: glb için toplam 15 sn; yavaş ağda eski odaya düşüyor.
- Masaüstü lightmap PNG'leri küçültülebilir; gifsicle npm audit uyarıları.
- İki sekme/iki cihaz: aynı dosyada bekleyen kayıtlar birbirini görmüyor; aynı anda eklemede çift dosya olabilir.
- Hiç açılmayan dosyaların bekleyen kalem kayıtları cihazda bekler.
- Sayfa yenilenince yarım yükleme baştan başlar; createPdf yüzde/devam yok.
- Testlerde ara sıra 1 hata (kaynağı bilinmiyor); `filtre.test.ts` bir testi ~8,6 sn.
- koseB: gölgede uyarlamalı eşik yok, spiral/karşı sayfa sorunları.
- Okuyucudaki × düğmeleri 36 px (iPad için 40–44 px önerilir); telefonda dosya seçici dar.
- Übungen/Ödevler (umlautlu) klasördeki dosyalar okuyucuda görünmüyor.
- `scripts/icindekiler-kontrol.mjs` K5b'den beri bozuk.
- "Kurulumu tamamla"da kitaplik.json varsa örnek kitap "Yeni gelenler"e düşüyor.
- İzin (kapsam) hatası ve `?kapsam=dar`'da token süresi dolması gerçek Drive'da denenmedi.

## Fikir listesi (özet)

| # | Fikir | Faz | Durum |
|---|---|---|---|
| 1 | İki dil (EN + TR), varsayılan İngilizce | 6.5 | planlandı |
| 2 | Giriş sonrası demo kitaplık görünmesi | 5.1 | yapıldı |
| 3 | Konu açma, dosya ekleme ve adlandırma uygulamadan | 6.K4–K6 | büyük ölçüde yapıldı |
| 4 | iPad'de bozuk kalem çizgisi | 6.H2b | yapıldı |
| 5 | "Kalemi kapat" sonrası sayfa kayması | 6.H1 | yapıldı |
| 6 | Pro: "sihirli düğme" (yapay zekâ açıklar/çevirir) | Faz 7+ | fikir |
| 7 | Okuyucuda araya boş defter sayfası | 6.K sonrası / 7 | fikir |
| 8 | Puan sistemi ve oda süsleme | Faz 7+ | fikir |

## Çalışma yöntemi

Roller:
- Cowork (Claude) planlar ve kontrol eder.
- Claude Code ya da Codex kodu yazar; ikisi aynı klasörde, `faz-6` dalında, **sırayla** çalışır (aynı anda değil).
- Deniz promptu yapıştırır, dener, onay verir. Deniz'den elle dosya işi istenmez.

Paslaşma döngüsü:
1. Cowork küçük bir adımın promptunu yazar ("Adım 6.x – …"): bağlam, kararlar, yapılacaklar, testler, **Dokunma:** listesi, "Sonunda göster: …". Her prompt "**Önce plan göster, commit atma**" der.
2. Deniz kodlayan araçta yeni oturum (Claude Code: `/clear` → plan mode) açar ve promptu yapıştırır.
3. Araç planı yazar; Deniz planı Cowork'e taşır; Cowork onaylar ya da kısa düzeltme verir.
4. Araç uygular; sonuç Cowork'e gider; Cowork kısa deneme adımları verir (laptop + iPad).
5. Deneme tamamsa commit (mesaj Türkçe: `Faz 6.x: …`). Push sadece gerektiğinde (önizleme); main'e sadece Deniz onayıyla.

İpuçları:
- Büyük işler küçük adımlara bölünür. Riskli yazma kodu önce bir güvenlik kilidiyle (`?…=1`) gelir; gerçek testten sonra kalkar.
- Kapsam dışı fark edilenler "Sonra bakılabilir" altına yazılır.
- iPad'de konsol yok: teşhis bilgisi ekranda + Kopyala düğmesiyle gösterilir (`?olcum=1`).
- Arayüz metinleri edilgen (birinci tekil şahıs yok).

Deneme adresleri (her zaman tam yaz):
- Dar mod (yeni kullanıcı gibi): `?kapsam=dar&sahip=0&kurulum=1&olcum=1`
- Sahip modu: `?kurulum=1&olcum=1`

Kontrol görüntüleri (ekran görüntüleri, karşılaştırmalar): `%USERPROFILE%\iCloudDrive\uni_plan_claude_code\Claude outputs\`

Drive'da deneme: dar modda "test kökü" (deneme kitapları bilerek duruyor, K8'de çöpe). Sahip hesabının gerçek "Kitaplık"ına sadece adımın izin verdiği kadar yazılır.

Görev sonunda bu dosya güncellenir: durum, sıradaki adım ve en üstteki "Son güncelleyen" satırı.
