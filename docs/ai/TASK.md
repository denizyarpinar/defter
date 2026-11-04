# TASK — Geniş afiş duyurusu

Deniz onayı: 4 Kasım 2026, bu sohbet. Seçili görsel ve Geniş afiş düzeni onaylı.
Son onay: Deniz küçük ve ortalanmış kartı denedi; 4 Kasım 2026 aynı sohbette main'e alma ve gönderme izni verdi.

## Goal
Google girişi veya geri yüklenen oturumdan sonra oda hazır olduğunda gelecek özellikler afişini göster.

## Requirements
- Sıcak oda ve altın halkalı kalem görseli; Öğrenmeye biraz sihir kat başlığı; yalnız seçilen üç özellik.
- X, Escape ve Çalışmaya dön ile kapanma. Klavye odağı pencerede kalır ve kapanınca geri döner.
- Sekme oturumunda en fazla bir kez. Bir daha gösterme işaretli kapatma yalnız duyuru kimliğini cihazda saklar.
- Giriş/kurulum/hata/demo, okuyucu veya başka panelin üzerine otomatik açılmaz; uygun odayı bekler.
- Çıkışta açık/bekleyen gösterim temizlenir. Depolama ve görsel hatası odayı engellemez.
- TR/EN gerçek metin; telefon/iPad/bilgisayar ve küçük yatay ekran uyumu.
- Deniz'in boyut düzeltmesi: ekran ortasında küçük kart; masaüstünde en fazla 560 px, telefonda 340 px. Metinler okunaklı kalır.
- Tek etkinlik sabitiyle geri alma; açık yerel önizleme yalnız geliştirmede.

## Files
src/ui/duyuru.ts, src/ui/duyuru.test.ts, src/main.ts, src/styles.css,
src/dil/tr.ts, src/dil/en.ts, public/duyurular/gelecek-ozellikler-v1.webp,
scripts/duyuru-kontrol.mjs, docs/ai/CURRENT_STATE.md.

## Do Not
- Auth/API/Drive yazma/veri biçimi değişikliği, yeni paket ve ilgisiz düzenleme yok.
- Gizli fikir havuzunun metni veya diğer fikirleri repoya aktarılmaz.
- Deniz'in son onayıyla bu duyuru commit edilip main'e alınabilir ve gönderilebilir. İlgisiz yeni değişiklik veya force push yok.

## Verification
npm test, npm run typecheck, npm run build, npm run dil.
Sahte Google/Drive ile gerçek main akışı: giriş, oturum geri yükleme, kurulum/demo engeli,
tekrar gösterim, kalıcı tercih, kapanma/odak, bekleyen panel/okuyucu, çıkış ve hata durumları.
TR/EN × telefon/iPad/bilgisayar ve küçük yatay ekranlarda taşma/görünüm kontrolü.
Gerçek iPad ve gerçek hesap denemesi Deniz'e bırakılır.
