# TASK – 6.6-6: 1 saat sonra oturum düşmesin (sessiz yenileme + "dokun, devam et" bandı)

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-6, Deniz kararı S5 = A. Önceki adım: 6.6-5b (token bellekte + bu sekmenin sessionStorage'ı, `?olcum=1` günlüğü).

## Goal
Defter 70 dk açık kalınca giriş kartına düşmesin. Süre bitmeden token yenilensin; tarayıcı yenilemeye izin vermezse oturum kapanmasın, üstte küçük bir "Devam etmek için dokun" bandı çıksın, tek dokunuşla devam edilsin. Bekleyen Drive istekleri ve kayıtlar kaybolmasın.

## Context (kod okundu)
- GIS token'ı ~1 saat (`expires_in` ≈ 3599), yenileme anahtarı yok. Yeni token = `requestAccessToken` = açılır pencere (prompt '' olsa da).
- Bugün: `drive.ts authorized()` → `currentToken()` null (son 1 dk) → `freshToken()` → `signIn({hint, neden:'freshToken'})` **kullanıcı dokunuşu olmadan** → tarayıcı pencereyi engeller (`popup_failed_to_open`) → `dropToken` + `onExpired` → `main.ts setSessionExpiredHandler` → `oturumDoldu` → giriş kartı. 401 yolu da aynı yere çıkıyor.
- `signIn` yeni çağrıda önceki `pending`'i reddediyor: aynı anda iki `freshToken` birbirini düşürüyor.
- 6.6-5b: açılışta `oturumGeriYukle()` token'ı geri yükler (süresi en az 1 dk kalmışsa).

## Teknik kararlar (planlayıcı)
- D1 Tek yenileme kapısı: `auth.ts`'de (ya da yeni saf `src/drive/yenileme.ts` + ince bağlayıcı) `tokenYenile(neden)`. Aynı anda gelen tüm istekler **aynı Promise**'i bekler. Neden: `pending` yarışı (biri diğerini düşürüyor) bir daha olmasın.
- D2 Zamanlayıcı: token alınınca **ve** geri yüklenince, `expiresAt − önce` anında bir kez sessiz deneme (`signIn({ hint, neden: 'zamanlayici' })`, prompt ''). `önce = min(5 dk, ömür/3)`. Sekme gizliyse beklenir; `visibilitychange` (görünür) ve `focus`'ta süre yeniden kontrol edilir (uyku/arka plan sonrası geç kalan zamanlayıcı). Her token için en fazla bir sessiz deneme. Neden: süre dolmadan, kullanıcı işinin ortasındayken değil önceden davranmak.
- D3 Sessiz deneme olmazsa (`popup-blocked`, `unknown`, 15 sn içinde cevap yok) **oturum kapanmaz**: bant gösterilir. Bant düğmesine dokunmak bir kullanıcı hareketidir → `signIn({ hint, neden: 'bant' })` aynı tıklamada çağrılır (await'ten önce, pencere engellenmesin). Başarı → bant kalkar, bekleyenler devam eder. Pencere kapatılır/izin verilmezse bant kalır, metni "Tekrar dene" olur.
- D4 `drive.ts`: oturum bu sayfada bir kez açıldıysa (giriş ya da geri yükleme) `freshToken` ve ilk 401 artık `dropToken + onExpired` yapmaz; D1 kapısını bekler (önce sessiz deneme — bu token için yapılmadıysa — olmazsa bant ve dokunuş). Bekleyen istek hata atmaz, bekler. `onExpired` yalnız: hiç oturum açılmamışken token istenirse (bugünkü yol) ve yeni token'la gelen **ikinci 401**'de (gerçek yetki sorunu, bugünkü yol).
- D5 Kayıtlar: IDB'deki kalem/fotoğraf kuyruğu ve kaydedici mantığına dokunulmaz; bekleyen yazma isteği token gelince devam eder. Kullanıcı çıkış yaparsa (`signOut`) bekleyen yenileme `AuthError`/`SessionExpired` ile biter, bant kalkar, zamanlayıcı iptal.
- D6 Geri alma: `auth.ts`'de `const SESSIZ_YENILE = true;` false iken ya da URL'de `?yenile=0` varken davranış **tamamen bugünkü gibi** (zamanlayıcı yok, bant yok, eski freshToken yolu).
- D7 Deneme kancası: `?tokenSure=N` (saniye, 120–3600) GIS'ten gelen süreyi `min(gerçek, N)` yapar; yalnız kısaltır, önizlemede de çalışır (zararsız). Saklanan `expiresAt` de buna göre.
- D8 Günlük (`authGunlugu.ts`, yalnız `?olcum=1`): `yenile.plan` (`kalanSn`), `yenile.sessiz` (`sonuc`: 'basarili' | 'engellendi' | 'zamanAsimi' | 'hata'), `bant.goster`, `bant.dokun` (`sonuc`), `yenile.bekle` (`istek`: sayı). Token değeri, e-posta, dosya adı asla.
- D9 Bant görünümü: üstte ince, ortalanmış şerit; mevcut toast/üst çubuk renk, font, köşe ve gölgesi (yeni stil icat etme). Okuyucu/kitap açıkken de üstte görünür. `role="status"`, `aria-live="polite"`, düğme klavyeyle odaklanır. Metinler iki dilde `src/dil`'e:
  - TR: "Oturumu yenilemek için dokun" / düğme "Devam et" / hata sonrası "Yenilenemedi. Tekrar dene"
  - EN: "Tap to refresh your session" / "Continue" / "Couldn't refresh. Try again"

## Relevant Files
- `src/drive/auth.ts` (zamanlayıcı, kapı, `SESSIZ_YENILE`, `?tokenSure`)
- `src/drive/drive.ts` (`freshToken`, `authorized` 401 yolu)
- `src/main.ts` (bandı bağlama; `setSessionExpiredHandler` aynı kalır)
- `src/drive/authGunlugu.ts` (yeni olay kelimeleri)
- `src/dil/*` (yeni anahtarlar, EN + TR)
- Bant için küçük yeni dosya (ör. `src/ui/oturumBandi.ts`) ve mevcut stil dosyası
- Testler: yeni `src/drive/yenileme.test.ts` (sahte saat + sahte GIS)

## Requirements
1. Saf parça (enjekte saat/zamanlayıcı/signIn): `yenilemeZamani(expiresAt, alinma)`, tek Promise kapısı, sessiz deneme sonucu → bant kararı.
2. Token alınınca/geri yüklenince zamanlayıcı kurulur; yeni token gelince eskisi iptal; `signOut`/`dropToken` iptal eder.
3. Sessiz deneme başarılıysa hiçbir şey görünmez (bant yok, toast yok); `token.store` bugünkü gibi sessionStorage'ı günceller.
4. Bant dokunuşu `signIn`'i senkron başlatır (pencere engellenmesin); aynı anda tek bant.
5. Süre dolmuş ve bant açıkken yapılan Drive istekleri hata atmaz, dokunuştan sonra sırayla devam eder.
6. `SESSIZ_YENILE=false` / `?yenile=0` → eski davranış birebir (mevcut testler bunu korur).
7. Testler: zamanlama (5 dk önce; kısa ömürde ömür/3), gizli sekmede bekleme + görünür olunca deneme, eşzamanlı 3 istek tek `signIn`, sessiz başarı → bant yok, engellendi → bant + istekler bekler + dokunuş → devam, pencere kapatıldı → bant "Tekrar dene", ikinci 401 → onExpired, signOut → bekleyenler biter, `?tokenSure=120`, `?yenile=0` eski yol. Mevcut tüm testler geçer.

## Do Not
- Token'ı localStorage/IndexedDB/çerez/URL/log'a yazma (6.6-5b kuralı aynı).
- Sunucu tarafı giriş, yenileme anahtarı, yeni API (B yolu) YOK.
- IDB kuyruğu, kaydedici, `driveTercih.ts`, Drive dosya adları/JSON anahtarları, `kitaplikDurumu.ts` geçiş tablosu değişmez.
- Bant dışında yeni arayüz yok; giriş kartı tasarımına dokunma.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. main'e push etme. Commit atma (Deniz söyleyince).

## Definition of Done
- `?tokenSure=120` ile: laptop Chrome ve iPad Safari'de 3 dk açık kalınca giriş kartı çıkmaz; ya sessizce yenilenir ya da bant çıkar, tek dokunuşla devam edilir.
- Bant açıkken kalemle yazılan çizgi dokunuştan sonra Drive'a kaydedilir (kayıp yok).
- Çıkış → yenile → giriş kartı (bugünkü gibi). `?yenile=0` → eski davranış.
- Testler, typecheck, build, `npm run dil` (0) geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Derlenmiş uygulamada sahte GIS ile: sessiz başarı, engellenme → bant → dokunuş, 3 eşzamanlı istek.
- Bant için 390×844 ve 1180×820 ekran görüntüsü (EN + TR), taşma yok.
- Sonunda göster: değişen dosyalar, test sayısı, `git status`, laptop + iPad deneme adımları (`?tokenSure=120&olcum=1`).

## Ek kontrol + geri alma (auth değişikliği)
- Kontrol: Claude diff'i okur (onExpired yalnız iki yolda, kapı tek Promise, token saklama kuralı aynı). Deniz önizlemede laptop + iPad `?tokenSure=120&olcum=1`, sonra gerçek 70 dk bir kez.
- Geri alma: `SESSIZ_YENILE = false` (tek satır) ya da commit'i `git revert`. Acil: `?yenile=0`.
