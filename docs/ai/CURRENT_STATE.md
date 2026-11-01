# CURRENT_STATE

Son güncelleyen: Codex, 1 Kasım 2026 · 6.6-1 canlıya çıkış

## Git ve yayın
- Canlı uygulama commit'i: `4d744fb` (6.6-1b), Deniz onayıyla main'e push edildi. Production Ready: https://defter-1xzn7lbue-deniz-b571.vercel.app; https://defter-jade.vercel.app HTTP 200 doğrulandı. Ardından bu durum belgesi main'e commit/push edilir.
- faz-6 = `4d744fb`. Önizleme Ready: https://defter-lpsyn1q0c-deniz-b571.vercel.app; alias https://defter-git-faz-6-deniz-b571.vercel.app bu dağıtıma bağlı; Preview koruması açık.

## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K (çok kullanıcı + kurulum), 6.K7–K8 (gizlilik, README, ikinci hesap testi).
- 6.4 el yazısı: okuma (api/oku), .ocr.json, arama, harf atlası, Temiz yazı, elle düzeltme. Canlıda.
- 6.S sayfa işleri: kalem dokunma, kitap modunda sığdırma, özete ek dosya, araya boş sayfa, deftere yapıştır, sayfa silme + Geri al. Canlıda.
- 6.5 iki dil (EN varsayılan + TR) TAMAMI canlıda: 6.5-1…4b; EN ≤599 px kısa sekmeler Original / Summary / Practice / Homework. 1808 test, `npm run dil` 0, `npm run dil:ekran` 160 ekran beklenmeyen taşma 0. Deniz iPad + laptop denemesi geçti (1 Kasım).
- 6.EK özet ekleri (ozet-ek*.pdf bandı, ek salt okunur). Canlıda.
- 1 Kasım: ortak AI bağlam dosyaları (AGENTS.md, docs/ai/*); eski CLAUDE.md ve DURUM.md `docs/ai/arsiv/` altında.

## Şimdi
- 6.6-1a ve 6.6-1b canlıda. Avuç 100/120 px; kalem hatırlanır, kalkınca yeni temasa 300 ms koruma. Ölçüm günlüğü aynı.
- PDF: kalem biliniyorsa iki parmağı tek merkez (ZoomController) işler; kaydırma 8 px, pinch en az 12 px ve %8. Saf karar testli; parmak çizen eski yol korunur. Kitapta swipe açık, kenar tap kapalı.
- Doğrulama: 24 hedef / toplam 1830 test; typecheck, build, dil 0. Laptop fare, hatırlama, avuç iptali, 30 px pan / %120 pinch ve kalem çizgisinin korunması geçti; gerçek iPad henüz denenmedi.
- İş bölümü: plan/TASK.md Claude, net kod Codex, kontrol kodu yazmayan araç. Aynı anda tek araç; araç değişmeden checkpoint commit.

## Sıradaki
1. 6.6-0 sayaç 12→13: telefonda birden çok yatay özet sayfası görünürken dil dönüşünde sayfa sayacı kayıyor; ayrı görev.
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
