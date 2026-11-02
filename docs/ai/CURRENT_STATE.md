# CURRENT_STATE

Son güncelleyen: Codex, 2 Kasım 2026 · 6.6-3a önizleme çıkışı
## Git ve yayın
- Canlı main uzak dalı 6.6-2 (74cff85) kalır; Deniz 6.6-3a commit ve yalnız faz-6 push onayı verdi.
- TASK.md başlangıçta değiştirilmişti; Deniz bunun beklenen görev dosyası olduğunu onayladı, dosyaya dokunulmadı.
- Son onay: belirtilen 11 dosya commit edilir, git fetch . main:faz-6 ardından git push origin faz-6; main'e push yok.
## Bitenler (özet)
- Faz 1–5, 6.1–6.3, 6.H, 6.K, OCR/Temiz yazı/atlas, sayfa işleri ve EN/TR canlıda.
- 6.6-0 sayaç, 6.6-1a/1b kalem/avuç ve iki parmak hareketleri canlıda.
- 6.6-5a/5b ve 6.6-6 oturum iyileştirmeleri canlıda; gerçek 70 dk oturum denemesi bekliyor.
- 6.6-2 çoklu özet canlı: ilk ozet.pdf, sonrakiler Ozetler/<ad>.pdf; D30, COKLU_OZET=true.
## Şimdi: 6.6-3a (önizleme çıkışı onaylandı)
- İçindekiler düzenlemede tutamaçla konu sırası (kendi ünitesinde) ve ünite sırası değişir.
- Pointer Events, 6 px eşik, satır kaldırma/kayma, kenar kaydırma, azaltılmış hareket desteği.
- ↑ ↓ düğmeleri duruyor; görsel olarak gizli, klavye odağında görünür. Tutamaçta ok tuşları çalışır.
- Oklar ve bırakma aynı siraDegistir yolunda; mevcut 800 ms birleştirme ve geri alma korunur.
- Sürüklerken ciz ertelenir; kuyrukla değişen sıra bırakmada nesne üzerinden bulunur.
- Escape/pointercancel yazmaz; bekleyen satırlarda tutamaç yok, ad düzenlerken tutamaç kapalı.
- Okuyucuda Escape için iki satırlık uyum; kayıt sonrası yeniden çizimde klavye odağı korunur.
- Yeni bağımlılık, Drive yolu/veri biçimi, kalem/auth/kaydedici değişikliği yok.
## Doğrulama
- 1963/1963 test (160 dosya), typecheck/build/dil geçti; dil 0, TR/EN 893 anahtar.
- Derlenmiş uygulama + sahte Drive: 390×844 dokunma / 1180×820 fare, EN/TR dört tur geçti.
- Konu 1→3, ünite 2→1, iptal, aynı yer, panel dışında bırakma, klavye, yenileme, kenar kaydırma geçti.
- Her tur üç sıra yazımı; iptallerde yazma yok. Gerçek Drive'a erişilmedi.
- dil:ekran ilk turunda üç betik hatası; EN/TR okuyucu ve TR 390 ekleme tekrarları geçti.
- Birleşik 160 ekran, beklenmeyen taşma 0; gerçek iPad/parmak/kalem ve Claude diff incelemesi bekliyor.
## Sıradaki
1. Deniz'in laptop ve gerçek iPad/Drive denemesi; Claude diff incelemesi.
2. faz-6 dağıtımı Ready olduğunda defter-git-faz-6-deniz-b571 alias bağlanır; sonuç oturum sonunda doğrulanır.
3. Canlı çıkış ayrı Deniz onayıyla; ardından ayrı TASK ile 6.6-3b (üniteler arası konu taşıma).
4. Faz 7: quiz/özet (LLM API).
## Açık riskler
- Büyük PDF her kayıtta baştan yükleniyor; iki cihazda bekleyen kayıtlar çakışabilir.
- Yavaş oda yüklemesi 15 sn sonunda prosedürel odaya düşer; gerçek iPad hareket denemeleri bekliyor.
- İlk girişte otomatik kurulum hedef; mevcut kurulum düğmesi korunuyor.
- Ekran betiklerinde aralıklı zaman aşımı/yenileme hatası var; ilk tur ve tekrarlar ayrı raporlandı.
