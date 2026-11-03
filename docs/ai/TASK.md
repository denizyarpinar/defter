# TASK – K-1: fare/touchpad ile yazarken savrulan ve kaybolan çizgiler

## Goal
Bilgisayarda fare ya da touchpad ile kalem modunda yazarken çizginin ucundan anlık düz "kuyruklar" fırlıyor ve ~50 ms sonra kayboluyor (Deniz videosu, 3 Kasım). Fare/touchpad'de bu kuyruklar hiç çizilmesin; kalem (Pencil, Windows kalemi) davranışı değişmesin.

## Context
- Neden (Claude, videodan kare kare): `src/kalem/kalemModu.ts` `move()` içinde `e.getPredictedEvents()` (yalnız Chrome/Edge) tahmini noktaları canlı çizgiye ekliyor; `paint()` bunları `l.pdf`'in sonuna ekliyor, 50 ms'lik `predTimer` siliyor. Faredeki tahmin, yön değişiminde çizgiyi ileri fırlatıyor (savrulma), sonra siliniyor (kaybolma). Kaydedilen çizgi etkilenmiyor (tahmin `l.pdf`'e girmiyor).
- iPad Safari'de `getPredictedEvents` yok; Pencil zaten etkilenmiyor.
- Touchpad, tarayıcıda `pointerType === 'mouse'` gelir.

## Kararlar (Claude)
- K1 Tahmini noktalar yalnız `pointerType === 'pen'` çizgisinde kullanılır. Fare (touchpad dahil) ve parmak (`touch`) çizgisinde `getPredictedEvents` hiç okunmaz, `l.predicted` hep boş kalır. Neden: tahmin hızlı/kesik fare hareketinde güvenilmez; kalemde gecikmeyi azaltma faydası korunur.
- K2 Karar saf bir fonksiyonda: `tahminKullan(pointerType: string, acik = TAHMIN_SADECE_KALEM): boolean` (ör. `src/kalem/tahmin.ts`), testli.
- K3 Geri alma: sabit `TAHMIN_SADECE_KALEM = true`; `?tahmin=1` adres parametresi eski davranışa döner (tüm türlerde tahmin). Kalıcı karar DECISIONS.md'ye D35 olarak tek satır.
- K4 `kalemOlcer?.hareket(e, evs, pred.length)` aynı kalır (fare için pred 0 yazılır; ölçüm kuyrukların artık gelmediğini gösterir).

## Relevant Files
- src/kalem/kalemModu.ts (move, Live.pen zaten var)
- yeni src/kalem/tahmin.ts + tahmin.test.ts
- docs/ai/DECISIONS.md, docs/ai/CURRENT_STATE.md

## Requirements
1. K1–K4.
2. Önce kırmızı test: `tahminKullan('mouse') === false`, `tahminKullan('touch') === false`, `tahminKullan('pen') === true`, `?tahmin=1` ile üçü de true.
3. kalemModu'da `move()`: `const pred = l.tahmin && typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];` (Live'a `tahmin: boolean` eklenir, `down()`'da bir kez hesaplanır).
4. Mevcut tüm testler geçer.

## Do Not
- cizgiSekli.ts, koordinat.ts, girdi.ts, silgi akışı, kayıt biçimi, Pencil/parmak yönlendirmesi (E-1, Z-1) değişmez.
- `git checkout`/`reset`/`stash` yok; push yok.

## Definition of Done
Fare/touchpad çizgisinde tahmin noktası çizilmez; kalem çizgisinde eskisi gibi; testler, typecheck, build, dil geçer; commit "K-1: fare/touchpad tahmin kuyruğu kaldırıldı".

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Playwright (Chromium, 1280×800, ornek kitap, kalem modu): fareyle hızlı zikzak; her `requestAnimationFrame`'de canlı `<path>` noktalarının son tutulan noktadan ileri gitmediğini (ör. `.o-cizim.canli path` `d`'sinin sınır kutusu, o ana kadarki fare konumlarının kutusunu 3 px'ten fazla aşmıyor) kontrol et. Mümkün değilse nedenini yaz.
- Sonunda göster: değişen dosyalar, test sayısı, git status, `git diff --stat`.
