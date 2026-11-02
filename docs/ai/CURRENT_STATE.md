# CURRENT_STATE

Son güncelleyen: Claude, 2 Kasım 2026 · 6.6-3b son düzeltme (toparlama Vazgeç)
## Git ve yayın
- Çalışma dalı main; commit/push/checkout/reset/stash yapılmadı; git pull: Already up to date.
- AGENTS.md ve TASK.md oturum başında değişikti; Deniz'in talimatıyla dokunulmadı.
- Canlı ve faz-6 önizleme: 6.6-3a (2360b1d); 6.6-3b yalnız yerelde, yayınlanmadı.
## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H/6.K, OCR/Temiz yazı/atlas, sayfa işleri ve EN/TR canlıda.
- 6.6-0/1a/1b, 5a/5b/6 oturum işleri, 6.6-2 çoklu özet (D30) ve 6.6-3a canlıda.
## Şimdi: 6.6-3b yerelde
- K1–K7 uygulandı; D12 güncellendi, D31 eklendi.
- KONU_TASI=false; yalnız ?konuTasi=1 ile üniteler arası konu sürükleme açık.
- Klasör adı/kimliği korunur; tek yeni Drive işlemi PATCH addParents/removeParents; JSON mevcut yazma yolunda.
- Aynı kuyrukta Geri al/Tekrar dene/Vazgeç; gerçek ebeveyne göre tekrar; localStorage iş kaydıyla açılışta toparlama.
- Son düzeltme: toparlama hatası kilit değil; durum satırında hata + Vazgeç (yalnız defter-konu-tasi silinir, kitap Drive'dan yeniden okunur; Drive'a yazma yok). Klasör hedefte + json yeni yolda → kayıt sessizce silinir. 2040/2040 test.
- D6/K3: içindekiler, başarısız okuma yazımı, çalışan/yarım sayfa işi ve dosya ekleme kontrol edilir.
- Açık PDF materyali/dosyası/sayfası korunur; yerel yedek yolları çevrilir, klasör/materyal/arama önbellekleri geçersiz kılınır.
- Kalem/fotoğraf/OCR/Temiz yazı kimlikleri korunur; auth ve PDF kayıt yolu değiştirilmedi.
## Doğrulama
- 2037/2037 test (163 dosya; 74 yeni), typecheck/build/dil geçti; TR/EN 903 anahtar, dil 0.
- Derlenmiş uygulama + sahte Drive: 390×844 dokunma / 1180×820 fare × EN/TR, taşıma/boş ünite/Geri al geçti.
- Kaybolan taşıma yanıtı + Tekrar dene, Vazgeç, yenileyip toparlama, ikinci sayfa ve silinen sayfa yedeği doğrulandı.
- Kilit kapalı 3a: dört tur; sıra/iptal/aynı yer/klavye/yenileme/kenar kaydırma geçti, taşma 0.
- dil:ekran iki turda mevcut route.fetch hatasıyla kesildi; iki sahte JSON yanıtı yerel örnekten okunacak şekilde düzeltildi.
- Son dil:ekran turu geçti: 160 ekran, 0 beklenmeyen taşma; ilk iki başarısız tur ayrı tutuldu.
- Gerçek Drive'a erişilmedi; gerçek iPad/ikinci hesap ve Claude diff incelemesi bekliyor.
## Sıradaki
1. Verification tamamlanınca Claude diff incelemesi, Deniz'in ikinci hesap/iPad ve gerçek kitap denemesi.
2. Deniz açıkça isterse commit/yayın; varsayılan taşıma kilidi ancak onaylı canlı çıkışında açılır.
3. 6.6-4 OCR görünümü, ardından Faz 7 quiz/özet.
## Açık riskler
- K6: eski kitap.json tutan başka cihaz/sekme eski yolu açarsa otomatik yeniden yükleme henüz yok (D10 ayrı iş).
- Büyük PDF her kayıtta baştan yükleniyor; iki cihazın bekleyen kayıtları çakışabilir.
- Gerçek 70 dk oturum ve iPad/parmak/kalem denemeleri bekliyor; oda yüklemesinde 15 sn geri dönüş sürer.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
