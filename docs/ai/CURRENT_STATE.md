# CURRENT_STATE

Son güncelleyen: Codex, 1 Kasım 2026 · 6.5-4b görünüm ve ekran kontrolleri

## Git ve yayın
- Canlı: https://defter-jade.vercel.app = origin/main `bc23c8b` (6.EK-2 + DURUM kaydı, 27 Ekim). Production Ready kontrolü kayıtlı değil [doğrulanmadı].
- Yerel main: docs/ai kurulumu + Claude durum/karar kaydı + bu 6.5-4b checkpoint'i; push yok.
- faz-6 = `a6566c6` (6.EK-2 kodu); 6.5-4b önizlemesi yok. Önizleme hazırlığı ayrı adımda yapılacak.
- Önizleme adresi: https://defter-git-faz-6-deniz-b571.vercel.app (alias çoğu zaman elle bağlanır).

## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K (çok kullanıcı + kurulum), 6.K7–K8 (gizlilik, README, ikinci hesap testi).
- 6.4 el yazısı: okuma (api/oku), .ocr.json, arama, harf atlası, Temiz yazı, elle düzeltme. Canlıda.
- 6.S sayfa işleri: kalem dokunma, kitap modunda sığdırma, özete ek dosya, araya boş sayfa, deftere yapıştır, sayfa silme + Geri al. Canlıda.
- 6.5 iki dil: 6.5-1, 2a, 2b, 3, 4a bitti (kalan Türkçe dize 0, `npm run dil` hata verir). Canlıda.
- 6.EK özet ekleri (ozet-ek*.pdf bandı, ek salt okunur). Canlıda.
- 1 Kasım: ortak AI bağlam dosyaları (AGENTS.md, docs/ai/*); eski CLAUDE.md ve DURUM.md `docs/ai/arsiv/` altında.
- 6.5-4b bitti: EN ≤599 px Original / Summary / Practice / Homework; iki span + CSS, tam ad title/aria-label; TR ve geniş ekranlar aynı. README Languages eklendi.
- Kontrol: 1808/1808 test, typecheck/build/dil geçti; EN/TR × 390/820/1180/1280 tam tur 160 ekran, beklenmeyen taşma 0. Sekme/yeniden boyutlandırma, arama (22/22 × 2), dosya/çöp, özet eki (160/160), dikey PDF dil dönüşü geçti.
- Görüntüler + gerekçeli rapor: `C:/Users/yarpi/iCloudDrive/uni_plan_claude_code/Claude outputs/dil-6.5-4b/` (önce: `once/`, sonra: kök; `rapor.json`). Gerçek iPad/Drive/AI testi yapılmadı.

## Şimdi
- Yeni iş bölümü: plan/TASK.md Claude, net kod Codex, kontrol kodu yazmayan araç. Aynı anda tek araç; araç değişmeden checkpoint commit.

## Sıradaki
1. 6.5-5: faz-6 önizleme + Deniz'in gerçek iPad/laptop EN/TR denemesi + main onayı. Bu görev push/yayın onayı değildir.
2. Faz 7: quiz/özet (LLM API).

## Açık riskler (ayrıntı: arsiv/CLAUDE_eski.md "Sonra bakılabilir")
- ozet.pdf her fotoğraf/kalem kaydında baştan yükleniyor (22 MB ≈ 26 sn); çözüm Faz 5 kararını değiştirir.
- İki sekme/iki cihaz aynı dosyada: bekleyen kayıtlar birbirini görmüyor, çift dosya olabilir.
- Oda yüklemesi 15 sn sınırı; yavaş ağda prosedürel odaya düşüyor.
- Testlerde ara sıra 1 rastgele hata (kaynağı bilinmiyor).
- Ürün hedefi "ilk girişte otomatik kurulum"; kod hâlâ kurulum düğmesi bekliyor (karar değişikliği gerekir).
- Kontrolde telefonda birden çok yatay özet sayfası görünürken dil dönüşü sayacı 12→13 oldu; davranış değiştirilmedi, ayrı inceleme gerekir. Kesin sayfa dönüşü dikey Orijinal PDF'de doğrulandı.

## Yarım kalan iş
- Yok.
