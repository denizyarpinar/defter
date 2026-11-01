# TASK – 6.6-0: Telefonda dil değişince sayfa sayacı kaymasın (12 → 13)

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-0.

## Goal
Telefonda PDF modunda, kısa (yatay / 16:9) özet sayfaları okunurken dil değiştirilince okuyucu aynı sayfada açılsın ve sayaç aynı numarayı göstersin. Her dil değişiminde sayaç 1 ileri kaymasın.

## Context (teşhis, planlayıcı kodu okudu)
- Dil değişimi (`src/main.ts` ~617) `okuyucuKonumu()` ile `sonOkunan` sayfayı `dil/donus.ts`'e yazar; yeniden açılışta `showMaterial` → `enterMode` sayfayı en üste koyar: `scrollTop = layout.tops[start] - PAD_TOP`. Bu kısım doğru.
- Sayaç ve okuma kaydı `focusPage()` → `currentPage(layout, scrollTop, viewH)` (`src/okuma/sanalListe.ts`) ile hesaplanıyor: "ekranın üst üçte birini kesen sayfa" = `pageAt(scrollTop + viewH / 3)`.
- Telefon dikey (~390 px genişlik), 16:9 sayfa ≈ 205 px yükseklik + 18 px boşluk. viewH ≈ 750 → viewH/3 ≈ 250 > sayfa + boşluk. Yani 12. sayfa en üstteyken üçte bir çizgisi 13. sayfaya düşer: sayaç 13 der, `recordReading` 13'ü `sonOkunan` yapar, bir sonraki dil değişimi 13'ten açar → her seferinde +1.
- Aynı hata sürgü / içindekiler ile `goToPage(i)` atlayışında da var (i'ye gider, sayaç i+1 der).

## Teknik kararlar (planlayıcı)
- D1 Düzeltme yeri `currentPage` (saf fonksiyon). Neden: sayaç, okuma kaydı, dil dönüşü ve `relayout` aynı tanımı kullanıyor; tek yerde düzelir, DOM'a dokunmadan test edilir.
- D2 Yeni tanım: üst üçte birlik alanda (`[scrollTop, scrollTop + viewH/3]`) **başlayan ilk sayfa** (en küçük indeks, `tops[i] + PAD_TOP ≥ scrollTop` ve `tops[i] ≤ scrollTop + viewH/3`) "üzerinde olunan" sayfadır; bu alanda başlayan sayfa yoksa bugünkü kural (`pageAt(scrollTop + viewH/3)`). Neden: sayfa en üste yerleştirildiğinde (dönüş, sürgü, içindekiler) tam o sayfa sayılır; uzun A4 sayfalarda davranış değişmez çünkü üçte birlik alanda zaten tek sayfa başı olur.
  - Not: `PAD_TOP` toleransı, `scrollTop = tops[i] - PAD_TOP` ile yerleştirilen sayfanın "başlamış" sayılması için. `pageAt` ikili aramasıyla uyumlu, O(log n) ya da küçük bir ileri tarama yeterli.
- D3 Kitap modu, `dil/donus.ts`, `main.ts` ve `enterMode` değişmez. Liste sonunda (kaydırma tavanı) dönüşün tam sayfaya oturmaması bugünkü gibi kalır (kapsam dışı).

## Relevant Files
- `src/okuma/sanalListe.ts` (`currentPage`)
- `src/okuma/sanalListe.test.ts`
- Okuma (değiştirme): `src/okuma/Okuyucu.ts` (`focusPage`, `enterMode`, `goToPage`, `relayout`, `recordReading`), `src/main.ts` ~600–630, `src/dil/donus.ts`

## Requirements
1. `currentPage` D2'ye göre değişsin; imza aynı kalsın. Kısa açıklama yorumu İngilizce (dosyadaki üslup).
2. `relayout` içindeki `into` hesabı yeni `cur` ile negatif küçük değer alabilir (PAD_TOP kadar); dönüşte aynı noktaya oturduğunu testle ya da akıl yürütmeyle göster, gerekirse dokunma.
3. Testler (`sanalListe.test.ts`, mevcut testler aynen geçsin):
   - 16:9 sayfalar, genişlik 370, viewH 750: `currentPage(l, l.tops[12] - PAD_TOP, 750) === 12` (bugün 13 döner, önce kırmızı olduğunu göster).
   - Aynı düzende 0., son-1. ve rastgele 3 indeks için `tops[i] - PAD_TOP` → `i`.
   - A4 sayfalarda (genişlik 370) normal kaydırma: sayfa 4'ün yarısı üstte kalmış, sayfa 5'in başı üçte birlik alanda → 5 (bugünkü davranış).
   - Bir sayfanın ortasındayken (hiçbir sayfa başı üçte birlik alanda değil) → o sayfa.
   - Boş liste ve tek sayfa çökmez.

## Do Not
- `git checkout` (dal değiştirme), `reset`, `stash`, force push; main'e push yok.
- Kitap modu, dil dosyaları, sessionStorage anahtarı (`defter-dil-donus`), Drive JSON anahtarları değişmez.
- Başka dosyada "temizlik" yapma.

## Definition of Done
- Telefon genişliğinde (390×844, PDF modu, 16:9 sayfalı özet) sayfa 12'deyken EN↔TR 3 kez değiştirilince sayaç her seferinde 12 der.
- Sürgüyle 12'ye gidince sayaç 12 der.
- iPad / laptop A4 okumada sayaç davranışı aynı.
- typecheck, test (hepsi), build, `npm run dil` = 0 geçer.

## Verification
- `npm run typecheck`, `npm test`, `npm run build`, `npm run dil`.
- Mümkünse Playwright ile 390×844 demo kitapta: kısa sayfalı bir PDF açıp `goToPage` sonrası `#oPno` metni (yoksa elle deneme adımı yaz).
- Sonunda göster: değişen dosyalar, test sayısı (önce/sonra), `git status`, laptop + telefon deneme adımları. Commit atma, önce plan göster.
