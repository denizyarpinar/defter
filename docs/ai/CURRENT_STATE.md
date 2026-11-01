# CURRENT_STATE

Son güncelleyen: Claude (planlayıcı), 1 Kasım 2026 · docs/ai kurulumu

## Git ve yayın
- Canlı: https://defter-jade.vercel.app = origin/main `bc23c8b` (6.EK-2 + DURUM kaydı, 27 Ekim). Production Ready kontrolü kayıtlı değil [doğrulanmadı].
- Yerel main = `f681b5a` (docs/ai kurulumu), origin/main'den 1 commit önde, push yok.
- faz-6 = `a6566c6` (6.EK-2 kodu), main'in 2 commit gerisinde. Yeni önizleme gerekirse önce: `git fetch . main:faz-6`.
- Önizleme adresi: https://defter-git-faz-6-deniz-b571.vercel.app (alias çoğu zaman elle bağlanır).

## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K (çok kullanıcı + kurulum), 6.K7–K8 (gizlilik, README, ikinci hesap testi).
- 6.4 el yazısı: okuma (api/oku), .ocr.json, arama, harf atlası, Temiz yazı, elle düzeltme. Canlıda.
- 6.S sayfa işleri: kalem dokunma, kitap modunda sığdırma, özete ek dosya, araya boş sayfa, deftere yapıştır, sayfa silme + Geri al. Canlıda.
- 6.5 iki dil: 6.5-1, 2a, 2b, 3, 4a bitti (kalan Türkçe dize 0, `npm run dil` hata verir). Canlıda.
- 6.EK özet ekleri (ozet-ek*.pdf bandı, ek salt okunur). Canlıda.
- 1 Kasım: ortak AI bağlam dosyaları (AGENTS.md, docs/ai/*); eski CLAUDE.md ve DURUM.md `docs/ai/arsiv/` altında.

## Şimdi
- Yeni iş bölümü: plan/TASK.md Claude, net kod Codex, kontrol kodu yazmayan araç. Aynı anda tek araç; araç değişmeden checkpoint commit.

## Sıradaki
1. 6.5-4b görünüm: dar ekranda (≤390 px) EN kısa sekme adları (tam ad ipucunda), eski taşmalar (#spread, #oSpread, #oZoom, içindekiler simgeleri, .o-title), EN/TR tam ekran turu, README iki dil. Prompt 27 Ekim'de verildi, kodu yok; TASK.md olarak yeniden yazılacak.
2. 6.5-5: faz-6 önizleme + main (Deniz onayıyla).
3. Faz 7: quiz/özet (LLM API).

## Açık riskler (ayrıntı: arsiv/CLAUDE_eski.md "Sonra bakılabilir")
- ozet.pdf her fotoğraf/kalem kaydında baştan yükleniyor (22 MB ≈ 26 sn); çözüm Faz 5 kararını değiştirir.
- İki sekme/iki cihaz aynı dosyada: bekleyen kayıtlar birbirini görmüyor, çift dosya olabilir.
- Oda yüklemesi 15 sn sınırı; yavaş ağda prosedürel odaya düşüyor.
- Testlerde ara sıra 1 rastgele hata (kaynağı bilinmiyor).
- Ürün hedefi "ilk girişte otomatik kurulum"; kod hâlâ kurulum düğmesi bekliyor (karar değişikliği gerekir).

## Yarım kalan iş
- Yok.
