# CURRENT_STATE

Son güncelleyen: Codex, 3 Kasım 2026 · EK-3b yerel düzeltme; push yok
## Git ve yayın
- main = production https://mydefter.app; faz-6 = önizleme.
- Z-1 canlıda: iPad bayat dokunma onarımı; main ve faz-6 aynı Z-1 commit'inde.
- 6.6-3b + 6.6-3c canlıda; KONU_TASI=true, taşıma için adres parametresi gerekmiyor.
- Geri alma: KONU_TASI=false (parametresiz taşıma kapanır; ?konuTasi=1 geliştirme açılışı kalır), ?konuAra=0 (arama kapanır).
## Bitenler (özet)
- EK-3b: bant seçilen her gerçek özette çıkar; Aynı hedefi açık dosyadır, çoklu özette adı gösterilir. Yeni ozet.pdf aynı seçici sırasına geldiğinde sayfa kimliği de denetlenir; başarıda bant kapanır. ?ekAyri=0 eski davranışı korur.
- EK-3: ek bandında Ayrı/Aynı; özetsiz konuda Ekle → ozet.pdf. Ayrı ek Ozetler'de açılır; sabit defterIslem ile cihazlar arası tekrar engellenir, eski sürüm tanınır. Ad çakışmaları numaralanır; ?ekAyri=0 eski banda döner. Kaynak ek değiştirilmez.
- E-1: Pencil görülmüşse Parmakla yaz düğmesi; tercih cihazda saklanır, Pencil değince kapanır ve o çizgi normal başlar. ?elModu=0 geri alır; Z-1 korunur. Önce kırmızı testler; son doğrulama aşağıda.
- Z-1 (D34): bayat dokunma onarımı; H1/H2 önce kırmızı, sonra yeşil; 2153/2153 test + typecheck/build/dil geçti. ?bayat=0 geri alır, ?olcum=1 temizlik günlüğü; iPad doğrulaması bekliyor.
- Panel 2 (D33): kimliksiz UTC günlük sayaç (Upstash REST, 400 gün), sahibe özel ?panel=1, EN/TR; 2136/2136 test, OCR 34 test değişmeden, typecheck/build/dil geçti (924 anahtar); sahte API ile 6 boyut/dil panel kontrolü geçti. Beacon text/plain UTF-8; false/hata durumunda fetch yedeği testli. Deniz yalnız faz-6 gönderimini onayladı; main korunur.
- Panel (D32): @vercel/analytics 2.0.1; yalnız üretim mydefter.app, ?analiz=0 kapatır, query/hash silinir; EN/TR gizlilik güncellendi. 2087/2087 test + typecheck/build/dil geçti; tarayıcıda yerel alan adı taklidi geçti, canlı doğrulama bekliyor.
- Faz 1–5, 6.1–6.3, 6.H/6.K, OCR/Temiz yazı/atlas, sayfa işleri ve EN/TR canlıda.
- 6.6-0/1a/1b, 5a/5b/6 oturum işleri, 6.6-2 çoklu özet (D30), 6.6-3a sürükle-bırak canlıda.
- 6.6-3b konuyu başka üniteye taşıma (D31; D12 güncellendi):
  - Klasör adı/kimliği korunur; tek yeni Drive işlemi PATCH addParents/removeParents; sonra kitap.json yolu.
  - Aynı kuyrukta Geri al/Tekrar dene/Vazgeç; gerçek ebeveyne göre tekrar; localStorage `defter-konu-tasi` kaydıyla açılışta toparlama.
  - Toparlama hatası kilit değil: durum satırında hata + Vazgeç (yalnız kayıt silinir, kitap Drive'dan yeniden okunur; Drive'a yazma yok). Klasör hedefte + json yeni yolda → kayıt sessizce silinir.
  - Engeller (K3): içindekiler kuyruğu, başarısız okuma yazımı, çalışan/yarım sayfa işi, dosya ekleme.
  - Yerel yollar çevrilir; klasör/materyal/arama önbellekleri geçersiz kılınır; açık PDF/sayfa korunur.
- 6.6-3c (699677e; ilk inceleme düzeltmeleri 53b5b7c): okuyucu konu yolunu bulamazsa bir kez arar (`okuma/konuAra.ts`, `baglam.konuBul` in `ui/konuTasiAkisi.ts`):
  - Kilit KONU_ARA=true, ?konuAra=0 kapatır. kose-olcum hariç 2078/2078 test (165 dosya), typecheck/build geçti; TR/EN 906 anahtar.
## Doğrulama
- EK-3b: önce 3 birim testi ve özet yok → Ekle tarayıcı kontrolü kırmızı; sonra 2177/2177 test (170 dosya), typecheck/build/dil geçti (931 TR/EN anahtar). Playwright 1180×820 + 390×844 × TR/EN: yeni PDF açılışı, ikinci özet bandı/hedefi, tüm özetlerde işaretle gizleme, Sonra ve taşma kontrolü; 8 yerel ekran görüntüsü alındı. Gerçek iPad/Drive denemesi bekliyor.
- EK-3: önce 4 yeni test kırmızı, sonra 2174/2174 test (170 dosya), typecheck/build/dil geçti; 930 TR/EN anahtar, 0 dil hatası. Playwright 390×844 / 1180×820 / 1920×1080 × TR/EN geçti: iki/tek düğme, eklenmiş ekin gizlenmesi, hata ve taşma; 24 görüntü defter-test-dosyalari/ek-ayri içinde. Gerçek Drive/iPad bekliyor.
- E-1: 2170/2170 test (170 dosya), typecheck/build/dil geçti (927 TR/EN anahtar, 0 dil hatası); Playwright 390×844 / 1180×820 / 1920×1080 × EN/TR: 58 px tek satır, dış taşma yok; yenileme/Pencil dönüşü testli. Gerçek iPad bekliyor.
- Sahte Drive + Playwright 390×844 / 1180×820 × EN/TR: taşıma, boş ünite, Geri al, Tekrar dene, Vazgeç, toparlama geçti; dil:ekran 160 ekran, taşma 0.
## Sıradaki
0. EK-3b: gerçek iPad/Drive ile ikinci özete ekleme ve özetsiz konuda Ekle denemesi; push/yayın yapılmadı.
0. E-1: faz-6 önizlemesinde Deniz'in iPad denemesi; main'e gönderim ayrıca onay ister. TASK.md görev başında değişikti, dokunulmadı.
0. Z-1: canlıda gerçek iPad denemesi; ?olcum=1 temizlik günlüğü, ?bayat=0 geri alma.
0. Panel 2: Deniz incelemesi; yayın öncesi Upstash bağlantısı, yayın sonrası gerçek API/Redis ve /api/_sahip → 404 doğrulaması (.vercel/output yerelde yok).
1. 6.6-4 OCR sadeleştirme.
2. Faz 7 (quiz/özet).
## Açık riskler
- Büyük PDF her kayıtta baştan yükleniyor; iki cihazın bekleyen kayıtları çakışabilir.
- Gerçek 70 dk oturum ve iPad/parmak/kalem denemeleri bekliyor; oda yüklemesinde 15 sn geri dönüş sürer.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
