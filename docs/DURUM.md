# Defter – Durum

**Son güncelleyen:** Codex, 21 Ekim 2026 · K7c yayın hazırlığı: Deniz'in laptop ve gerçek iPad testleri geçti; yerel commit onaylandı · dal `codex/k7-yasal-yayin`, taban `main` b564351 · push, merge ve yayın yok.

## Bu dalın kapsamı

- Bu dal main'den açıldı. Faz-6 uygulama değişiklikleri taşınmadı; `faz-6` dalı 2a7a7fc'de korunuyor. K7a (07f47a7) push edilmişti; K7b (2a7a7fc) henüz push edilmedi.
- Faz-6'nın ayrıntılı durum belgesi kendi dalında duruyor. Bu dosya yalnız küçük yayın hazırlığını kaydeder. Proje kuralları: `CLAUDE.md` ve Deniz'in oturumda verdiği `AGENTS.md` talimatları.
- Kapsamdaki altı dosya: `public/privacy.html`, `public/terms.html`, `public/legal.css`, `index.html`, `src/styles.css`, `docs/DURUM.md`.
- Gizlilik/şartlar ve ortak CSS, K7a'dan seçilerek alındı. K7a commit'i bütünüyle cherry-pick edilmedi; panel, test script'i ve diğer faz-6 kodları taşınmadı.

## Yapılanlar

- Gizlilik ve şartlar tek statik sayfada İngilizce + Türkçe. Giriş veya JavaScript gerektirmez; ortak CSS ve mevcut ikon aynı adresten yüklenir. Mevcut ad ve iletişim bilgileri korundu; logo eklenmedi.
- Metinler main ile uyumlu ayrıldı: mevcut canlı uygulama Drive'a bağlanan herkesten tam `drive` ister. `drive.file` ve sahip ayrımı, yeni kitaplık kurulumu ve seçilen öğeleri çöpe atma ayrı faz-6 önizlemesine aittir. Önizlemedeki kurulum kilidi devam eder. Geçici dönüşüm dosyalarının çöpe atılması canlı sürümde de vardır.
- Giriş kartına kısa EN/TR uygulama açıklaması ve gizlilik/şartlar bağlantıları eklendi. Açıklama `loginText` dışında; ilk giriş, hatırlanan adla devam et ve başka hesap seçme davranışları korundu. Bağlantılar yeni sekmede açılır.
- JavaScript kapalıysa ana sayfada açıklama ve iki bağlantı görünür; kullanılamayan uygulama kabuğu gizlenir. Kısa ekranlarda giriş kartı kaydırılabilir.
- Giriş/izin, Drive yazma, kurulum, kalem ve okuyucu kodlarına dokunulmadı. Vercel ayarları ve Google ayarları değişmedi.

## Kontroller

- `npm run typecheck`: geçti.
- `npm run build`: geçti.
- `npm test -- --testTimeout=20000 --maxWorkers=2`: 71 dosyada **896/896** test geçti. Bu main tabanının test sayısıdır; faz-6 testleri bu dala taşınmadı.
- Ayrı ve temiz Chromium test oturumlarında **20 tarayıcı senaryosu + klavye kontrolü geçti**: telefon 390×844, iPad dikey 820×1180, iPad yatay 1180×820 ve kısa yatay ekran 844×390. Statik sayfalar ve ana sayfanın JavaScript kapalı açıklaması, HTTP 200/HTML, EN/TR dil bağlantıları, yatay taşma, yeni sekme/opener koruması, ilk giriş/hatırlanan hesap, hesap seçme ve örnek kitaplık kontrol edildi. Google sağlayıcısı testte taklit edildi; gerçek Google girişi ve Drive işlemi yapılmadı.
- **Deniz'in bildirimiyle laptop ve gerçek iPad testleri geçti (21 Ekim 2026).** Deniz yalnız bu adımın altı dosyası için yerel commit onayı verdi. Bu onay K8 testlerinin tamamlandığı veya yayın onayı anlamına gelmez.
- Ana sayfanın JavaScript kapalı görünümü ve ilk/hatırlanan giriş görünümünün telefon ekran görüntüleri incelendi. Kısa yatay ekranda kartın altına kaydırılarak ulaşılabiliyor. Geçici kontrol script'i repo dışında; uygulamaya veya repo testlerine eklenmedi.
- Kontrol raporu ve görüntüler: `C:/Users/yarpi/.codex/visualizations/2026/10/21/01a15e14-4f60-7c83-914e-4e1dd6734af5/k7-yasal-kontrol/`.

## Yerel deneme

Sunucu: `npm run dev -- --strictPort`; http://localhost:5173 adresinde açık.

- Ana sayfa: http://localhost:5173/
- Gizlilik: http://localhost:5173/privacy.html
- Şartlar: http://localhost:5173/terms.html
- Girişsiz örnek kitaplık: http://localhost:5173/?demo
- Gizlilik Türkçe: http://localhost:5173/privacy.html#tr
- Şartlar Türkçe: http://localhost:5173/terms.html#tr

Bu dal main tabanlı olduğundan dar/sahip modu ve yeni kurulum henüz burada yoktur. Bu denemede gerçek Google girişi veya Drive yazma işlemi gerekmez. Deniz ilk giriş görünümünü, varsa hatırlanan hesap görünümünü, iki bağlantıyı ve dil geçişlerini laptop/iPad'de kontrol eder.

## Yayın ve sıradaki adım

- Deniz'in laptop ve gerçek iPad denemesi ardından yalnız bu küçük dalın altı dosyası `Faz 6.K7c: Canlı yayın için yasal sayfalar` mesajıyla yerel commit edilir. Push, main birleştirmesi, yayın ve Google ayar değişikliği yapılmaz.
- Sonraki ayrı onaylı yayın adımında yalnız bu küçük dal main'e alınabilir; faz-6 bütünü birleştirilmez. Mevcut Vite/Vercel yapılandırması `public/` dosyalarını build çıktısına taşır; yeni yönlendirme veya altyapı ayarı planlanmadı.
- Hedef adresler: https://defter-jade.vercel.app/ , https://defter-jade.vercel.app/privacy.html , https://defter-jade.vercel.app/terms.html . Bu görevde henüz yayımlanmadı; önceki girişsiz kontrolde canlı gizlilik 404, faz-6 önizleme gizlilik sayfası Vercel girişine yönleniyordu.
- Yayından sonra girişsiz erişim tekrar doğrulanır. Branding ve Data Access düzenlemeleri bundan sonraki ayrı adımdır; Production ve doğrulama başlatma için bu görevde yetki yoktur.
- Google Cloud salt okunur keşfi: Branding adı Defter, destek/geliştirici iletişimleri dolu, logo görünmüyor; üç URL boş. Canlı ve faz-2–faz-6 Vercel alanları kayıtlı (6 alan). Audience External/Testing, 1 test kullanıcısı; Branding eksikleri nedeniyle Publish app kapalı. Data Access'in üç kapsam listesi de boş. Verification Center Testing nedeniyle doğrulama istemiyor; bu Production onayı değildir.
- Vercel alanlarının kayıtlı olması sahiplik doğrulamasının tamamlandığını kanıtlamaz. Özel alan adı, ayrı Google projesi veya Vercel koruması değişikliği kararı alınmadı.
- **K8, `?kurulum=1` kilidi, test kökünü çöpe atma ve faz-6 → main birleştirme bu görevin dışında; mevcut kararlar korunuyor.**
