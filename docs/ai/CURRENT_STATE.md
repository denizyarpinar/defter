# CURRENT_STATE

Son güncelleyen: Codex, 1 Kasım 2026 · 6.6-1a avuç ölçümü

## Git ve yayın
- Canlı: https://defter-jade.vercel.app = origin/main `d65bce7` (6.5-4b); önceki doğrulama: 1 Kasım 14:27, Production Ready, HTTP 200. Yerel main'de 6.6-1a commit'leri var; pull/push yapılmadı.
- faz-6 = `d65bce7`. Önizleme: https://defter-git-faz-6-deniz-b571.vercel.app (alias elle bağlandı; Preview koruması açık, curl için yetki gerekir).

## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K (çok kullanıcı + kurulum), 6.K7–K8 (gizlilik, README, ikinci hesap testi).
- 6.4 el yazısı: okuma (api/oku), .ocr.json, arama, harf atlası, Temiz yazı, elle düzeltme. Canlıda.
- 6.S sayfa işleri: kalem dokunma, kitap modunda sığdırma, özete ek dosya, araya boş sayfa, deftere yapıştır, sayfa silme + Geri al. Canlıda.
- 6.5 iki dil (EN varsayılan + TR) TAMAMI canlıda: 6.5-1…4b; EN ≤599 px kısa sekmeler Original / Summary / Practice / Homework. 1808 test, `npm run dil` 0, `npm run dil:ekran` 160 ekran beklenmeyen taşma 0. Deniz iPad + laptop denemesi geçti (1 Kasım).
- 6.EK özet ekleri (ozet-ek*.pdf bandı, ek salt okunur). Canlıda.
- 1 Kasım: ortak AI bağlam dosyaları (AGENTS.md, docs/ai/*); eski CLAUDE.md ve DURUM.md `docs/ai/arsiv/` altında.

## Şimdi
- 6.6-1a ölçüm hazır, Deniz iPad denemesi bekleniyor. Yalnız ?olcum=1: temas boyutu, #oScroll kayması ve kalem yakınlığı; giriş davranışı değişmedi.
- Doğrulama: 16 ölçüm testi / toplam 1812 test; typecheck, build, dil 0; laptop PDF/fare/Kopyala ve changedTouches kontrolü geçti.
- İş bölümü: plan/TASK.md Claude, net kod Codex, kontrol kodu yazmayan araç. Aynı anda tek araç; araç değişmeden checkpoint commit.

## Sıradaki
0. Deniz'in iPad ölçümü → sonuçlara göre 6.6-1b avuç engelleme eşiği ve ayrı görev.
1. Küçük iş: telefonda birden çok yatay özet sayfası görünürken dil dönüşünde sayfa sayacı 12→13 kayıyor (Deniz kararı: canlıdan sonra ayrı iş).
2. Faz 7: quiz/özet (LLM API).

## Açık riskler (ayrıntı: arsiv/CLAUDE_eski.md "Sonra bakılabilir")
- ozet.pdf her fotoğraf/kalem kaydında baştan yükleniyor (22 MB ≈ 26 sn); çözüm Faz 5 kararını değiştirir.
- İki sekme/iki cihaz aynı dosyada: bekleyen kayıtlar birbirini görmüyor, çift dosya olabilir.
- Oda yüklemesi 15 sn sınırı; yavaş ağda prosedürel odaya düşüyor.
- Testlerde ara sıra 1 rastgele hata (kaynağı bilinmiyor).
- Ürün hedefi "ilk girişte otomatik kurulum"; kod hâlâ kurulum düğmesi bekliyor (karar değişikliği gerekir).
- Laptopta 600–~760 px arası genişlikte tam sekme adları sığmıyor, şerit kaydırılıyor (4b'de beklenen sayıldı).

## Yarım kalan iş
- Yok.
