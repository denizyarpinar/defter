# Defter – Durum

**Son güncelleyen:** Codex, 21 Ekim 2026 · 6.K8a tamamlandı: ikinci hesapta dar/drive.file, sahip=false; kurulum ve örnek PDF laptop + gerçek iPad'de geçti, iPad'de yeniden kurulum gerekmedi (Deniz bildirimi) · faz-6 Preview 2a7a7fc Ready · `main` c0da010, faz-6 birleşmedi · yalnız durum belgesi için yerel commit onaylandı; yeni push/merge yok.

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
| 6.K6c | Masadaki İçindekiler sayfalara bölünür | Bitti (laptop + iPad geçti; faz-6 f4b98d0) |
| **6.K7** | Yayına hazırlık: gizlilik sayfası EN/TR, README "Kullanmaya başla", Google Branding + Production | **Şimdi** |
| 6.K7a | Girişsiz gizlilik ve kısa şartlar sayfaları (EN/TR), giriş/Özelleştir bağlantıları | Bitti; laptop + gerçek iPad Safari geçti (faz-6 07f47a7, push edildi) |
| 6.K7b | README yeni kullanıcı rehberi | Bitti; 2a7a7fc, origin/faz-6 dalına push edildi |
| 6.K8a | İkinci hesapla gerçek test hazırlığı | Tamamlandı; dar/drive.file, sahip=false; kurulum ve örnek PDF laptop + gerçek iPad'de geçti, iPad'de yeniden kurulum gerekmedi (Deniz bildirimi) |
| 6.K8 | Gerçek test, main | Sırada |
| 6.4 / 6.5 | OCR / iki dil (EN + TR) | Sonra |
| 7 | Quiz/özet (LLM API) | Sonra |

### Sıradaki 3 adım

**6.K7 – Yayına hazırlık (şimdi)**
- Kabul: gizlilik sayfası İngilizce + Türkçe; README'de "Kullanmaya başla" bölümü; Google Cloud'da Branding sayfası tamam ve uygulama Production'da.
- Not: `*.vercel.app` alan adı doğrulaması belirsiz, K7'de bakılacak.

**21 Ekim keşfi:**
- Git temizdi; `git pull --ff-only` sonrası güncel. `public/privacy.html` mevcut dalda yok; giriş ekranında gizlilik bağlantısı da yok. Devir notundaki mevcut sayfa bilgisi doğrulanmadı.
- Deniz gizlilik için tek sayfada İngilizce + Türkçe düzenini seçti; herkese açık iletişim adresini ayrıca belirtti (buraya yazılmaz).
- Gizlilik metni kodla eşleşmeli: ad/e-posta ve tercihler localStorage'da; PDF önbelleği, bekleyen kalem kayıtları ve fotoğraflar IndexedDB'de; token yalnız bellekte. Google Drive, Google Fonts ve Vercel kullanıldığı için "üçüncü tarafa hiçbir veri gitmez" denmemeli.
- Sıra: K7a gizlilik ve kısa şartlar (Deniz onayladı), K7b yeni kullanıcı rehberi ve eski README ifadelerinin düzeltilmesi, K7c Google Branding/Data Access/Production.
- Google'ın güncel belgelerinde `drive.file` hassas olmayan, `drive` kısıtlı kapsam. Marka (uygulama adı/logo) doğrulaması ayrı; logosuz olmak doğrulamadan kesin muafiyet anlamına gelmiyor. Kullanım şartları konusunda geliştirici belgesi "isteğe bağlı", Branding yardım belgesi bağlantıları topluca gerekli diyor; canlı Console alanı K7c'de kontrol edilecek.
- K7c önkoşulu: ana sayfa ve gizlilik bağlantısı Google tarafından girişsiz erişilebilir olmalı. Dal önizlemesinin Vercel koruması ve main birleştirmesinin K8'de olması nedeniyle sayfaların yayın yolu ayrıca netleştirilecek. Cloud Console'un bugünkü durumu henüz görülmedi; 18 Ekim notu canlı durum gibi kabul edilmedi.
- Kaynaklar: [Google marka doğrulaması](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Branding alanları](https://support.google.com/cloud/answer/15549049), [Drive kapsamları](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

**6.K7a – Uygulama ve kontrol (21 Ekim):**
- `public/privacy.html` ve `public/terms.html`: tek sayfada EN/TR, üstte sabit dil bağlantıları, iki dilde güncelleme tarihi. Statik HTML/CSS; giriş, JavaScript veya harici font gerektirmez. İletişim adresi Deniz'in açık onayıyla yalnız bu sayfalara eklendi.
- Gizlilik metni kodla karşılaştırıldı: dar/sahip kapsamı, hesap bilgileri, localStorage, IndexedDB/PDF önbelleği, bekleyen kayıtlar, ilk PDF sürümünün korunması, Google'da dönüşüm ve metin araması, Google Fonts ve Vercel rolleri. Limited Use uyum açıklaması ve resmî politika bağlantısı var.
- Saklama süreleri ve süreye bağlı silinmeyen kayıtlar, Google erişimini kaldırma, cihaz site verilerini temizleme ve Drive'dan kaldırma ayrı anlatıldı. Erişimi kaldırmak dosyaları veya bütün cihaz kayıtlarını silmez; cihaz verisi temizliği yüklenmemiş kayıtları kaybettirebilir.
- Bağlantılar `index.html` giriş kartında ve `src/ui/panel.ts` Özelleştir panelinin sonunda. Yeni sekmede açılır (mevcut çalışma korunur); stiller `src/styles.css` ve yalnız statik sayfalara ait `public/legal.css` içinde.
- Kontrol: typecheck ve build geçti; 103 test dosyasında **1280/1280** test geçti (`--testTimeout=20000 --maxWorkers=2`). `node scripts/gizlilik-kontrol.mjs`: 390×844 telefon, 820×1180 iPad dikey ve 1180×820 yatay; **9 senaryo + klavye kontrolü geçti**. Girişsiz/JavaScript kapalı erişim, gerçek HTML yanıtı, dil/gezinme bağlantıları, yeni sekme ve yatay taşma kontrol edildi. App bağlantıları giriş kartı ve örnek kitaplıktaki ortak Özelleştir panelinde denendi; gerçek Google girişi yapılmadı.
- 19 ekran görüntüsü ve `rapor.json`: `%USERPROFILE%/iCloudDrive/uni_plan_claude_code/Claude outputs/gizlilik-6.K7a/`. Chromium ekran boyutu benzetimiyle alınan görüntüler incelendi; ayrıca Deniz gerçek cihaz testlerini tamamladı.
- **Deniz'in laptop ve gerçek iPad Safari testleri geçti (21 Ekim).** K7a'nın 8 dosyası `07f47a7` ile commit edildi ve `origin/faz-6` dalına push edildi; main birleştirmesi yok.
- Yerel sunucu: `http://localhost:5173/privacy.html`, `http://localhost:5173/terms.html`. Dar: `http://localhost:5173/?kapsam=dar&sahip=0&kurulum=1&olcum=1`; sahip: `http://localhost:5173/?kurulum=1&olcum=1`.
- iPad önizlemesi (Vercel dağıtımı hazır olduktan sonra): `https://defter-git-faz-6-deniz-b571.vercel.app/privacy.html`, `https://defter-git-faz-6-deniz-b571.vercel.app/terms.html`. Dar: `https://defter-git-faz-6-deniz-b571.vercel.app/?kapsam=dar&sahip=0&kurulum=1&olcum=1`; sahip: `https://defter-git-faz-6-deniz-b571.vercel.app/?kurulum=1&olcum=1`. Vercel erişim koruması geçerli olabilir.
- Drive yazma/çöpe atma akışları, izin kapsamları ve `?kurulum=1` kilidi değiştirilmedi. Google Cloud ayarları değiştirilmedi. K7b sonucu aşağıda.

**6.K7b – Uygulama (21 Ekim, Deniz onayıyla):**
- README'nin ana dili İngilizce korundu; başa kısa "Getting started (preview)" rehberi eklendi: Google ile giriş → kitaplığı kur → isteğe bağlı örnek kitap → yeni kitap sihirbazı → konu aç → Dosya ekle. Dar izinde Drive'a elle eklenen dosyaların kendiliğinden görünmediği ve uygulamadan eklenmesi gerektiği açıklandı.
- Deniz'in istediği önizleme adresi aynen kullanıldı: `https://defter-git-faz-6-deniz-b571.vercel.app/?kurulum=1`. Bu, README için özel seçilen kısa deneme adresidir. Genel kullanıma açılışın ve Google Branding/Production hazırlığının bitmediği, kurulum kilidinin durduğu ve önizleme/test hesabı erişim sınırlamaları belirtildi.
- Gizlilik ve şartlar bağlantıları Deniz'in isteğiyle aynı daldaki `public/privacy.html` ve `public/terms.html` dosyalarına göreli bağlantı olarak eklendi. Canlı üretim sürümünde yayımlanmış sayfa gibi sunulmadı.
- Yeni rehberle doğrudan çelişen klasör açma/çöpe atma/genel yazma ifadeleri önizleme ve kilit durumu korunarak düzeltildi. Geliştirici kurulumu ayrıldı; yeni kullanıcıya elle klasör/JSON hazırlama adımı verilmedi. Yalnız README ve bu durum dosyası değişti; uygulama/Drive/izin/kilit değişikliği, commit veya push yok.
- Kontrol: README'deki 13 farklı yerel dosya hedefi mevcut; gizlilik/şartlar dosyaları bu dalda Git tarafından izleniyor, göreli bağlantılar doğru. Önizleme adresi Deniz'in verdiği metinle birebir aynı; "Getting started" bölüm bağlantısı kontrol edildi. Uzak sitelerin HTTP erişimi bu belge adımında yeniden denenmedi.
- Typecheck ve build geçti; 103 dosyada **1280/1280** test geçti (`--testTimeout=20000 --maxWorkers=2`). `git diff --check` temiz. Sıradaki adım K7b'nin Deniz tarafından gözden geçirilmesi, ardından K7c keşif/planı.

**6.K8a – Gerçek ikinci hesap ve Preview (21 Ekim, Deniz onayıyla):**
- Başlangıçta main çalışma alanı temizdi. Yerel/uzak main c0da010, yerel faz-6 2a7a7fc, uzak faz-6 07f47a7 idi. Yalnız eksik K7b commit'i (README + durum belgesi) faz-6 dalına push edildi; yeni kod commit'i veya main birleştirmesi yapılmadı.
- Vercel, GitHub kesintisi nedeniyle otomatik dağıtım gecikmesi bildiriyordu. Mevcut projede yalnız 2a7a7fc için **Preview** dağıtımı başlatıldı: `Ap2NgaaGh1x6sVFU46xR8EihQ5wR`, **Ready**. Kaynak faz-6 ve dal adresinin bu dağıtıma bağlı olduğu doğrulandı. Canlı dağıtıma dokunulmadı.
- Gerçek test adresi: https://defter-git-faz-6-deniz-b571.vercel.app/?kurulum=1&olcum=1 . Gerçek ikinci hesapta kapsam/sahip zorlaması kullanılmadı. Google girişini ve izin onayını Deniz tamamladı; izin ekranı yalnız uygulamayla kullanılan belirli Drive dosyalarını gösterdi.
- Girişten önce kitaplık kurulmadı. Giriş sonrası ölçüm kutusunda **kapsam: dar**, **scope: drive.file**, **sahip: hayır (false)**, **kök: yok** doğrulandı. Ardından onaylanan plan kapsamında örnek kitap seçili bırakılarak kurulum başlatıldı.
- Kurulum tamamlandı: `Defter Library (defterKok)`, yarım kitap 0; aynı dar kapsam korundu. `Programlamaya Giriş` örnek kitabı bulundu (2 ünite, 4 konu). `Değişkenler ve veri tipleri` konusu, Özet materyali açıldı: 24 sayfalık PDF'nin ilk iki sayfası çizildi, okuyucu hata mesajı boştu. Okuyucu kapatıldığında konu Okunuyor ve kaldığın yerden devam s. 1 görünüyordu.
- Görüntüler: `C:/Users/yarpi/.codex/visualizations/2026/10/21/01a15e14-4f60-7c83-914e-4e1dd6734af5/k8a/`. Hesap e-postası veya token kaydedilmedi.
- **Laptop + gerçek iPad testi geçti (21 Ekim 2026, Deniz bildirimi):** ikinci hesapta dar/drive.file ve sahip=false; kurulum ve örnek PDF laptop + gerçek iPad'de çalıştı. iPad'de aynı kitaplık açıldı, yeniden kurulum gerekmedi. **6.K8a tamamlandı.** Bu sonuç, K8'in sonraki işleri olan kilit kaldırma, eski test kökü temizliği veya main birleştirmesi için onay değildir.
- K7c'nin güncel durumu: main c0da010 yasal sayfalarla canlı; OAuth In production, doğrulama başlatılmadı, Console sınırı 1/100. Bu daldaki eski K7 notları tarihçedir. Main'deki ek açıklama/noscript, canlı–önizleme ayrımlı metinler ve küçük stil farkları faz-6'ya alınmadı; ortak legal.css aynı. Otomatik birleştirme yapılmadı.
- `?kurulum=1` kilidi, eski test kökü, Google ayarları ve main korundu. Bu kayıt dışında repo dosyası değiştirilmedi. Deniz yalnız durum belgesi değişikliğini `Faz 6.K8a: İkinci hesap laptop ve iPad testi` mesajıyla yerel commit etmeyi onayladı; bu commit push edilmez, merge yapılmaz. Kök temizliği ve kilit kaldırma bu adımda yapılmaz.

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
- Masadaki İçindekiler gerçek DOM ölçümüyle sayfalara bölünür; devam sayfasında "İçindekiler (devam)", yetim ünite başlığı yok (6.K6c; kontrol: `node scripts/icindekiler-sayfa-kontrol.mjs`).
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
- Özelleştir panelindeki "Drive'a kaydetme yakında geliyor" notu eski; K7a kontrolünde görüldü, bu adımda değiştirilmedi.
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
