# TASK – 6.6-1a: Avuç ölçümü (dokunma günlüğüne temas boyutu)

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-1. Bu adım yalnız ölçüm; davranış değişmez.

## Goal
iPad'de kalem modundayken avucun (bilek) parmaktan ve kalemden ayırt edilip edilemeyeceğini görmek. `?olcum=1` dokunma günlüğü her dokunuş için temas boyutunu ve sayfanın kayıp kaymadığını göstersin; Deniz iPad'de bir kez deneyip "Kopyala" ile sonucu getirsin.

## Context
- Sorun: kalem modunda bileği önce koyunca sayfa kayıyor (ilk açılışta çizgi de çıkabiliyor).
- Teşhis (`src/kalem/girdi.ts`, `InputRouter.down`): `penSeen` her sayfa açılışında false; kalem görülmeden avuç `ciz` olur. Kalem görüldükten sonra avuç, kalem çizmiyorsa `gezin` olur. `kalemModu.ts` `block` yalnız kalem çizerken touchmove'u iptal eder, yani `yoksay` olsa bile avuç doğal kaydırmayı başlatabilir.
- Düzeltme planı (sonraki adım 6.6-1b): `defter-kalem-var` localStorage, geniş temas = avuç → `yoksay` + touchmove iptal, kalem kalkınca ~300 ms yoksay. Eşik bu ölçümden çıkacak.
- 6.S-1a'da kurulan dokunma günlüğü var: `src/ui/dokunmaOlcum.ts` (olay kaydı), `src/ui/dokunmaOzet.ts` (dokunuş başına satır, saf), `src/ui/olcum.ts` (kutu, Dokunma sekmesi, Kopyala).
- `docs/ai/CURRENT_STATE.md` cihazda güncellenmiş ama commit edilmemiş (Deniz onaylı içerik).

## Relevant Files
- `src/ui/dokunmaOlcum.ts`, `src/ui/dokunmaOzet.ts`, `src/ui/dokunmaOzet.test.ts`
- Okuma: `src/kalem/girdi.ts`, `src/kalem/kalemModu.ts`, `src/ui/okuyucuKaydirma.ts` (değiştirme)

## Requirements
0. **Checkpoint commit (önce):** `git status`'ta yalnız `docs/ai/CURRENT_STATE.md` ve `docs/ai/TASK.md` değişmiş olmalı (başka değişiklik varsa dur, sor). Önce yalnız `docs/ai/CURRENT_STATE.md`'yi ekleyip commit at: `docs: CURRENT_STATE 6.6 sırası (checkpoint)`. Push yok.
1. **Temas boyutu kaydı** (`dokunmaOlcum.ts`): PointerEvent için `width`, `height` (yuvarla, px); TouchEvent için ilgili `Touch`'ın `radiusX`, `radiusY` (varsa, yuvarla) ve `touchType`. `DokunmaOlayi`'na isteğe bağlı alanlar olarak ekle. Mevcut alanlar ve davranış aynen kalır; dinleyiciler pasif kalır.
2. **Kayma kaydı:** her olayda okuyucunun sayfa listesinin (kaydırılan öğe; `kalemModu`'ndaki `host.scroller` ile aynı öğe, seçiciyi sen bul) `scrollTop`/`scrollLeft` değeri `kaydirma: [x, y]` olarak kaydedilsin (okuyucu kapalıysa yok).
3. **Özet satırı** (`dokunmaOzet.ts`, saf): dokunuş satırına ekle: `boyut maks WxH` (pointer) ve/veya `r maks RXxRY` (touch), ilk olaydaki boyut `ilk WxH`, ve `kaydı Δy px` (dokunuş başı → sonu liste kayması; 0 ise `kaymadı`). Örnek: `parmak (touch/direct) | div.o-page | ilk 22x22 maks 58x61 | r maks 29x30 | down→up 640 ms | kaydı 84 px | …`.
4. **Kalem yakınlığı:** satıra bir önceki/sonraki kalem dokunuşuyla zaman farkı: `kalem ±120 ms` (2 sn içinde yoksa yazma). Avuç ve kalemin sırası buradan görülecek.
5. **Testler:** `dokunmaOzet.test.ts`'e yeni alanlar için 3–4 test (boyutlu touch, boyutsuz eski olay geriye uyumlu, kaydı/kaymadı, kalem ± ms).

## Do Not
- `src/kalem/girdi.ts`, `src/kalem/kalemModu.ts`, `src/ui/okuyucuKaydirma.ts` davranışını değiştirme (bu adım yalnız ölçüm).
- Ölçüm yalnız `?olcum=1` ile yüklenir; normal kullanımda hiçbir şey değişmez.
- `api/`, Drive adları, JSON anahtarları, `src/dil/*` (ölçüm kutusu geliştirici aracı, Türkçe kalabilir).
- Yeni kütüphane, ilgisiz refactor yok. `git checkout` (dal değiştirme), `reset`, `stash`, force push yok. main'e ve faz-6'ya push yok.

## Definition of Done
- Checkpoint commit atıldı.
- `?olcum=1` ile Dokunma sekmesi her dokunuşta boyut, kayma ve kalem yakınlığını gösteriyor; Kopyala bunları içeriyor.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil` hatasız.
- İş commit'i: `6.6-1a: dokunma günlüğüne temas boyutu ve kayma` (TASK.md ile birlikte). Push yok.
- `docs/ai/CURRENT_STATE.md`: "Şimdi: 6.6-1a ölçüm hazır, Deniz iPad denemesi bekleniyor".

## Verification
- `npm test -- dokunmaOzet` geçer; tam `npm test` geçer.
- Laptopta `http://localhost:5173/?olcum=1` → bir kitap aç → fareyle sayfaya tıkla/sürükle → Dokunma sekmesinde satır `boyut`/`kaydı` alanlarıyla görünür.
- Son mesajda: değişen dosyalar, test sayısı, `git status`, `git log --oneline -3`.

## Deniz'in iPad denemesi (Codex bitirdikten sonra; Claude ayrıca verecek)
Önizleme ya da yerel ağ adresi `?olcum=1` → kitap → kalem modu → Dokunma sekmesi Sıfırla →
1) bileği koy, 1 sn bekle, sonra yaz · 2) yazarken bileği kaldırıp tekrar koy · 3) tek parmakla kaydır · 4) iki parmakla kaydır · 5) kalemle tek dokunuş → Kopyala → sohbete yapıştır.
