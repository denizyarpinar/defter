# CURRENT_STATE

Son güncelleyen: Codex, 2 Kasım 2026 · 6.6-2 canlı çıkışı
## Git ve yayın
- Deniz 2 Kasım'da 6.6-2 canlı çıkışını onayladı; commit sonrası main ve ardından faz-6 push edilir; force push yok.
- 6.6-2 canlıda: https://defter-jade.vercel.app — Production Ready ve HTTP 200 sonucu oturum son mesajında doğrulanır.
- Önizleme dalı faz-6; önceki önizleme commit'i 9211f70, Ready ve alias bağlantısı doğrulandı.
## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K, 6.K7–K8; OCR/Temiz yazı/atlas, sayfa işleri, özet ekleri ve EN/TR canlıda.
- 6.6-0 sayfa sayacı; 6.6-1a/1b avuç/kalem koruması ve iki parmak hareketleri canlıda.
- 6.6-5a anonim oturum ölçümü, 6.6-5b sekme sessionStorage oturumu ve 6.6-6 sessiz yenileme canlıda.
- 6.6-6 gerçek 70 dk oturum denemesi halen bekliyor; token localStorage'a yazılmaz.
## Şimdi: 6.6-2
- Ayrı özet PDF'leri Ozetler/<ad>.pdf; eski ozet.pdf taşınmaz, kitap.json biçimi değişmez.
- Keşif, dosya seçici, dosyaya özel sayfalar/önbellek, kurdele, Göster ve arama bağlantıları tamam.
- Dosya panelinde yeni özet ve mevcut özetin sonuna seçenekleri; ad/aynı ad kontrolleri, tekrar denemede tek klasör/dosya.
- COKLU_OZET=true; ?cokluOzet=1 artık gerekmez, adres desteği kodda korunur. D30 DECISIONS.md'ye eklendi.
- Geri alma: COKLU_OZET=false yap; ayrı özet oluşturma yeniden adres kilidine döner, okuma ve Drive dosyaları korunur.
- Fotoğraf ve sona ekleme hedef kontrolü Ozetler dosyalarını kabul eder; kalem kuyruğu/kaydedici/auth değişmedi.
- Özet ek bandı yalnız ilk kök özetinde; Ozetler dosyasının çöpe atılması ve Geri al hedefleri desteklenir.
- Eski sınıflama, kayıp kurdele dosyasında ilk özete dönüş, kapalı kilitte eski panel dahil 21 yeni test.
- Doğrulama: 1945/1945 test, typecheck/build geçti; dil 0, EN/TR 892 anahtar.
- Fotoğraf ölçüm testi repo dışı tanı çıktısı izniyle tam tekrarda geçti.
- Derlenmiş uygulama + sahte Drive: yeni özet, seçici, ayrı sayfa sayıları, kitap/PDF, kurdeleyle yeniden açılış, dil dönüşü ve kapalı kilitte panel geçti.
- 390×844 ve 1180×820, EN/TR dört deneme: panel/okuyucu taşması 0; görüntüler incelendi.
- Kilit açılışı: 1945/1945 test ve typecheck/build/dil tekrar geçti; sahte Drive ile parametresiz dört EN/TR senaryosu geçti.
- Önceki genel dil:ekran + TR okuyucu tekrarı: birleşik 160 ekran, beklenmeyen taşma 0; ilk turda tek sayfa-yenileme test kesintisi vardı.
## Sıradaki
1. 6.6-3: sürükle-bırak.
2. Faz 7: quiz/özet (LLM API).
## Açık riskler
- Büyük ozet.pdf her kayıtta baştan yükleniyor; iki cihazda bekleyen kayıtlar çakışabilir.
- Yavaş oda yüklemesi 15 sn sonunda prosedürel odaya düşer; gerçek iPad hareket denemeleri bekliyor.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
- 600–yaklaşık 760 px sekme şeridi kaydırılır (beklenen); eski testlerde ara sıra rastgele hata bildirilmişti.
