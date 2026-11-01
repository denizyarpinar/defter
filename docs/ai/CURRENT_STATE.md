# CURRENT_STATE

Son güncelleyen: Codex, 1 Kasım 2026 · 6.6-5b commit/önizleme yayını

## Git ve yayın
- Canlı uygulama commit'i: `71c02e75e5c54b32ba74438973de11f730ac505f` (6.6-0), Deniz onayıyla main'e push edildi. Production Ready: https://defter-a2hxqmad3-deniz-b571.vercel.app; https://defter-jade.vercel.app HTTP 200 önceki yayında doğrulandı.
- Önceki doğrulanan faz-6: `0d991fe` (6.6-5a), Preview Ready: https://defter-dp4ltbsey-deniz-b571.vercel.app. Deniz 6.6-5b için commit, yalnız faz-6 push ve Ready sonrası https://defter-git-faz-6-deniz-b571.vercel.app alias bağlamasını onayladı; main'e push yok.

## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K (çok kullanıcı + kurulum), 6.K7–K8 (gizlilik, README, ikinci hesap testi).
- 6.4 el yazısı: okuma (api/oku), .ocr.json, arama, harf atlası, Temiz yazı, elle düzeltme. Canlıda.
- 6.S sayfa işleri: kalem dokunma, kitap modunda sığdırma, özete ek dosya, araya boş sayfa, deftere yapıştır, sayfa silme + Geri al. Canlıda.
- 6.5 iki dil (EN varsayılan + TR) TAMAMI canlıda: 6.5-1…4b; EN ≤599 px kısa sekmeler Original / Summary / Practice / Homework. 1808 test, `npm run dil` 0, `npm run dil:ekran` 160 ekran beklenmeyen taşma 0. Deniz iPad + laptop denemesi geçti (1 Kasım).
- 6.EK özet ekleri (ozet-ek*.pdf bandı, ek salt okunur). Canlıda.
- 1 Kasım: ortak AI bağlam dosyaları (AGENTS.md, docs/ai/*); eski CLAUDE.md ve DURUM.md `docs/ai/arsiv/` altında.

## Şimdi
- 6.6-0 canlıda: kısa PDF sayfalarında dil dönüşü/sürgü sayacı kaymıyor; 1844 test ve 390×844 demo (12 / 30, üç dil dönüşü) geçti. Gerçek cihaz henüz denenmedi.
- 6.6-1a/1b canlıda: avuç 100/120 px, kalem kalkınca 300 ms koruma; iki parmak ZoomController üzerinden (8 px pan, pinch 12 px + %8). Kitapta swipe açık, kenar tap kapalı. Laptop denemeleri geçti; gerçek iPad bekliyor.
- 6.6-5a önizlemede: yalnız `?olcum=1` ile en fazla 80 anonim olay, reload sayacı, giriş kartında erişilebilir Kopyala/Temizle. Önceki doğrulama: 1853 test + dört ekran boyutu.
- 6.6-5b yerelde hazır: `defter-oturum` yalnız sekmenin sessionStorage'ında; geçerli token açılışta popup/giriş kartı/hoş geldin bildirimi olmadan geri yüklenir. Çıkış, GIS reddi/hatası, dropToken ve geçerlilik kontrolündeki bozuk/süresi dolmuş kayıt silinir. Token localStorage'a yazılmaz.
- Doğrulama: 1897/1897 test (44 yeni), typecheck/build geçti, dil 0. Derlenmiş uygulamada laptop + iPad benzetimi: kullanıcı/Drive diliyle yenilemede tek giriş, giriş kartı boyanmıyor; çıkış→yenile, bağımsız yeni sekme, demo ve `?tokenSakla=0` geçti. GIS/Drive sahte; gerçek Google/iPad henüz denenmedi.
- Geri alma: auth.ts `TOKEN_SAKLA=false` ya da `?tokenSakla=0`; depoya dokunmaz. Drive dili kararı, geçiş tablosu ve 401 yeniden denemesi korunur. Deniz onayıyla D02/D20, README (EN), privacy (EN/TR), PROJECT/ARCHITECTURE güncellendi.
- İş bölümü: plan/TASK.md Claude, net kod Codex, kontrol kodu yazmayan araç. Aynı anda tek araç; araç değişmeden checkpoint commit.

## Sıradaki
1. 6.6-5b önizleme Ready/alias kontrolünden sonra gerçek laptop/iPad'de iki dil senaryosu + çıkış→yenile denenir. 6.6-6 ayrı görev; bu adımda sessiz yenileme yok.
2. 6.6-2: birden çok özet.
3. Faz 7: quiz/özet (LLM API).

## Açık riskler (ayrıntı: arsiv/CLAUDE_eski.md "Sonra bakılabilir")
- ozet.pdf her fotoğraf/kalem kaydında baştan yükleniyor (22 MB ≈ 26 sn); çözüm Faz 5 kararını değiştirir.
- İki sekme/iki cihaz aynı dosyada: bekleyen kayıtlar birbirini görmüyor, çift dosya olabilir.
- Oda yüklemesi 15 sn sınırı; yavaş ağda prosedürel odaya düşüyor.
- Testlerde ara sıra 1 rastgele hata (kaynağı bilinmiyor).
- Ürün hedefi "ilk girişte otomatik kurulum"; kod hâlâ kurulum düğmesi bekliyor (karar değişikliği gerekir).
- Laptopta 600–~760 px arası genişlikte tam sekme adları sığmıyor, şerit kaydırılıyor (4b'de beklenen sayıldı).

## Yarım kalan iş
- Kod ve yerel doğrulama tamam; Deniz commit/önizleme yayınını onayladı. Yayın adımı: yalnız faz-6 push, Vercel Ready ve alias eşleşmesini doğrulama. Sonraki adım gerçek cihazda iki dil senaryosu + çıkış→yenile; main'e push yok.
