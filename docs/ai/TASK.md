# TASK – 6.6-5b: Dil değişince (yenilemede) oturum düşmesin

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-5. Önceki adım: 6.6-5a günlük (`?olcum=1`).

## Goal
Dil değişimi sayfayı yenilediğinde Google girişi korunsun. İki durumda da tek giriş yetsin:
1. Laptop: EN → giriş → TR seç → sayfa yenilenir → **giriş kartı çıkmadan** kitaplık TR açılır.
2. iPad (yerel seçim yok, EN açılır, Drive `ayarlar.dil = tr`): giriş → kitaplık gelir → Drive dili yüzünden yenilenir → **giriş kartı çıkmadan** TR açılır.

## Context (teşhis kesin, Deniz'in anlatımı + kod)
- `src/drive/auth.ts`: token yalnız bellekte (`token` değişkeni). `dilSec` (`src/dil/index.ts`) `location.reload()` / `replace` yapar → token gider → `rememberedUser` varsa "<ad> olarak devam et" kartı.
- Durum 2: `loadFromDrive` → `dilTercihiUygula` → `tercihKarari` = `yenile` (6.5-2b tasarımı, oturumda bir kez, `defter-dil-drive-yenilendi`) → `dilSec(k.dil, 'drive')` → aynı token kaybı. "Kitaplar yükleniyor… sonra giriş sayfası" bu.
- Karar mantığı (`driveTercih.ts`) doğru; sorun yalnız token'ın yenilemede kaybolması.

## Teknik kararlar (planlayıcı)
- D1 Token yalnız **bu sekmenin** `sessionStorage`'ında tutulur (`defter-oturum`: `{ value, expiresAt, aktif, scopes }`), süresi bitene kadar; açılışta geri okunur. Neden: sekme kapanınca silinir, başka sekme/cihaza geçmez, localStorage'a hiç yazılmaz; 1 saatlik GIS token'ı zaten kısa ömürlü.
- D2 Geri okunan token geçerliyse (`currentToken()` ≠ null, en az 1 dk kalmış) açılışta giriş kartı gösterilmez; popup açılmadan `googleSignIn`'in "token alındıktan sonraki" yolu çalışır (getUser → rememberUser → setSahip → updateUserBox → loadFromDrive, tam erişim kartı kuralı aynı). Bunun için o kısmı `girisSonrasi()` gibi ortak bir fonksiyona çıkar; davranış aynı kalsın. Geçersiz/bozuk/süresi dolmuş kayıt → silinir, bugünkü giriş kartı.
- D3 Kayıt silinir: `signOut`, `dropToken`, GIS `denied`/hata, süre dolumu. `signIn` başarılı olunca yazılır/güncellenir.
- D4 Geri alma bayrağı: `auth.ts`'de `const TOKEN_SAKLA = true;` false olunca ne yazar ne okur (bugünkü davranış). Ayrıca `?tokenSakla=0` aynı şeyi bu açılış için yapar (deneme/geri alma).
- D5 `?demo`, `?lang`, `?olcum` ve dil dönüşü (`defter-dil-donus`) davranışı aynı. Drive dil yenilemesi oturumda bir kez kuralı aynı (döngü sigortası zaten var).
- D6 Günlük (`authGunlugu.ts`) yeni olaylar: `token.restore` (`sonuc`: 'gecerli' | 'suresiDolmus' | 'yok' | 'bozuk' | 'kapali'), `token.store`, `token.clear` (`kaynak`). Kelime listesine eklenir; token değeri asla.

## Relevant Files
- `src/drive/auth.ts` (saklama/okuma/silme, `TOKEN_SAKLA`)
- `src/main.ts` (açılış: `prepareAuth` / `setRememberedName` / `showState` civarı; `googleSignIn` → ortak `girisSonrasi`)
- `src/drive/authGunlugu.ts` (yeni kelimeler)
- Testler: yeni `src/drive/oturumSakla.test.ts` (ya da auth'un saf parçası ayrı dosyada: `oturumSakla.ts` — saf çöz/yaz/sil, depo enjekte edilebilir)

## Requirements
1. Saf parça `src/drive/oturumSakla.ts`: `oturumCoz(ham, simdi)`, `oturumYaz(o, depo)`, `oturumOku(depo, simdi)`, `oturumSil(depo)`; depo hataları yutulur (gizli pencere: sadece hatırlanmaz).
2. `auth.ts` başlangıçta (modül yüklenirken değil, `oturumGeriYukle()` çağrısıyla) token/aktif/scopes'u geri yükler; `isSignedIn`, `currentToken`, `aktifKapsam`, `kapsamDurumu` buna göre doğru döner.
3. `main.ts` açılışta: `?demo` değilse ve `oturumGeriYukle()` geçerli token verdiyse giriş kartı yerine doğrudan `girisSonrasi()` (durum `girisBasladi` → `girisBasarili` → `yukleniyor` geçişleri bugünkü gibi; `kitaplikDurumu.ts` geçiş tablosu değişmesin, gerekiyorsa mevcut olaylarla). Hoş geldin toast'ı geri yüklemede gösterilmez.
4. `getUser` geri yüklemede 401 alırsa bugünkü 401 yolu çalışır (dropToken → kayıt silinir → kart).
5. Testler: `oturumSakla` (geçerli, süresi dolmuş, 1 dk kala, bozuk JSON, depo hatası, sil); auth: signIn sonrası yazılır, signOut/dropToken siler, `TOKEN_SAKLA=false` iken hiç yazmaz; mevcut tüm testler geçer.

## Do Not
- Token'ı `localStorage`'a, IndexedDB'ye, çereze, URL'ye ya da log'a yazma.
- `driveTercih.ts` karar mantığını, Drive dosya adlarını/JSON anahtarlarını değiştirme.
- 6.6-6 (süre dolmadan sessiz yenileme) bu adımda YOK.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. main'e push etme.

## Deniz ek onayı
- D02/D20 token kuralı: "token bellekte + yalnız bu sekmenin sessionStorage'ında, süresine kadar (6.6-5b)"; localStorage'a asla yazılmaz.
- Gizlilik/README'deki eski "token yalnız bellekte" ifadeleri EN/TR aynı anlamla güncellenir; değişen dosyalar sonuçta gösterilir.

## Definition of Done
- Yukarıdaki iki senaryoda tek giriş; yenilemeden sonra giriş kartı görünmez, kitaplık seçilen dilde açılır.
- Yeni sekmede (aynı tarayıcı) giriş kartı yine çıkar (sessionStorage sekmeye özel) — beklenen.
- Çıkış yap → yenile → giriş kartı (kayıt silinmiş).
- Testler, typecheck, build, `npm run dil` (0) geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Yerel: `?olcum=1` ile günlükte `token.store` → `dilSec` → `page.open` → `token.restore gecerli` → `loadFromDrive` sırası (gerçek Google girişi yerelde yapılabiliyorsa; yapılamıyorsa birim testleri + önizleme).
- Sonunda göster: değişen dosyalar, test sayısı, `git status`. Commit atma.

## Ek kontrol + geri alma (auth değişikliği)
- Kontrol: Claude diff'i okur (token yalnız sessionStorage, silme yolları tam). Deniz önizlemede laptop + iPad iki senaryo + "çıkış → yenile".
- Geri alma: `TOKEN_SAKLA = false` (tek satır) ya da commit tek başına `git revert`. Acil denemede `?tokenSakla=0`.
