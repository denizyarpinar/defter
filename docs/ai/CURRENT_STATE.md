# CURRENT_STATE

Son güncelleyen: Codex, 3 Kasım 2026 · Panel 2 hazır; Deniz tek commit ve yalnız faz-6 gönderimini onayladı
## Git ve yayın
- main = production https://mydefter.app; faz-6 = önizleme.
- 6.6-3b + 6.6-3c canlıda; KONU_TASI=true, taşıma için adres parametresi gerekmiyor.
- Geri alma: KONU_TASI=false (parametresiz taşıma kapanır; ?konuTasi=1 geliştirme açılışı kalır), ?konuAra=0 (arama kapanır).
## Bitenler (özet)
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
  - (a) kitap.json tazelenir; Konu-NN başka yoldaysa yalnız bellek (yazma/bildirim yok). (b) ünite klasörlerinde ada göre tek sorgu.
  - json düzeltmesi konuTasiAcik() iken toparla yoluyla (Drive taşıma yok) + toast; eski ünite yoksa yalnız bellek.
  - İnceleme düzeltmeleri: topicFolderId resolver'ı yeniden kurar; arama ünite klasor alanını ve konu yollarının ilk parçalarını sayar, Yedek dışarıda; sayfalama var, ikinci eşleşmede durur. Yeni Drive yazma/taşıma yok.
  - Kilit KONU_ARA=true, ?konuAra=0 kapatır. kose-olcum hariç 2078/2078 test (165 dosya), typecheck/build geçti; TR/EN 906 anahtar.
## Doğrulama
- Canlıya çıkış: kose-olcum hariç 2078/2078 test (165 dosya), typecheck/build/dil geçti; TR/EN 906 anahtar, dil 0.
- Sahte Drive + Playwright 390×844 / 1180×820 × EN/TR: taşıma, boş ünite, Geri al, Tekrar dene, Vazgeç, toparlama geçti; dil:ekran 160 ekran, taşma 0.
## Sıradaki
0. Panel 2: Deniz incelemesi; yayın öncesi Upstash bağlantısı, yayın sonrası gerçek API/Redis ve /api/_sahip → 404 doğrulaması (.vercel/output yerelde yok).
1. 6.6-4 OCR sadeleştirme.
2. Faz 7 (quiz/özet).
## Açık riskler
- Büyük PDF her kayıtta baştan yükleniyor; iki cihazın bekleyen kayıtları çakışabilir.
- Gerçek 70 dk oturum ve iPad/parmak/kalem denemeleri bekliyor; oda yüklemesinde 15 sn geri dönüş sürer.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
