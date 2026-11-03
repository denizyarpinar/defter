# TASK – Panel: Vercel Web Analytics (çerezsiz ziyaretçi sayacı)

Karar (Claude, 3 Kasım 2026): Defter'de sunucu/veritabanı yok; kullanıcı listesi tutmak gizlilik sayfasını ve Google Limited Use'u zorlar. Bu yüzden panel = Vercel Web Analytics (çerezsiz, toplu sayım) + Google Cloud'un hazır Drive API grafikleri (kod yok). E-posta/ad hiçbir yere gönderilmez.

## Goal
mydefter.app'te ziyaretçi, sayfa görüntüleme, ülke, cihaz/tarayıcı sayıları Vercel panosunda görünsün. Gizlilik sayfası bunu doğru anlatsın.

## Context
- index.html tek giriş; `src/main.ts` modül. Sunucu tarafı yalnız `api/oku.ts` (sahibe özel OCR), dokunulmaz.
- public/privacy.html şu an "analytics tracking yok / analiz takibi bulunmaz" diyor (EN + TR, bölüm 3) → değişmeli.
- Vercel Hobby planı: sayfa görüntüleme ücretsiz; özel olaylar (custom events) Pro ister → özel olay YOK.

## Relevant Files
- package.json, src/main.ts (veya en erken başlangıç dosyası), public/privacy.html, docs/ai/DECISIONS.md, docs/ai/CURRENT_STATE.md

## Requirements
1. `npm i @vercel/analytics` (tam sürüm sabitle, `^` yok).
2. Yeni dosya `src/analiz.ts`: `ANALIZ_ACIK = true` bayrağı; `?analiz=0` o oturumda kapatır.
   - `inject({ mode: 'auto', beforeSend })` yalnız `import.meta.env.PROD` ve `location.hostname === 'mydefter.app'` iken (önizleme/localhost sayılmaz).
   - `beforeSend`: URL'den query (`?…`) ve hash (`#…`) silinir; yalnız `origin + pathname` gider. Hiçbir zaman e-posta, ad, dosya adı, Drive kimliği gönderilmez.
3. `main.ts` başında `analizBaslat()` çağrılır; hata atarsa yutulur (uygulama asla bozulmaz).
4. privacy.html (EN + TR, iki yerde):
   - Bölüm 3'e Vercel maddesinin altına: "Vercel Web Analytics: counts page views without cookies; records page path (without query or hash), referrer, country, browser, OS and device type in aggregate. No account details, Google user data or document information is sent." / TR karşılığı.
   - "Defter’s app code does not include advertising or analytics tracking" → "Defter shows no advertising and uses no cross-site tracking; it uses only the cookieless Vercel Web Analytics described above." TR: "Defter reklam göstermez, siteler arası takip yapmaz; yalnız yukarıda açıklanan çerezsiz Vercel Web Analytics'i kullanır."
   - "Last updated / Son güncelleme" → 3 November 2026 / 3 Kasım 2026.
5. Testler (`src/analiz.test.ts`): beforeSend query+hash siler; `?analiz=0` → inject çağrılmaz; localhost/önizleme → çağrılmaz; inject hata atarsa uygulama devam.
6. DECISIONS'a D32: "Panel = Vercel Web Analytics, çerezsiz, URL yalnız path; kullanıcı listesi/DB tutulmaz." CURRENT_STATE'e bir satır.

## Do Not
- Kullanıcı e-postası/adı/Drive verisi toplama, veritabanı, yeni api/ dosyası yok.
- Speed Insights, Google Analytics, çerez yok. api/oku.ts'ye dokunma.
- push yok; commit Deniz onayından sonra.

## Definition of Done
- Testler + typecheck + build + dil kontrolü geçer.
- Önizlemede ağ sekmesinde `/_vercel/insights/` isteği YOK; canlıda var ve gönderilen URL'de `?` ve `#` yok.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Geri alma: `ANALIZ_ACIK = false` (tek satır) veya Vercel panosunda Analytics → Disable. privacy.html eski metne commit revert ile döner.

## Deniz'in tek tıkı (kod dışı)
Vercel → defter projesi → Analytics sekmesi → Enable. Canlıya çıkınca sayılar ~30 sn içinde görünür.
