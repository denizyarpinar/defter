# TASK – iPad PDF: iki parmak yakınlaştırma takılması (Z-1)

Başlangıç: main (Panel 2 sonrası). Hata kaydı: Deniz, 3 Kasım 2026, iPad videosu (PDF modu, kalem açık, sayfa yakınlaştırılmış).

## Goal
iPad'de PDF modunda günde 1–2 kez görülen iki hata kalksın:
- **H1:** Kalem ve tek parmak kaydırma çalışıyor ama iki parmakla yakınlaştırma/uzaklaştırma hiçbir şey yapmıyor (sayfa yenilenene kadar).
- **H2:** Ekran "donuyor"; tek parmakla kaydırmak isteyince kaydırma yerine yakınlaştırma/uzaklaştırma oluyor.

## Context (Claude teşhisi)
İkisinin ortak kökü: **kapanmamış (bayat) dokunma kaydı**.
- `ZoomController.pts` (`src/okuma/zoomKontrol.ts`) dokunmaları `pointerdown`'da ekler, yalnız `#oKitap`/scroller üzerindeki `pointerup`/`pointercancel` ile siler.
- iPad Safari'de bir dokunmanın olayları, dokunmanın başladığı öğeye gider. Bu öğe (sayfa canvas'ı, net çizim canvas'ı, kalem SVG katmanı) parmak ekrandayken DOM'dan kaldırılırsa (`freeCanvas`, `dropLayer`, `release`, yakınlaştırma sonrası yeniden yerleşim `replaceChildren`) `pointerup`/`pointercancel` kopmuş ağaçta kalır, scroller'a hiç ulaşmaz. Uygulama değiştirme / Denetim Merkezi / çok parmak sistem hareketi de iptali yutabilir.
- Sonuç: `pts` içinde hayalet bir kayıt kalır.
  - Hayalet 1 + gerçek 2 parmak → `pts.size === 3` → `size === 2` dalı hiç çalışmaz, `size >= 2` dalı yalnız `pinched = true` yapar → **H1**.
  - Hayalet 1 + gerçek 1 parmak → `pts.size === 2` → iki parmak (fingerPan/pinch) yolu hayalet nokta ile tek parmağı "iki parmak" sanar; parmak hareket edince uzaklık değişir → yakınlaştırma → **H2**.
- Aynı risk `PenInput` (`src/kalem/kalemModu.ts`) içindeki `fingers`, `ignored`, `ignoredTouches`, `touchPointers` için de var (`ignoredTouches` bayat kalırsa `blocksGestures()` hep true olur, her dokunma iptal edilir). Ayrıca `ZoomController.gesture` (Safari `gestureend` kaçarsa) `busy`'yi hep true tutar → net çizim hiç gelmez.

## Kararlar (Claude)
- K1 Kendini onarma, tahmin değil: **tarayıcıya göre ekranda başka parmak yokken** gelen dokunma (`e.pointerType === 'touch' && e.isPrimary`) yeni bir hareketin başıdır. O anda `ZoomController` tüm dokunma durumunu sıfırlar: `pts`, `fingers` (+ rAF), `pinch` (önizleme varsa `commitPreview` + `settleSoon`), `down`, `drag`, `pinched`, `gesture`, `pointerGesture`. Sonra normal akış devam eder. Neden: kaybolan olayın nereye gittiğinden bağımsız, her türlü bayat kaydı ilk yeni dokunuşta temizler.
- K2 Aynı kural `PenInput.down` içinde: birincil dokunmada dokunma kayıtları (`fingers`, `ignored`) temizlenir; kalemin (`pen`) süren çizimi etkilenmez. `touchstart`'ta `e.touches.length === e.changedTouches.length` (ekrandaki tüm parmaklar yeni) ise `ignoredTouches` ve `touchPointers` temizlenir. Çizim (`live`/`rub`) bir dokunmaya aitse ve o dokunma bayatsa `cancel()`.
- K3 Ek güvenlik: `window`'a capture aşamasında `pointerup`/`pointercancel` dinleyicisi (pasif) – ulaşabilen olaylar için aynı silme yolu (`onUp(e, false)` benzeri, ama tap/swipe tetiklemeden). `document` `visibilitychange` (gizlenince) ve `window` `blur`/`pagehide` → K1 sıfırlaması ve `PenInput` dokunma kayıtlarının temizlenmesi (`cancel()` dahil).
- K4 Kalıcı iki parmak kilidi yok: `size >= 2` ama iki parmak yolu başlamamışsa (3+ kayıt) ve `pts` içinde son 1500 ms'de hiç `pointermove` görmemiş kayıt varsa o kayıt silinir ve iki parmak yolu yeniden denenir. (Kayıt başına `son` zaman damgası tut.) Neden: birincil dokunma gelmeden de (bir parmak hep ekrandayken) takılma çözülsün.
- K5 Ölçüm: `?olcum=1` açıkken her bayat temizlik bir satır yazar (`dokunmaIptal` ile aynı günlüğe ya da `console.info('zoom-bayat', {kaynak, silinen})`). Normal kullanımda sessiz.
- K6 Geri alma bayrağı: `zoomKontrol.ts` başında `const BAYAT_TEMIZLE = true;` ve `?bayat=0` kapatır (K1–K4 devre dışı, eski davranış). PenInput tarafı da aynı bayrağa bakar (paylaşılan küçük modül, ör. `src/okuma/bayatDokunma.ts`).

## Relevant Files
- src/okuma/zoomKontrol.ts (ana değişiklik)
- src/kalem/kalemModu.ts (`PenInput`: down, block, end)
- src/okuma/ikiParmak.ts (değişmesi beklenmez)
- src/okuma/Okuyucu.ts (yalnız gerekiyorsa bağlama; ~520 ve ~600. satırlardaki ZoomController kurulumları)
- Yeni: src/okuma/bayatDokunma.ts (+ test)

## Requirements
1. K1–K6'yı uygula. Saf mantığı (hangi kayıt bayat, ne zaman sıfırlanır) DOM'suz bir fonksiyona ayır ve test et.
2. Testler (vitest):
   - Hayalet kayıt + yeni birincil dokunma → `pts` yalnız yeni parmağı içerir; sonra ikinci parmak → pinch/fingerPan yolu başlar (H1 senaryosu).
   - Hayalet kayıt + tek parmak sürükleme → yakınlaştırma OLMAZ (H2 senaryosu).
   - Hayalet kayıt varken birincil olmayan dokunma + 1500 ms hareketsiz kayıt → K4 ile silinir.
   - `?bayat=0` → eski davranış (hayalet kalır).
   - Normal iki parmak pinch, çift dokunma yakınlaştırma, kitap modu kaydırma/çevirme testleri değişmeden geçer.
3. Mevcut bütün testler, typecheck, build, dil kontrolü geçer.
4. DECISIONS.md'ye kısa D34 (bayat dokunma onarımı, bayrak), CURRENT_STATE'e bir satır.

## Do Not
- Yakınlaştırma eşiklerini (PAN/PINCH_THRESHOLD), avuç eşiklerini, `touch-action` değerlerini, `sayfaZoom.ts` tarayıcı zoom korumasını değiştirme.
- Canvas/SVG oluşturma–silme düzenini değiştirme (bu adımda yalnız durumu onarıyoruz).
- main'e push/merge yok. faz-6'ya gönderim yalnız Deniz onayıyla.
- Yeni paket ekleme.

## Definition of Done
- H1 ve H2 senaryoları testte kırmızıdan yeşile döner (önce testi yaz, kırmızı olduğunu göster).
- Tüm testler + typecheck + build geçer; `git diff --stat` ve tam diff gösterilir.
- Commit YAPMA; diff'i göster, Claude incelesin.

## Verification
- `npm test`, `npm run typecheck`, `npm run build` (repo'daki gerçek komut adlarıyla) çıktılarının özeti.
- Değişen dosyaların tam diff'i.
- İncelemeden sonra: faz-6 önizlemede iPad denemesi – yakınlaştırılmış PDF'te kalemle yaz, hızlı kaydır, iki parmakla yakınlaştır/uzaklaştır; ?olcum=1 ile bayat temizlik satırı görülürse kök neden doğrulanmış olur.
