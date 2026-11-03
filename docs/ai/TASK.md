# TASK – Panel 2: Kendi kullanım panelimiz (kimliksiz günlük sayılar)

Karar (Deniz 3 Kasım 2026, kart: "Kimliksiz sayılar"). Başlangıç: main = faz-6 = 65c766f (Vercel Web Analytics canlı, D32).
Bu adım yeni API + depolama içerir → **iki aşama**: önce Aşama 0 raporu, Claude onayından sonra Aşama 1.

## Goal
Sahip (Deniz) uygulamada `?panel=1` ile kendi panelini açsın: son 30 günün günlük sayıları (tablo + basit çubuk). Kimin olduğu yok: yalnız "olay türü × gün" toplamları.

## Kararlar (Claude)
- K1 Depolama: Upstash Redis (Vercel Marketplace, ücretsiz katman). Paket YOK; REST API'si `fetch` ile (`KV_REST_API_URL`, `KV_REST_API_TOKEN` env). Neden: sıfır bağımlılık, Vercel tek tıkla env'i ekler.
- K2 Veri modeli: anahtar `sayac:YYYY-MM-DD` (UTC), Redis hash, alan = olay türü, `HINCRBY` ile +1; `EXPIRE` 400 gün. Başka hiçbir şey yazılmaz (IP, user-agent, kimlik, e-posta, dosya adı YOK).
- K3 Olay türleri (sabit beyaz liste, başka değer 400):
  - `cihaz` – uygulama açıldı; cihaz başına günde 1 kez (localStorage `defter-sayac-gun` = bugünün tarihi). ≈ günlük aktif cihaz.
  - `demo` – örnek kitaplık açıldı (giriş yok), cihaz başına günde 1.
  - `giris` – yeni başarılı Google girişi (oturum geri yüklemesi/sessiz yenileme SAYILMAZ).
  - `kitaplik` – yeni kitaplık oluşturuldu (ilk kurulum).
  - `kitap` – kitaplığa yeni kitap/belge eklendi.
  - `ozet` – yeni özet kaydedildi.
  - `foto` – defter fotoğrafı yüklendi.
  (Aşama 0'da yer bulunamayan tür çıkarılır, eklenmez.)
- K4 `POST /api/olay` gövde `{ "tur": "<tür>" }`: kimlik doğrulama yok (sayılar kimliksiz). Koruma: beyaz liste, gövde ≤ 200 bayt, `Origin` = `https://mydefter.app` değilse 204 ve yazma yok, bellek içi IP başına 60 sn'de 30 istek (IP yalnız bellekte, yazılmaz/loglanmaz). Env yoksa 204 (sessiz). Hata asla istemciye yansımaz.
- K5 `GET /api/panel?gun=30`: yalnız sahip. `api/oku.ts` içindeki `sahipDogrula` (+ `epostaNormal`, `hata`, `json`) davranış değişmeden `api/_sahip.ts`'ye taşınır (alt çizgi → Vercel route sayılmaz); oku.ts oradan import eder. Cevap: `{ gunler: [{ tarih, sayilar: { cihaz: n, ... } }] }`, en fazla 90 gün.
- K6 İstemci `src/sayac.ts`: `olay(tur)` → `navigator.sendBeacon('/api/olay', Blob(JSON, application/json))`, yoksa `fetch(..., { keepalive: true })`; try/catch yutar, await yok. Yalnız `import.meta.env.PROD && location.hostname === 'mydefter.app'`. Bayrak `SAYAC_ACIK = true`; `?sayac=0` kapatır. `?analiz=0` da kapatır (tek "beni sayma" anahtarı).
- K7 Panel arayüzü: `?panel=1` ve sahip girişi varken mevcut kaplama/panel desenleriyle bir pencere; sütunlar: Tarih + 7 tür; üstte "Son 7 gün / 30 gün" toplam kutuları; basit CSS çubukları (kütüphane YOK). Sahip değilse ya da giriş yoksa hiçbir şey göstermez. Metinler EN/TR dil sistemiyle.
- K8 Gizlilik (EN+TR, privacy.html):
  - Bölüm 3, Vercel'in altına: "Anonymous usage counter: the app sends the type of a few actions (app opened, sample library opened, sign-in, library created, book added, summary saved, photo uploaded). Only daily totals per action type are stored, in a Redis database (Upstash) hosted for Defter, for up to 400 days. No account details, identifiers, IP addresses, Google user data or document information are stored." / TR karşılığı.
  - "Defter has no developer-operated backend or document database." → "Defter has no document database; its only developer-operated storage is the anonymous daily counter described below." (TR karşılığı.)
  - Tarih aynı gün kalır (3 Kasım 2026).
- K9 DECISIONS D33, CURRENT_STATE bir satır.

## Aşama 0 (önce bu, kod yazma)
Kısa rapor ver:
1. K3'teki her tür için tetikleneceği dosya:satır ve fonksiyon (özellikle `giris`: yeni giriş ile oturum geri yükleme/sessiz yenilemeyi ayıran yer).
2. `?panel=1` için uygun mevcut kaplama/panel deseni ve sahip bilgisinin istemcide nereden okunduğu.
3. `sahipDogrula` taşıması oku.ts testlerini etkiler mi?
4. Riskler/sorular. Sonra DUR.

## Aşama 1 (Claude onayından sonra)
K1–K9'u uygula.

## Do Not
- Kimlik, e-posta, IP, cihaz kimliği, dosya/kitap adı saklama YOK. Yeni npm paketi YOK.
- `sahipDogrula` davranışı değişmez. Oturum/giriş akışı değişmez (yalnız `olay()` çağrısı eklenir).
- commit/push yok.

## Definition of Done / Testler
- `api/olay`: beyaz liste, yanlış Origin → yazma yok, büyük gövde, sınır, env yok → 204; Redis'e giden komut doğru anahtar/alan/TTL (fetch mock).
- `api/panel`: sahip değil → 403, sahip → gün listesi, eksik gün 0.
- `src/sayac.ts`: üretim+alan şartı, `?sayac=0`/`?analiz=0`, `cihaz` günde 1, hata yutulur.
- oku.ts testleri değişmeden geçer.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil` geçer.

## Geri alma
- İstemci: `SAYAC_ACIK = false` (tek satır) → hiç istek gitmez.
- Sunucu: Vercel'de `KV_REST_API_URL` kaldırılırsa `/api/olay` sessiz 204 olur. Upstash veritabanı silinince tüm sayılar gider.
- Tam geri: commit revert (privacy metni de döner).

## Deniz'in tek tıkı (Aşama 1 canlıya çıkmadan önce)
Vercel → defter → Storage → Create Database → Upstash for Redis (Free) → defter projesine bağla (env'ler otomatik eklenir).

## Aşama 0 cevapları (Claude, 3 Kasım 15:05) – Aşama 1 bunlarla yapılır
- C1 Yerler onaylı (rapordaki dosya:satırlar). `giris` yalnız `girisSonrasi()` içindeki `!restored` dalı.
- C2 D33 = D02'nin genişlemesi: "Sunucu istisnaları: OCR (sahibe özel) + kimliksiz günlük sayaç/panel. Başka sunucu işi yeni karar ister." D02 metnine bu istisnaya işaret eden kısa not eklenir.
- C3 `foto`: başarılı yükleme işlemi başına 1 (çoklu seçim = 1). `ozet`: yalnız kullanıcının oluşturduğu yeni özet PDF'i (konuyaDosyaEkle.ts:291); fotoğraftan otomatik oluşan ilk özet sayılmaz (foto zaten sayılıyor).
- C4 `kitaplik`: yalnız gerçekten yeni kitaplık klasörü oluşturulduğunda. Kurulum onarımı/var olanı bulma sayılmaz. Sonuçta ayırt edici alan yoksa kurulum fonksiyonu `{ yeniOlusturuldu: boolean }` döndürsün (davranış değişmeden) ve testi olsun. Otomatik eklenen örnek kitap `kitap` sayılmaz; `kitap` yalnız kitapOlusturDugmesi başarısı.
- C5 Yaklaşıklık kabul: panel başlığının altında küçük not "Yaklaşık sayılar; tarayıcı başına, engelleyiciler sayılmaz." / EN karşılığı.
- C6 Koruma: Origin + beyaz liste + bellek içi sınır yeterli (sayılar düşük önemde, kimlik yok). Panel API'si sahipDogrula ile tam korumalı. Ek önlem yok.
- C7 Env adları: önce `KV_REST_API_URL`/`KV_REST_API_TOKEN`, yoksa `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`; ikisi de yoksa olay 204, panel 503 "sayaç ayarlı değil".
- C8 Taşıma: `api/_sahip.ts` yalnız `{ env, fetch }` tipini alır (OkuDeps'e bağımlı değil, döngü yok); `HataKodu`/`RedNedeni` gereken kısım _sahip.ts'de, oku.ts oradan import + `epostaNormal`'ı yeniden dışa aktarır → oku testleri değişmez. OCR ayar kontrolleri oku.ts'de kalır; panel Anthropic anahtarı istemez. Vercel `api/` altında `_` ile başlayan dosyaları route yapmaz; build sonrası `.vercel/output` yoksa bu kontrol canlıda `/api/_sahip` → 404 ile yapılır.
- C9 `?panel=1` kaplaması çıkışta kapanır; kitapSihirbazi.ts deseni (.fp, .fp-kart, Escape) kullanılır.
