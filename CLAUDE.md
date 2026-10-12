# Defter – sanal kitaplık uygulaması

Bu dosya Claude Code'un her oturumda okuduğu proje kurallarıdır. Değiştirmeden önce Deniz'e sor.

## Kim için, ne yapıyoruz
- Sahibi: Deniz (Uni Bremen Informatik, 1. dönem). İlk gerçek Claude Code projesi; programlamaya yeni başlıyor.
- Uygulama: Drive'daki notları (PDF, defter fotoğrafı, Claude çıktıları) 3D bir çalışma odasındaki kitaplıkta kitap olarak gösteren web uygulaması. Önce kişisel kullanım.
- Ana cihaz: iPad (Safari, ileride Apple Pencil). İkinci cihaz: Windows laptop (Chrome/Edge). Telefonda da açılabilmeli.

## Deniz ile çalışma kuralları
- Deniz ile **Türkçe** konuş. Kısa ve basit cümleler kur. Teknik bir terimi ilk kullandığında bir cümleyle açıkla.
- Her görevde önce kısa bir plan yaz (hangi dosyalar, ne değişecek), Deniz onaylayınca uygula.
- Görev bitince şunları ver: (1) ne yaptın, 3–5 madde, (2) Deniz'in nasıl deneyeceği, adım adım, (3) bilinen eksikler.
- Büyük bir karar gerekiyorsa (yeni kütüphane, veri formatı değişikliği, dosya silme) önce sor.
- Bir şeyi bilmiyorsan uydurma; söyle ve nasıl öğrenebileceğimizi öner.
- Kapsamın dışına çıkma: sadece verilen görevi yap. Fark ettiğin başka sorunları sona "Sonra bakılabilir" diye listele.

## Teknoloji
- Vite + TypeScript (framework yok, düz DOM). Paket yöneticisi: npm.
- 3D: three.js (npm paketi). Renk yönetimi: `renderer.outputColorSpace = SRGBColorSpace`, ACES tone mapping, PCF gölgeler (yumuşak; PCFSoftShadowMap yeni sürümlerde kaldırıldı).
- Google girişi: Google Identity Services (token client, tarayıcıda). Sunucu yok, client secret yok.
- Drive: Drive REST API v3, `fetch` ile. Kapsam (scope): `https://www.googleapis.com/auth/drive`.
- Yayın: Vercel (statik site). Ortam değişkeni: `VITE_GOOGLE_CLIENT_ID`.
- Sonraki fazlarda: pdf.js (okuma), pdf-lib (çizimleri PDF'e yazma), Blender ile pişirilmiş ışık.

## Komutlar
- `npm run dev` → yerelde çalıştır (http://localhost:5173)
- `npm run build` → yayın sürümünü üret
- `npm run typecheck` → TypeScript hatalarını kontrol et (`tsc --noEmit`)
- Bir görevi bitmiş saymadan önce `npm run typecheck` ve `npm run build` hatasız geçmeli.

## Klasör yapısı
```
referans/prototip.html   ← onaylanmış tıklanabilir prototip (görünüm ve davranışın kaynağı, DEĞİŞTİRME)
src/main.ts              ← giriş noktası
src/model/               ← veri tipleri (Kitaplik, Raf, Kitap, Bolum, Kaynak) ve doğrulama
src/drive/               ← auth.ts (Google girişi), drive.ts (dosya okuma/yazma)
src/scene/               ← three.js: oda, ışık, kamera, kitaplık, kitap, animasyonlar
src/ui/                  ← üst bar, Özelleştir paneli, bildirimler (toast), giriş ekranı
src/styles.css
```

## Prototip kuralı
- `referans/prototip.html` Deniz'in onayladığı tasarım. Oda, ışık, renkler, kamera geçişleri, kitap animasyonları, okuma ekranı ve kalem davranışı oradan alınır.
- Kodu oradan **modüllere bölerek taşı**; davranışı ve görünümü değiştirme. Bir şeyi farklı yapmak gerekiyorsa önce sor.
- Prototipteki örnek kitaplar (BOOKS, DEFAULT_SHELVES) sadece Drive bağlanmadan önceki geçici veridir.

## Veri modeli (Drive)
Drive'da ana dizinde `Kitaplık` klasörü:
```
Kitaplık/
  kitaplik.json            ← raflar (sıralı) ve oda ayarları
  kitaplar/<kitap-id>/     ← her kitap bir klasör; klasör adı = kitap id (küçük harf, tire)
    kitap.json             ← başlık, sırt, kod, ders, kapak, bölümler, kaynaklar
    *.pdf, defter/*.jpg    ← kaynak dosyalar
```
- `kitaplik.json`: `{ surum, raflar: [{ id, ad, kitaplar: [kitapId] }], oda: { duvar, zemin, mod } }`
- `kitap.json`: `{ surum, baslik, sirt, kod, ders, kapak: { renk, stil: "kumas"|"deri" }, sonAcilis, kurdele, bolumler: [{ baslik, durum: "okunmadi"|"calisildi"|"tekrar", kaynaklar: [{ tur: "pdf"|"defter"|"claude"|"link", dosya, sayfalar? }] }] }`
- `kitap.json` yoksa kitap yine görünür (klasör adıyla, gri kapak).
- Hiçbir rafta olmayan kitaplar "Yeni gelenler" yığınında görünür.
- Bilinmeyen alanları silme; okurken koru, yazarken geri yaz.

## Değişmez kurallar
- Uygulama Drive'daki dosyaları **kopyalamaz, taşımaz, silmez**. Faz 1'de sadece `kitaplik.json` ve `kitap.json` içindeki `kapak` alanı yazılabilir.
- Yazmadan önce dosyanın son halini oku (başka cihazda değişmiş olabilir).
- Erişim token'ını localStorage'a yazma; bellekte tut. `.env.local` git'e girmez.
- Hata mesajları Türkçe, kullanıcıya ne yapacağını söyler ("Drive'da Kitaplık klasörü bulunamadı. Klasörü ana dizine yükle ve yenile.").
- iPad performansı: pixel ratio en fazla 2, gölge haritası en fazla 2048, sahne değişmiyorsa render etme.
- Arayüz metinleri Türkçe; kod içindeki isimler İngilizce.

## Git
- Her görev bitip Deniz denedikten sonra commit at. Mesaj Türkçe ve açıklayıcı: `Faz 1.3: kitaplık rafları ve sürükle-bırak`.
- Commit atmadan önce `git status` ile neyin değiştiğini Deniz'e göster.

## Yol haritası (özet)
- Faz 1 Temel: proje, 3D oda, kitaplık, Google girişi, Drive'dan okuma, Vercel  ← ŞU AN
- Faz 2 Görsel kalite: hazır modeller + PBR dokular, Blender'da ışık pişirme
- Faz 3 Okuma: pdf.js, kitap/PDF modu, yakınlaştırma
- Faz 4 Kalem: çizimleri PDF'e kaydetme (MVP)
- Faz 5 Defter ve ekleme: fotoğraf notu, dönüştürme, özelleştirme
- Faz 6 Akıllı özellikler: OCR, arama, quiz/özet
