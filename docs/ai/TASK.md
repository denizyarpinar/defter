# TASK – 6.6-1b: Avuç sayfayı kaydırmasın, parmaklar GoodNotes gibi

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-1, iPad ölçümü (6.6-1a, bc7f46c). Deniz kararı S1 = A (1 Kasım 17:45): kalem modunda tek parmak kaydırır, avuç yok sayılır.

## Goal
Kalem modunda bilek/avuç ekrana değince sayfa kıpırdamasın ve çizgi çıkmasın. Kalem varken parmaklar sayfada gezinsin: PDF modunda tek ve iki parmak listeyi kaydırır, kitap modunda tek parmakla kaydırınca sayfa çevrilir.

## Context
- iPad ölçümü (PointerEvent `width`, iOS basamaklı değerler, px):
  - Kalem: 1. Tek parmak: ilk 63. İki parmakla kaydırmada parmaklar ilk 84, en fazla 104.
  - Avuç: ilk 104–272, en fazla 272. iOS büyük avucun çoğunu 8–33 ms içinde kendisi `pointercancel` ediyor, ama bir denemede avuç + gesture sayfayı 24 px kaydırdı.
- PDF modunda tek parmak bugün de kaydırıyor (93 / 244 px). İki parmak kaydırmıyor, yalnız yakınlaştırıyor. Neden: `Okuyucu.ts` `fingerPan: () => mode === 'pdf' && !pen.penSeen`, kalem görülünce iki parmak kaydırma kapanıyor, `sayfaZoom` ise ≥2 parmak touchmove'u iptal ediyor.
- Kitap modunda kalem modu açıkken `tap` ve `swipe` kapalı (`if (penOn) return false` / `if (!penOn)`). Bu yüzden tek parmak hiçbir şey yapmıyor.
- `InputRouter` (`src/kalem/girdi.ts`): `penSeen` her sayfa açılışında false olduğundan, kalemden önce gelen ilk avuç `ciz` sayılıyor. Kalem görüldükten sonra kalem çizmiyorsa avuç `gezin` sayılıyor ve doğal kaydırma başlayabiliyor.

## Teknik kararlar (planlayıcı)
- D1 Avuç eşiği: kalem modunda bir dokunuş `width ≥ 100` ile başlarsa ya da süresince `width ≥ 120`'ye çıkarsa avuçtur (Touch'ta `radiusX ≥ 50` / `≥ 60`). Neden: ölçümde parmak hiç 100 ile başlamadı, avuç en az 104 ile başladı. Sabitler `girdi.ts`'te isimli (`AVUC_ILK_PX = 100`, `AVUC_MAKS_PX = 120`).
- D2 Avuç = `yoksay`. O dokunuşun `touchstart` / `touchmove`'u iptal edilir (`dokunmaIptal('kalemModu', e)` + `preventDefault`, touch identifier ile izlenir), kalkana kadar yok sayılır. Çizilen kalem çizgisi iptal edilmez. Ortasında avuca dönüşen dokunuş: o andan sonra iptal edilir, olan kayma geri alınmaz.
- D3 Kalem cihazda hatırlanır: kalem ilk görüldüğünde `localStorage['defter-kalem-var'] = '1'`, `InputRouter` açılışta buradan başlar (try/catch, okunamazsa false). Neden: kalemden önce gelen ilk avuç da doğru yoksayılsın. Kalemi hiç görmemiş cihaz (telefon, laptop) bugünkü gibi davranır.
- D4 Kalem kalktıktan sonraki `KALEM_SONRASI_MS = 300` içinde başlayan dokunuş `yoksay` olur. Neden: yazarken bilek kaldırılıp yeniden konuyor.
- D5 PDF modu, kalem var: iki parmak listeyi kaydırır (`fingerPan` kalem görülmüş olsa da `mode === 'pdf'`). Parmaklar arası mesafe belirgin değişirse yakınlaştırma bugünkü gibi çalışır. ZoomController ile çakışmayı sen kontrol et; ikisi aynı anda çalışıyorsa kaydırma eşiğini ölç ve planda yaz.
- D6 Kitap modu, kalem modu açık, kalem var: tek parmakla yatay kaydırma (`swipe`) sayfayı çevirir. Kenara dokunma (`tap`) kalem modunda yine kapalı kalır. Avuç (D1) ve kalem sonrası 300 ms (D4) çevirmez. Neden: kaydırma bilinçli bir hareket, dokunma ise avuçla kazara olabilir.

## Relevant Files
- `src/kalem/girdi.ts`, `src/kalem/girdi.test.ts`
- `src/kalem/kalemModu.ts` (`down`, `block`, `ignores`)
- `src/okuma/Okuyucu.ts` (yalnız `fingerPan` ve ZoomController `swipe` / `penIgnores` bağlantısı)
- ZoomController dosyası (`src/okuma/` içinde, sen bul): yalnız swipe'ın avuç / kalem kontrolü için gerekiyorsa
- Okuma: `src/ui/okuyucuKaydirma.ts`, `src/ui/sayfaZoom.ts` (değiştirmeden önce sor)

## Requirements
1. `InputRouter.down`'a temas boyutu (`width`) ve zaman eklenir. Kurallar D1, D3, D4. Kalemsiz cihazda bugünkü davranış aynen kalır: fare ve tek parmak çizer, ikinci parmak iptal eder. Saf kalır, DOM yok, `localStorage` dışarıdan verilir (test edilebilir).
2. Avuç dokunuşunun touch olayları D2'ye göre iptal edilir (`kalemModu` `block` içinde, touch identifier ↔ pointerId eşleşmesi ya da `radiusX` ile). `pointermove`'da boyut büyürse avuca dönüşür.
3. D5 ve D6 uygulanır. Kalem modu kapalıyken hiçbir şey değişmez.
4. Testler: `girdi.test.ts`'e en az şunlar: avuç ilk dokunuşta (kalem hiç görülmemiş + localStorage'da var) yoksay; 63 px parmak gezin; 104 px ile başlayan yoksay; 63→130 büyüyen avuca döner; kalem kalktıktan 200 ms sonra yoksay, 400 ms sonra gezin; kalemsiz cihazda eski 6 test aynen geçer. Swipe kararı saf bir fonksiyondaysa onun testi de.
5. `?olcum=1` dokunma günlüğü aynen kalır. Satıra rota da eklenebiliyorsa ekle (`rota yoksay/gezin/ciz`), zor ise atla.

## Do Not
- `sayfaZoom.ts`'in tarayıcı zoom engellemesini gevşetme. `okuyucuKaydirma.ts`'in 6.S-1b dokunma payını bozma.
- Kalem modu kapalıyken davranış, fare, klavye ve laptop değişmez.
- `api/`, Drive adları, JSON anahtarları, `src/dil` (yeni metin yok; gerekirse tr+en ve `npm run dil`).
- Yeni kütüphane yok, ilgisiz refactor yok. `git checkout` (dal değiştirme), `reset`, `stash`, force push yok. main'e push yok. faz-6'ya push yalnız Deniz isteyince.

## Definition of Done
- iPad, kalem modu, PDF: bilek önce, sonra yaz → sayfa kıpırdamaz, çizgi çıkmaz. Tek parmak ve iki parmak kaydırır, iki parmak sıkıştırınca yakınlaşır.
- iPad, kalem modu, kitap: tek parmakla yatay kaydırınca sayfa çevrilir. Bilek koyunca çevrilmez.
- Sayfa yenilendikten sonra da ilk bilek yoksayılır (D3).
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil` hatasız.
- Commit: `6.6-1b: avuç yok sayılır, kalem modunda parmakla gezinme` (TASK.md ile birlikte). Push yok.
- `docs/ai/CURRENT_STATE.md`: 6.6-1b kodda bitti, iPad denemesi bekleniyor.

## Verification
- `npm test -- girdi` ve tam `npm test`.
- Laptop `http://localhost:5173/?olcum=1`: kalem modu kapalı/açık fareyle çizim aynen çalışır.
- Son mesajda: önce plan (D5 ile ZoomController çakışması ne çıktı), sonra değişen dosyalar, test sayısı, `git status`, `git log --oneline -3`, iPad deneme adımları.
