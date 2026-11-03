# TASK – EK-3b: ek bandı her özette + "Ekleniyor…" takılması

Başlangıç: main = 100efda (EK-3 canlıda). Deniz'in gerçek Drive denemesi, 3 Kasım 2026 (Mathe 1 > Konu-05-Deneme).

## Goal
EK-3 canlıda çalışıyor (Ekle → ozet.pdf, Ayrı → Ozetler/ayri.pdf doğrulandı). İki sorun kaldı:
1. **Bant yalnız ilk özette çıkıyor.** Okuyucu seçicide `Ozetler/<ad>.pdf` (ikinci, üçüncü özet) açıkken bant hiç çıkmıyor. Deniz yeni eki o açık özete de eklemek isteyebilir.
2. **"Ekle" (özet yokken) sonrası bant "Ekleniyor…"da kalıyor.** `ozet.pdf` Drive'da doğru oluşuyor ama okuyucu yenilenmiyor, bant sonsuza kadar "Ekleniyor…" gösteriyor; F5 düzeltiyor. ("Ayrı" ve "Aynı" sonrası takılma görülmedi.)

## Context
- `src/okuma/Okuyucu.ts` `ekBandi()`: `gecerli()` → `t.fileIndex === 0` ve ad `ozet|brifing|sorular.pdf` (ya da EK-3'ün salt okunur ek durumu). Bu yüzden Ozetler dosyalarında bant yok.
- `ozetHedefi(m, odakDosyaId, secilenId)` (dosyaPanelDurumu.ts): bugün yalnız `brifing+sorular` seçimini çözüyor; `gercekOzet(m)` Ozetler dosyalarını da içeriyor.
- `ozetIsaretleri(ozet, hedef)`: tüm özet dosyalarının /DefterEkId işaretlerini topluyor (iyi: bir ek hangi özete eklendiyse eklenmiş sayılır).
- `ekEkle(...)` → `konuyaDosyaEkle` → `afterFileAdded(t, hedef, r)`; EK-3'te özet yokken hedef `'ozet'`.
- `ilkSayfaCizildi()` her liste (session) için bir kez.

## Kararlar (Claude)
- K1 Bant, okuyucuda **hangi gerçek özet dosyası açıksa** onda çıkar (`gercekOzet(t.materials)` içindeki herhangi bir dosya; `fileIndex` şartı kalkar). Ek dosyasının kendisi (salt okunur) açıkken EK-3 davranışı aynen.
- K2 "Aynı özete ekle" hedefi = **ekranda açık özet dosyası** (`t.materials.ozet[t.fileIndex]`, ya da odak sayfanın `dosyaId`'si). Bant metni hedefi gösterir: TR `Yeni ek var: {ad} · açık özet: {hedef}` / EN `New addition: {ad} · open summary: {hedef}` (yalnız konuda 2+ özet varsa hedef kısmı gösterilir; tek özette bugünkü metin).
- K3 Özet sekmesinde başka özet dosyasına geçilince (seçici) bant yeniden değerlendirilir (yeni dosyanın ilk sayfası çizilince; `ekBakilanOturum` dosya değişiminde de sıfırlanır). Aynı ek için "Sonra" denmişse oturum boyunca gizli kalır (bugünkü gibi).
- K4 "Eklendi mi?" kuralı değişmez: işaretler tüm özetlerden + appProperties.defterIslem (EK-3 K2).
- K5 Takılma: önce `?ekSahte` ile özet yok → Ekle akışında kırmızı test yaz (bant `ekleniyor` kalıyor mu, `afterFileAdded` ne bekliyor). Nedeni bul (olası: okuyucu ek dosyasından yeni ozet.pdf'e geçerken `topic`/`session` değişiyor, `ekDurum` temizlenmiyor ya da `afterFileAdded` 'ozet' hedefi için konu yenilemesini beklerken bitmiyor). Düzeltme: ekleme başarılı olunca bant her durumda kapanır/sıradakine geçer; okuyucu yeni `ozet.pdf`'i açar.
- K6 Kilit: EK-3'ün `?ekAyri=0` geri dönüşü bu iki değişikliği de kapatır.

## Relevant Files
- src/okuma/Okuyucu.ts (ek bandı bölümü, afterFileAdded çağrısı)
- src/defter/dosyaPanelDurumu.ts (gerekirse ozetHedefi'ne açık dosya)
- src/defter/ozetEkBandi.ts (+ test), src/okuma/ekSahte.ts
- src/dil/tr.ts, src/dil/en.ts

## Requirements
1. K1–K6.
2. Testler (önce kırmızı): Ozetler dosyası açıkken bant kararı `goster`; hedef = açık dosya; ozet.pdf'e eklenmiş ek Ozetler dosyasında da gizli; özet yok → Ekle → bant `ekleniyor`da kalmaz.
3. `npm run dil` 0.

## Do Not
- "Dosya ekle" paneli, `{ ozetSonu }` yazma yolu, /DefterEkId biçimi, Drive adları değişmez; ek dosyalarına yazılmaz.
- `git checkout`/`reset`/`stash`, push yok.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Playwright `?ekSahte` 1180×820 + 390×844 × EN/TR: ikinci özet açıkken bant, hedef metni taşmıyor.
- Sonunda göster: neden (takılma), değişen dosyalar, test sayısı, git status, deneme adımları. Commit: "EK-3b: …".
