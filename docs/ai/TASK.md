# TASK – A2: İlk kitap ve PDF hızlı başlangıç

## Goal

Yeni ve mevcut kullanıcılar kolayca yeni kitap
oluşturabilsin.

Kullanıcı kitap adı ve ilk konusunu girdikten sonra
kitabı oluşturabilsin, yeniden rafta aramadan ilk
konusuna ulaşabilsin ve ilk PDF'ini kolayca ekleyip
açabilsin.

## Context

A1 tamamlandı.
Referans commit: b1a03da.
Son bilinen main: 3dd29c0.

Mevcut sistemde:
- Kitap sihirbazı çok sayıda alan gösteriyor.
- En az bir ünite gerekiyor.
- Konusuz kitap oluşturulabiliyor.
- Yeni kitap otomatik açılmıyor.
- Kullanıcı kitabı raftan açıp konuya gitmeli.
- PDF ekleme yalnız konu okuyucusunda bulunuyor.
- Boş konuya ilk PDF eklenince otomatik açılıyor.
- Kitaplıkta kitap varsa Yeni kitap işlemi
  Özelleştir panelinden başlatılıyor.
- Kurulumda örnek kitap seçilirse boş kitaplığa
  özel ilk kitap düğmesi görünmüyor.

Mevcut Google izinleri, Drive yapısı ve güvenlik
kararları aynen korunacak.

## Kararlar

K1 – Tek pencereli hızlı başlangıç.

Yeni kitap penceresinin başlangıç görünümü:
- Kitap adı
- İlk konu
- Ayrıntılar
- Vazgeç
- Kitabı oluştur

Hızlı başlangıçta kitap adı ve ilk konu zorunlu.

Mevcut raf ve kapak rengi varsayılanları korunur.
Ünite mevcut "Genel" yapısıyla oluşturulur.

K2 – Ayrıntılı oluşturma korunacak.

"Ayrıntılar" açıldığında mevcut özellikler:
- Raf seçimi
- Kapak rengi
- Çoklu ünite
- Çoklu konu
- Liste düzenleme
- Önizleme

Bu özellikler kaybolmayacak.

Hızlı moddan ayrıntılı moda geçince girilmiş
bilgiler korunacak. Modlar arasında geçiş veri
kaybına yol açmayacak.

Eski ayrıntılı oluşturma davranışı, konusuz
ünite oluşturabilme dahil, korunacak.

Son onaylı uygulama planı: tek pencere ve tek ortak form durumu.
Ayrıntılar yalnız açılıp kapanan bir bölümdür; iki bağımsız taslak yoktur.
Kitap adı, raf, renk ve ünite/konu listesi ortak tutulur.
Ayrıntılar kapanınca liste korunur; çoklu yapı ve konusuz üniteler
oluşturma öncesinde görünür özette gösterilir. Oluşturulan plan bu
ortak durumla birebir eşleşir. Ayrıntılı konusuz oluşturma korunur.

K3 – Oluşturma sonrası otomatik geçiş.

Hızlı modda kitap başarıyla oluşturulup
kitaplık yenilendikten sonra yeni kitabın
ilk konusu otomatik açılacak.

Kullanıcı kitabı raftan tekrar bulmayacak.

Kod kontrolü düzeltmesi: Ayrıntılar bölümünü açıp kapatmak otomatik
geçişi engellemez. Özellik açıkken geçerli ilk konu varsa mevcut
kimlik doğrulamasıyla açılır; konusuz kitap ve hizliKitap=0 korunur.

Mevcut 3D sahne, kitap açma/kapatma ve
okuyucu yaşam döngüsü bozulmayacak.

Başarı sonrası geçiş başarısız olursa kitap
Drive'da korunacak, kullanıcıya anlaşılır
bir geri dönüş yolu gösterilecek.

Ayrıntılı modda hiç konu oluşturulmadıysa
olmayan konuya geçilmeyecek; mevcut düzenleme
yolu korunacak.

Mevcut scene.openBook → onBookOnDesk → konuAc yolu kullanılacak.
reader.ts içine yeni hazır bildirimi veya yeni sabit bekleme eklenmeyecek.
Bekleyen geçiş kitap/konu kimliğiyle doğrulanacak; iptal, kaynak değişimi
ve hata durumlarında geçiş çalışmayacak.

K4 – İlk PDF ekleme.

Boş konuda belirgin bir "PDF ekle" eylemi olacak.

Mevcut fotoğraf ve diğer dosya ekleme özellikleri
korunacak.

Dosya seçicisi yalnız kullanıcı dokununca açılacak.

Mevcut PDF hazırlama, doğrulama, hedef seçimi,
yükleme, hata ve yeniden deneme mantığı kullanılacak.

Başarıyla yüklenen ilk PDF mevcut davranıştaki
gibi otomatik açılacak.

Gerçek yükleme ilerlemesi olmadan sahte yüzde
gösterilmeyecek.

İkinci PDF dosya girdisi eklenmeyecek. Mevcut oDosyaInput her açılışta
PDF eylemi için tek PDF, genel Dosya ekle için mevcut geniş türler ve
çoklu seçim şeklinde ayarlanacak. İptal olayına bağımlı olmadan genel
seçicinin davranışı korunacak; mevcut gerçek dosya doğrulaması sürecek.

K5 – Kalıcı Yeni kitap kısayolu.

Gerçek Drive kitaplığı kurulmuş kullanıcılar
kitaplık görünümünden küçük bir "Yeni kitap"
düğmesine erişebilecek.

Bu düğme şu durumlarda kullanılabilecek:
- Önceden kitap ve PDF eklemiş kullanıcı
- Yeni kayıt olan kullanıcı
- Yalnız örnek kitap bulunan kullanıcı
- Henüz kendi kitabını oluşturmamış kullanıcı

Boş kitaplıktaki mevcut büyük ilk kitap
düğmesi korunacak. Gereksiz çift düğme olmayacak.

Düğme:
- Demo modunda görünmeyecek.
- Girişsiz durumda görünmeyecek.
- Kurulum tamamlanmadan yazma yolu açmayacak.
- Mevcut 3D gezinme ve panelleri engellemeyecek.

K6 – Mevcut kullanıcılar korunacak.

Kullanıcının kayıt tarihi önemli değil.
Özellik yalnız yeni kayıt olanlara özel olmayacak.

Mevcut kitaplar, PDF'ler, raflar ve konular
değiştirilmeyecek.

Yeni bir veri taşıma işlemi yapılmayacak.

K7 – Özellik anahtarı ve geri alma.

Yeni hızlı başlangıç varsayılan açık olacak.

?hizliKitap=0 ile yeni hızlı başlangıç
davranışı kapatılabilecek.

Kapalıyken eski sihirbaz, eski oluşturma
sonrası davranış ve eski düğme görünürlüğü
geri gelmeli.

Geri alma için Drive verilerini değiştirmek
gerekmemeli.

K8 – Görünüm.

Mevcut Defter tasarım sistemi kullanılacak.
Yeni renk veya font eklenmeyecek.

iPad Safari öncelikli.
TR ve EN eşit kalitede olacak.
Dokunmatik hedefler rahat kullanılacak.
Klavye açıldığında gerekli düğmeler erişilebilir
kalacak.

## Relevant Files

İncelenecek başlıca dosyalar:

src/main.ts
src/ui/kitapSihirbazi.ts
src/ui/kitapSihirbaziDurumu.ts
src/kitap/kitapListesi.ts
src/kitap/kitapPlani.ts
src/ui/panel.ts
src/ui/reader.ts
src/okuma/Okuyucu.ts
src/dil/tr.ts
src/dil/en.ts
src/styles.css
index.html

İlgili mevcut testler ve ekran kontrol betikleri.

Drive kitap ve PDF oluşturma dosyalarını davranışı
anlamak için incele; değiştirmeyi öncelikli çözüm
olarak önerme.

## Requirements

1. Mevcut kitap oluşturma işlevlerini yeniden kullan.
2. Mevcut PDF yükleme işlevlerini yeniden kullan.
3. Kitap ve konu kimliklerini doğru takip et.
4. Kitaplık yenilemesinden sonra yeni kitabı bulma
   ve ilk konuyu açma yolunu doğrula.
5. Hatalı veya yarım kitap oluşturma durumlarında
   otomatik geçiş başlatma.
6. Hızlı ve ayrıntılı mod arasında veri kaybı olmasın.
7. Mevcut kullanıcıların kitaplarına dokunma.
8. Yeni arayüz metinleri tr.ts ve en.ts içinde olsun.
9. Özellik kapatıldığında eski davranış geri gelsin.
10. Yeni işlevler için önce başarısız test yaz.
11. İlgisiz dosyalara dokunma.
12. Eksik bilgi varsa tahmin etmek yerine bildir.

## Do Not

- Google OAuth izinlerini değiştirme.
- Auth ve token yönetimini değiştirme.
- api/ klasörüne dokunma.
- Drive klasör adlarını değiştirme.
- JSON anahtarlarını değiştirme.
- Mevcut kitapları dönüştürme.
- Yeni veritabanı ekleme.
- Yeni Drive yazma/silme yöntemi oluşturma.
- files.delete kullanma.
- Bilinmeyen JSON alanlarını silme.
- Mevcut PDF okuyucusunu yeniden yazma.
- İlgisiz refactor yapma.
- Gizli fikir havuzunu repoya aktarma.
- Kişisel veri veya kimlik bilgisi ekleme.
- .env dosyalarını okuma veya değiştirme.
- git checkout, reset, stash veya force push kullanma.
- Deniz açıkça onaylamadan main'e push yapma.

## Definition of Done

- Hızlı başlangıç penceresi çalışıyor.
- Kitap adı ve ilk konu ile kitap oluşturulabiliyor.
- Ayrıntılı kitap oluşturma özellikleri korunuyor.
- Yeni kitabın ilk konusu doğrudan açılıyor.
- İlk PDF kolayca eklenip otomatik açılıyor.
- Mevcut kitaplığı olan kullanıcı Yeni kitap
  kısayolunu görebiliyor.
- Boş kitaplık yönlendirmesi korunuyor.
- Demo ve girişsiz davranışları değişmiyor.
- ?hizliKitap=0 eski akışı geri getiriyor.
- Mevcut Drive verileri korunuyor.
- TR/EN metinleri ve ekran kontrolleri başarılı.
- iPad Safari ve Windows gerçek cihaz doğrulaması
  için açık deneme adımları hazırlanmış.

## Verification

Önce kırmızı, ardından yeşil test yaklaşımı.

Kontrol senaryoları:
- Boş kitaplık
- Yalnız örnek kitap bulunan kitaplık
- Mevcut kitap ve PDF'leri olan kullanıcı
- Sahip hesabı
- Dar izinli Google hesabı
- Demo modu
- Giriş yapılmamış durum
- Hızlı oluşturma
- Ayrıntılı oluşturma
- Modlar arasında geçiş
- Konusuz ayrıntılı kitap
- Oluşturma hatası / yeniden deneme
- Kitap oluşturma sonrası otomatik açılış
- İlk PDF ekleme ve açma
- PDF seçiminden vazgeçme
- PDF yükleme hatası
- Özellik anahtarını kapatma

Zorunlu kontroller:

npm test
npm run typecheck
npm run build
npm run dil

Mevcut test sayısı referansı: 2196.
Test sayısındaki değişiklikleri açıkla.

Ekran kontrolü:
EN ve TR dillerinde;
390x844
820x1180
1180x820
1280x800

deviceScaleFactor 2.
1280 hariç hasTouch.

İlgili ekran görüntülerini ve rapor.json dosyasını
%USERPROFILE%\iCloudDrive\uni_plan_claude_code\
Claude outputs\A2-hizli-baslangic\
altında üret.

Taşma, yanlış dil, konsol hatası ve dokunmatik
kontrol problemlerini raporla.

Gerçek iPad Safari kontrolünü Playwright ile
yapılmış sayma.

Main'e çıkış öncesinde Claude son kontrolü
yapacak.
