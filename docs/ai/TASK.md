# TASK – A1: İlk giriş ve kurulum sadeleştirme

## Goal
Yeni kullanıcının Google ile giriş ve ilk kitaplık
kurulumu sırasında gördüğü arayüzü sadeleştirmek.

Amaç yeni özellik eklemek değil; mevcut davranışı
daha anlaşılır ve kullanımı kolay hale getirmektir.

## Context
İlk giriş/kurulum analizi tamamlandı.
Seçilen yaklaşım mevcut akışı sadeleştirme (Plan A).

Özellikle:
- Girişte TR/EN açıklamalar birlikte görünüyor.
- Demo ile Drive'a örnek ekleme karıştırılabilir.
- Kurulum açıklamaları uzun.
- Kurulum sonrası sonraki adım yeterince açık değil.

## Kararlar
K1: Google izinleri ve auth davranışı değişmeyecek.
K2: D09 ve D10 dahil mevcut mimari kararlar korunacak.
K3: Drive dosya oluşturma mantığı değişmeyecek.
K4: Yeni ekran veya zorunlu kurulum aşaması eklenmeyecek.
K5: Mevcut görsel tasarım dili korunacak.
K6: TR ve EN eşit kalitede hazırlanacak.
K7: Video için küçük oynat düğmesi tasarımı seçildi,
ancak video başka görevde üretilecek.
Bu görevde video, video oynatıcı veya işlevsiz
video düğmesi eklenmeyecek.

## Relevant Files
Codex mevcut yapıyla doğrulayacak:

- index.html
- src/ui/login.ts
- src/ui/driveStatus.ts
- src/ui/kurulumDurumu.ts
- src/dil/tr.ts
- src/dil/en.ts
- src/styles.css
- İlgili mevcut test dosyaları

Yalnız gerçekten gereken dosyaları değiştir.

## Requirements
1. Giriş açıklamaları seçilen dile uygun gösterilsin.
2. Metinler kısa, anlaşılır ve güvenilir olsun.
3. Demo kullanımının Drive'a yazmadığı açık olsun.
4. Örnek kitap eklemenin Drive'a yazdığı anlaşılsın.
5. Kurulum kartındaki gereksiz tekrarlar azaltılsın.
6. Kurulum başarı durumunda sonraki adım açıklansın.
7. Hazır kitaplık ve yarım kurulum davranışı korunsun.
8. Önemli gizlilik ve izin açıklamaları kaybolmasın.
9. Mobil ekranda yeni taşma oluşmasın.
10. Mevcut oda görünümü ve duyuru akışı bozulmasın.

## Do Not
- Google izin kapsamlarını değiştirme.
- Auth, token ve oturum davranışını değiştirme.
- Drive oluşturma/okuma/yazma mantığına dokunma.
- API veya veri modelini değiştirme.
- Drive klasör adlarını ve JSON anahtarlarını değiştirme.
- Otomatik kurulum ekleme.
- Kitap oluşturma sihirbazını yeniden düzenleme.
- Video veya çalışmayan oynat düğmesi ekleme.
- İlgisiz refactor yapma.
- Gizli fikir havuzunu repoya aktarma.
- .env dosyalarını okuma veya değiştirme.
- main'e push yapma.
- git checkout/reset/stash/force push kullanma.

## Definition of Done
- Giriş açıklamaları doğru dilde.
- Demo/Drive örneği arasındaki fark anlaşılır.
- Kurulum kartı daha sade.
- Kurulum sonrası yönlendirme metni açık.
- Mevcut işlevler korunmuş.
- Yeni regresyon testleri başarılı.
- TR/EN ve ekran kontrolleri başarılı.

## Verification
Önce ilgili başarısız testleri yaz,
sonra değişiklikle başarılı hale getir.

npm test
npm run typecheck
npm run build
npm run dil

Giriş ve kurulum ekranlarını TR/EN için:
390x844
820x1180
1180x820
1280x800

boyutlarında kontrol et.

Taşma, yanlış dil, konsol hatası ve
dokunmatik kullanım sorunlarını raporla.

Mevcut giriş/kurulum senaryo testlerini koru.
