# TASK – 6.6-5a: Oturum/dil tanı günlüğü (?olcum=1, davranış değişmez)

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-5.

## Goal
"İlk açılış EN → Google ile giriş → dili TR yap → tekrar giriş → ~5 sn sonra yine giriş kartı" hatasını gerçek cihazda bir kez yeniden üretip nedenini kesinleştirmek için, yalnız `?olcum=1` ile açılan, sayfa yenilemesinden sağ çıkan küçük bir olay günlüğü. Uygulamanın davranışı hiç değişmez.

## Context (planlayıcı kodu okudu)
- Token yalnız bellekte (`src/drive/auth.ts`). Dil değişimi `dilSec` ile `location.reload()` yapar (`src/dil/index.ts`) → token gider → giriş kartı (beklenen ilk geri atma).
- İkinci girişten sonra iki aday neden var:
  - **H1 Drive dili ezer:** `loadFromDrive` → `dilTercihiUygula` (`src/main.ts` ~657) → `tercihKarari` (`src/dil/driveTercih.ts`). Drive'daki `ayarlar.dil` hâlâ `en` ise ve bekleyen kayıt yoksa eylem `yenile` → `dilSec('en')` → yine reload → token yine gider → giriş kartı. (`dilDriveYaz` 3 sn'de bitmezse ya da `writer()` null ise olabilir.)
  - **H2 eşzamanlı signIn:** `src/drive/drive.ts` `authorized()` token yoksa `freshToken()` → `signIn({hint})` çağırır (kullanıcı dokunuşu olmadan). `signIn` başlarken önceki `pending`'i `AuthError('unknown')` ile reddeder. Kullanıcının girişi ile arka plandaki bir Drive isteği yarışırsa biri diğerini düşürür; `freshToken` catch'i `dropToken(); onExpired()` → `oturumDoldu` → giriş kartı.
- Günlük, hangisinin (ya da başka bir şeyin) olduğunu tek denemede göstermeli.

## Relevant Files
- `src/drive/auth.ts` (signIn, callback, error_callback, dropToken, signOut)
- `src/drive/drive.ts` (`freshToken`, `authorized`, 401 yolları, `onExpired`)
- `src/main.ts` (`googleSignIn`, `loadFromDrive`, `dilDegistir`, `dilDriveYaz`, `dilTercihiUygula`, `olay`, `setSessionExpiredHandler`)
- `src/dil/index.ts` (`dilSec`)
- Mevcut `?olcum=1` kutusu (6.6-1a dokunma günlüğü: `src/ui/dokunmaOlcum.ts` / ilgili yer) — aynı kutuya ya da yanına eklenir.
- Yeni: `src/drive/authGunlugu.ts` + `src/drive/authGunlugu.test.ts`

## Requirements
1. `authGunlugu.ts`: `gunlukYaz(olay: string, ayrinti?: Record<string, string | number | boolean | null>)`. Yalnız `?olcum=1` iken çalışır (değilse hiçbir şey yapmaz, sıfır maliyet). Kayıt: `{ t: ms (sayfa açılışından değil, Date.now()), sayfa: oturumdaki reload sayacı, olay, ayrinti }`. `sessionStorage` `defter-auth-gunluk`, en fazla 80 kayıt (eskisi düşer). Depo hatası yutulur.
2. Şu noktalar günlüğe yazılır (kısa İngilizce/Türkçe olay adı, serbest):
   - Sayfa açıldı: dil, `rememberedUser` var mı (true/false), `donus` var mı.
   - `signIn` başladı: `neden` ('kullanici' | 'freshToken' | 'tamErisim'), prompt, hint var mı, önceki pending iptal edildi mi.
   - GIS callback: başarılı (expires_in) / reddedildi; error_callback türü.
   - `dropToken` ve `signOut` (çağıran yer kısa etiketle).
   - `authorized`: token yokken freshToken'a gidildi (path'in yalnız ilk kelimesi, ör. `files`), 401 alındı (1. / 2.), `onExpired` çağrıldı (hangi yoldan).
   - `olay()` her durum geçişi: `tur` (+ `oturumDoldu` ise işaret).
   - `dilDegistir`: hedef dil; `dilDriveYaz`: atlandı (writer yok) / yazıldı / zaman aşımı / hata (mesajın ilk 60 karakteri).
   - `dilTercihiUygula`: driveDil, yerelDil, yerelAcikSecim, bekleyen var mı (+ fileId eşit mi, id YAZILMAZ), buOturumdaYenilendi, karar eylemi.
   - `dilSec` çağrıldı: kaynak ('kullanici' | 'drive').
3. Ölçüm kutusunda "Oturum günlüğü" bölümü: son 80 kayıt, saat (ss:dd:sn.ms) + olay + ayrıntı tek satır; "Kopyala" ve "Temizle" düğmeleri. Kutu metinleri ölçüm aracı olduğu için `// dil-kontrol: yoksay` ile işaretlenebilir (mevcut ölçüm kutusundaki üslup).
   - Deniz ek onayı: günlük giriş kartı açıkken de görünür/dokunulabilir olacak; kartın düğmelerini kapatmayacak.
   - Deniz ek onayı: `signIn` neden bilgisi eklenirse varsayılanı olacak; çağıranların davranışı değişmeyecek.
4. Gizlilik: token, e-posta, ad, Drive dosya/klasör id'si günlüğe ASLA yazılmaz (yalnız var/yok, eşit/değil).
5. Testler (`authGunlugu.test.ts`): olcum kapalıyken yazmaz; 80 sınırı; reload sayacı artar; depo hatası yutulur; ayrıntıda e-posta/token benzeri değer verilse bile (çağıranlar zaten vermez) en azından tip olarak yalnız ilkel değer kabul eder.

## Do Not
- Uygulama davranışını değiştirme: sıra, bekleme süresi, karar mantığı, token saklama aynen kalır. Bu adım yalnız günlük.
- Token'ı hiçbir depoya yazma. `localStorage` kullanma.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. main'e push etme.
- Drive dosya/klasör adlarına ve JSON anahtarlarına dokunma.

## Definition of Done
- `?olcum=1` yokken davranış ve ağ istekleri birebir aynı; varken günlük reload'dan sonra da görünüyor.
- Tüm testler, typecheck, build, `npm run dil` (0) geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Yerelde `?olcum=1&demo` ile dil düğmesine bas → reload sonrası günlükte "dilDegistir → dilSec(kullanici) → sayfa açıldı (sayfa 2)" görünür.
- Sonunda göster: değişen dosyalar, test sayısı, `git status`. Commit atma (planlayıcı kontrolünden sonra commit komutu verilecek).

## Sonra (bilgi, bu adımda yapılmaz) – 6.6-5b taslağı
- Token `sessionStorage`'da (yalnız bu sekme, süresine kadar) → dil reload'ı oturumu düşürmez; tek bayrakla kapatılabilir (`TOKEN_SAKLA`).
- Yerel son seçim kazanır (seçim zamanı saklanır); Drive eskiyse Drive güncellenir.
- `signIn` eşzamanlı çağrıları tek isteğe bağlanır (yeni çağrı eskisini reddetmez, aynı Promise'i paylaşır).
- Döngü sigortası: bir oturumda dil kaynaklı ikinci otomatik reload yok.
