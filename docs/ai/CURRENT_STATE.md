# CURRENT_STATE

Son güncelleyen: Claude, 2 Kasım 2026 · 6.6-3c yerelde bitti (commit yok, Deniz denemesi bekliyor)
## Git ve yayın
- main ve faz-6 = canlı; Production https://defter-jade.vercel.app (HTTP 200 doğrulandı).
- 6.6-3a (2360b1d) ve 6.6-3b (7d93aac) canlıda; 3b kilitli: KONU_TASI=false, yalnız ?konuTasi=1 ile açık.
## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H/6.K, OCR/Temiz yazı/atlas, sayfa işleri ve EN/TR canlıda.
- 6.6-0/1a/1b, 5a/5b/6 oturum işleri, 6.6-2 çoklu özet (D30), 6.6-3a sürükle-bırak canlıda.
- 6.6-3b konuyu başka üniteye taşıma (D31; D12 güncellendi):
  - Klasör adı/kimliği korunur; tek yeni Drive işlemi PATCH addParents/removeParents; sonra kitap.json yolu.
  - Aynı kuyrukta Geri al/Tekrar dene/Vazgeç; gerçek ebeveyne göre tekrar; localStorage `defter-konu-tasi` kaydıyla açılışta toparlama.
  - Toparlama hatası kilit değil: durum satırında hata + Vazgeç (yalnız kayıt silinir, kitap Drive'dan yeniden okunur; Drive'a yazma yok). Klasör hedefte + json yeni yolda → kayıt sessizce silinir.
  - Engeller (K3): içindekiler kuyruğu, başarısız okuma yazımı, çalışan/yarım sayfa işi, dosya ekleme.
  - Yerel yollar çevrilir; klasör/materyal/arama önbellekleri geçersiz kılınır; açık PDF/sayfa korunur.
- 6.6-3c (yerel, commit yok): okuyucu konu yolunu bulamazsa bir kez arar (`okuma/konuAra.ts`, `baglam.konuBul` in `ui/konuTasiAkisi.ts`):
  - (a) kitap.json tazelenir; Konu-NN başka yoldaysa yalnız bellek (yazma/bildirim yok). (b) ünite klasörlerinde ada göre tek sorgu.
  - json düzeltmesi yalnız ?konuTasi=1 iken, toparla yoluyla (Drive taşıma yok) + toast; kilitliyken/eski ünite yoksa yalnız bellek.
  - Kilit KONU_ARA=true, ?konuAra=0 kapatır. 2071/2071 test (165 dosya), typecheck/build/dil geçti; TR/EN 906 anahtar.
## Doğrulama
- 2040/2040 test (163 dosya), typecheck/build/dil geçti; TR/EN 904 anahtar, dil 0.
- Sahte Drive + Playwright 390×844 / 1180×820 × EN/TR: taşıma, boş ünite, Geri al, Tekrar dene, Vazgeç, toparlama geçti; dil:ekran 160 ekran, taşma 0.
- Gerçek ikinci hesap/iPad denemesi kilit açılmadan önce yapılacak.
## Sıradaki
1. 6.6-3c laptop denemesi (iki sekme + toparla-Vazgeç) → commit → KONU_TASI=true.
2. 6.6-4 OCR görünümü.
3. Faz 7 (quiz/özet).
## Açık riskler
- K6 ve toparla-Vazgeç uyuşmazlığı 6.6-3c ile çözülüyor (gerçek Drive denemesi bekliyor). Hedef ünite bellekte yoksa konu yalnız yol değiştirip eski ünitede görünür; yenileyince düzelir.
- Normal taşımada Vazgeç telafisi uyuşmazlıkla düşerse oturum içinde döngü; sayfa yenileyince toparlama Vazgeç'i çözer.
- Büyük PDF her kayıtta baştan yükleniyor; iki cihazın bekleyen kayıtları çakışabilir.
- Gerçek 70 dk oturum ve iPad/parmak/kalem denemeleri bekliyor; oda yüklemesinde 15 sn geri dönüş sürer.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
