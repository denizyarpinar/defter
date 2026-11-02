# TASK – 6.6-3c: Okuyucu konu yolunu bulamazsa Konu-NN'yi kitabın ünitelerinde arasın

Onaylı plan (keşif 6.6-3c-0, Deniz onayı 2 Kasım 2026). Başlangıç: main = bd3f606 (6.6-3b canlı, KONU_TASI=false). D31: Konu-NN klasör adı kitapta tek ve taşımada değişmez.

## Goal
Okuyucu bir konunun kitap.json yolunu Drive'da bulamazsa (başka sekme/cihazda eski kitap.json; toparlama-Vazgeç sonrası json eski yolda, klasör yeni ünitede) "Konu klasörü bulunamadı" demeden önce konuyu bulsun ve açsın:
(a) kitap.json Drive'dan tazelenir; aynı Konu-NN adı başka yolda tekse o yol kullanılır (Drive'a yazma yok, bildirim yok).
(b) olmazsa tek sorgu: `name = 'Konu-NN-…'` ve ebeveyn ∈ kitabın ünite klasörleri; tam 1 sonuç → bulundu. Gerekirse kitap.json yolu düzeltilir.

## Kararlar
- K1 Yeniden kullanılan: `yenidenYukle` deseni (parseBook) tazeleme için; json düzeltmesi `konuTasiYaz` toparla yolu (klasör zaten hedefte → Drive'da taşıma yok, yalnız `jsonDegistir` + `tasiYerel`), kuyruk üzerinden.
- K2 `konuBul` bir açılışta en fazla bir kez (döngü yok). Yeniden açmadan önce `topicCache` ve resolver'daki null kayıtları temizlenir. Ağ hatasında bugünkü davranış sürer ve null önbelleğe girmez.
- K3 json düzeltmesi yalnız `konuTasiAcik()` iken. Kilitliyken ya da eski ünite klasörü Drive'da yoksa json yazılmaz; yol yalnız bellekte değişir, konu açılır, hata gösterilmez.
- K4 Toast yalnız json düzeltildiyse: "Konu başka ünitede bulundu; içindekiler düzeltildi." / "Topic found in another unit; contents updated." (a) yolunda bildirim yok.
- K5 `topicFolderId` (foto/dosya ekleme) düzeltilmiş yolu kullanır; testi var.
- K6 Kilit `KONU_ARA = true`; `?konuAra=0` aramayı tamamen kapatır. KONU_TASI false kalır.

## Do Not
- Drive'da taşıma, ad değiştirme, delete yok. Yeni Drive dosyası yok.
- checkout/reset/stash/push yok; commit yok (Deniz denedikten sonra).
- DECISIONS/AGENTS değişmez.

## Definition of Done
- Eski yolla açılan konu açılır (iki sekme senaryosu, toparla-Vazgeç senaryosu).
- Testler: konuAra saf işlevler + bayrak; konuBul akışı (tazele yeterli, sorgu tek/0/çok, ağ hatası, kilitliyken yazma yok, eski ünite yok → yazma yok, json zaten doğru → yazma yok); okuyucu konuBul tek çağrı; topicFolderId düzeltilmiş yol.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, dil kontrolü.
- Laptop: `http://localhost:5173/?kurulum=1&olcum=1&konuTasi=1` – iki sekme; toparla-Vazgeç.
