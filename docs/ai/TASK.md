# TASK – Kalem modunda "Parmakla yaz" düğmesi (E-1)

Başlangıç: main (Z-1 sonrası, main = faz-6). Hata kaydı: Deniz, 3 Kasım 2026.

## Goal
Apple Pencil bir kez görülünce parmak bir daha yazamıyor (`defter-kalem-var` localStorage kalıcı). Kalemin şarjı bitince ya da kişi elle yazmak isteyince yazamıyor, yalnız kaydırabiliyor. Kalem çubuğuna bir **"Parmakla yaz"** düğmesi gelsin:
- Açıkken: tek parmak yazar/siler (kalem hiç görülmemiş gibi). İki parmak kaydırır/yakınlaştırır, ikinci parmak süren çizgiyi iptal eder (bugünkü "kalem görülmedi" yolu).
- Pencil ekrana değince düğme **kendiliğinden kapanır**, kalem modu (avuç koruması, parmak kaydırır) geri gelir. Pencil'ın o çizgisi normal çizilir.
- Düğmeyle elle de kapatılabilir.

## Context
- `src/kalem/girdi.ts` `InputRouter`: `penSeen` true olunca dokunma `gezin`/`yoksay` olur, avuç (≥100/120 px) ve kalem sonrası 300 ms yoksayılır.
- `src/kalem/kalemModu.ts` `PenInput`: `penSeen` getter'ı; `block()` içinde `twoFingerPdf`, `move()` içinde iki parmak kaydırma bu getter'a bakar.
- `src/okuma/Okuyucu.ts`: `swipe` (`!penOn || pen.penSeen`), Zoom `fingerPan` (`penOn && pen.penSeen && mode === 'pdf'`), `setPen` içinde `kalem-parmak` sınıfı (`on && !pen.penSeen`), PenInput host `penSeen: () => classList.remove('kalem-parmak')`.
- `styles.css`: `#okuyucu.kalem-parmak .o-scroll { touch-action: none }` (parmak yazarken liste kaymasın).
- Z-1 (D34) bayat dokunma temizliği aynı dosyalarda: ona dokunma, yalnız üstüne kur.

## Kararlar (Claude)
- K1 Tek kavram "etkin kalem modu": `InputRouter`'a `elModu` alanı eklenir; `get penMode() { return this.penSeen && !this.elModu; }`. Yönlendirmedeki tüm `penSeen` kullanımları (`ignoreTouch`, `move`, `down` içindeki dokunma dalı) `penMode` olur. `penSeen` yalnız "Pencil bu cihazda var mı" bilgisi olarak kalır. Neden: el modu = kalem hiç görülmemiş gibi davranmak; yeni bir yol yazmak yerine eski, denenmiş yol kullanılır.
- K2 `down('pen', …)` geldiğinde `elModu` true ise false yapılır ve kurucuya verilen yeni `onElModuBitti` geri çağrısı bir kez çağrılır (`rememberPen` gibi). Pencil'ın çizgisi normal başlar.
- K3 `PenInput`: `get penMode()` (router'dan), `get elModu()`, `setElModu(on: boolean)` eklenir. `block()` ve `move()` içindeki `this.penSeen` → `this.penMode`. `setElModu` değişince süren parmak çizgisi yoksa bir şey iptal edilmez; süren Pencil çizgisi etkilenmez. Host'a `elModuDegisti(on: boolean)` eklenir (hem düğmeyle hem Pencil'la değişince çağrılır).
- K4 `Okuyucu.ts`: `swipe`, Zoom `fingerPan`, `setPen` içindeki `kalem-parmak` ve host `penSeen` artık `pen.penMode`'a bakar. Ortak küçük fonksiyon: `parmakSinifi()` → `#okuyucu.kalem-parmak` = `penOn && !pen.penMode`; `setPen`, `penSeen`, `elModuDegisti` bunu çağırır. `elModuDegisti` ayrıca araç çubuğunu yeniden çizer (`renderTools()`).
- K5 Düğme (`kalemCubugu.ts`): ilk araç grubunun sonunda (silgiden sonra) `data-elmodu`, `aria-pressed`, el ikonu (24×24 çizgi SVG, diğer ikonlarla aynı stil), etiket TR "Parmakla yaz" / EN "Write with finger". **Yalnız `penSeen` true iken** görünür (Pencil yoksa parmak zaten yazar). `ToolbarState`'e `elModu: boolean | null` (null = gizli) eklenir; tıklama `act.elModu()` çağırır. Çubuğun tek satır sabit yüksekliği (6.H1) bozulmaz; ≤1024 px yalnız ikon.
- K6 Hatırlama: localStorage `defter-el-modu` = '1' (açıkken), kapanınca silinir (Pencil değince de). Sayfa yenilense de el modu sürer. Neden: şarj bitmişse her yenilemede yeniden açmak gerekmesin. try/catch, gizli pencerede sadece bellekte.
- K7 Bildirim (toast, mevcut `toast()`): açılınca TR "Parmakla yazma açık. Kalem değince kapanır." / EN "Finger writing on. Touching the pen turns it off."; Pencil kapatınca TR "Kalem algılandı: parmak yeniden kaydırır." / EN "Pen detected: fingers scroll again.". Düğmeyle kapatınca bildirim yok.
- K8 El modunda avuç koruması yoktur (bilinçli; düğme açıklaması bunu söylemez, Pencil dönüşü korumayı geri getirir).
- K9 Kilit: `girdi.ts` başında `export const EL_MODU = true;`, `?elModu=0` düğmeyi gizler ve el modunu her zaman kapalı sayar (eski davranış). Neden: canlıda sorun olursa adresle geri alma.
- K10 `?olcum=1` açıkken el modu değişimi günlüğe tek satır (`kalemOlcer` veya `console.info('el-modu', {on, kaynak: 'dugme'|'kalem'})`).

## Relevant Files
- src/kalem/girdi.ts, src/kalem/girdi.test.ts
- src/kalem/kalemModu.ts
- src/kalem/kalemCubugu.ts, src/kalem/kalemCubugu.test.ts
- src/kalem/kalemGezinme.test.ts (PenInput davranış testleri buradaysa)
- src/okuma/Okuyucu.ts (yalnız K4 satırları + düğme bağlama)
- src/dil/tr.ts, src/dil/en.ts (yeni anahtarlar)
- src/styles.css (gerekirse düğme ikonu; yeni kural az)

## Requirements
1. K1–K10'u uygula.
2. Testler (önce yaz, kırmızı gör, sonra yeşil):
   - Router: penSeen + elModu → tek parmak `ciz`; ikinci parmak `gezin` + `cancel`; 104 px dokunma yoksayılmaz; kalem sonrası 300 ms yoksaymaz.
   - Router: elModu açıkken `down('pen')` → `ciz`, elModu false, geri çağrı bir kez.
   - Router: elModu kapalıyken mevcut tüm testler değişmeden geçer.
   - Router/PenInput: `?elModu=0` (EL_MODU kapalı) → `setElModu(true)` etkisiz.
   - Çubuk: penSeen false → düğme yok; true → düğme var, `aria-pressed` doğru; tıklama `act.elModu` çağırır.
   - PenInput: el modunda Pencil `pointerdown` → `elModuDegisti(false)` çağrılır.
   - localStorage `defter-el-modu` okunur/yazılır/silinir.
3. TR/EN anahtarları ekle; `npm run dil` 0.

## Do Not
- Z-1 bayat dokunma mantığını, avuç eşiklerini (100/120 px), 300 ms süresini değiştirme.
- `defter-kalem-var` kaydını silme ya da anlamını değiştirme.
- Yeni paket ekleme. Drive/PDF yazma koduna dokunma.
- `git checkout`/`reset`/`stash`, commit, push yapma.

## Definition of Done
- Pencil görülmüş cihazda düğmeyle tek parmak yazar, iki parmak kaydırır; Pencil değince kalem moduna döner; yenilemede el modu korunur.
- Pencil görülmemiş cihazda hiçbir şey değişmez (düğme yok).
- Tüm testler + typecheck + build + `npm run dil` geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Playwright: kalem çubuğu 390×844, 1180×820, 1920×1080 × EN/TR (localStorage `defter-kalem-var=1` ile düğme görünür): tek satır, taşma yok. Ekran görüntülerini `C:\Users\yarpi\Projeler\defter-test-dosyalari\el-modu\` altına koy.
- Sonunda göster: değişen dosyalar, test sayısı, typecheck/build/dil, `git status`, iPad deneme adımları.
