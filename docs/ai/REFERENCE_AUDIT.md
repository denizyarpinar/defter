# Belge geçişi — atıf ve kural kontrolü

1 Kasım 2026. Yalnız belge geçişi; uygulama kodu, testler, betikler ve yapılandırma değiştirilmedi.

## Değiştirilmeden bırakılan eski atıflar

Tarama: docs/DURUM.md veya CLAUDE.md; node_modules/, dist/, .git/, .vercel/ ve docs/ai/arsiv/ hariç. Gizli ortam dosyaları da okunmadı.

Arşiv dışındaki diğer sonuçların tamamı aşağıdadır. Bunlar kod yorumları ve test açıklamalarıdır; eski bölüm ayrıntıları gerektiğinde docs/ai/arsiv/CLAUDE_eski.md içindeki ilgili bölüm okunabilir.

- `src/defter/ayarlar.ts`: satır 3
- `src/defter/bosSayfa.ts`: satır 12
- `src/defter/bosSayfaIsi.ts`: satır 7
- `src/elYazisi/atlasDrive.ts`: satır 7
- `src/drive/altKlasorAc.ts`: satır 9
- `src/defter/konuyaDosyaEkle.ts`: satır 13
- `src/defter/konuyaEkle.ts`: satır 12
- `src/drive/copeAt.ts`: satır 6
- `src/defter/ozeteEkle.ts`: satır 16
- `src/drive/dosyaCop.ts`: satır 13
- `src/defter/yapistir.ts`: satır 10
- `src/defter/sayfaSil.ts`: satır 8
- `src/drive/driveLibrary.ts`: satır 11
- `src/drive/icindekilerCop.ts`: satır 6
- `src/drive/icindekilerYaz.ts`: satır 13
- `src/drive/kitapCop.ts`: satır 12
- `src/drive/kitapOlustur.ts`: satır 11
- `src/drive/kurulum.ts`: satır 12
- `src/kitap/klasorAdi.ts`: satır 32
- `src/drive/ofisCevir.ts`: satır 10
- `src/drive/pdfOlustur.ts`: satır 8
- `src/model/types.ts`: satır 1, satır 75
- `src/model/units.ts`: satır 4
- `src/okuma/kitapSayfalari.ts`: satır 9
- `src/okuma/konuKesfi.ts`: satır 5
- `src/okuma/pdfOnbellek.ts`: satır 5
- `src/okuma/sayfaAraligi.test.ts`: satır 5
- `src/okuma/sanalListe.ts`: satır 2
- `src/okuma/sayfaAraligi.ts`: satır 1
- `src/okuma/silinenSayfaDepo.ts`: satır 4

Toplam: 31 atıf, 30 dosya. Arşivler tarihçeyi korumak için değiştirilmedi.

## Kural çelişkileri ve bu görevin açık istisnaları

- Genel kural görev sonunda CURRENT_STATE güncellemesini ister. Bu görev açıkça yalnız başlık istediği için CURRENT_STATE ve DECISIONS boş başlık olarak bırakıldı; durum/son güncelleyen eklenmedi. Genel güncelleme kuralı AGENTS içinde korundu.
- TASK yoksa plan/onay bekleme ve Deniz denedikten sonra commit kuralları, TASK varsa onaylı görev + Verification sonrası commit olarak güncellendi. Bu geçiş görevinin kendisi açıkça onaylı prompttur; oluşturulan TASK yalnız boş şablondur.
- Kural kaynağı AGENTS, mimari önceliği DECISIONS olarak düzeltildi. Eski Türkçe arayüz/hata kuralı iki dilli olarak güncellendi; diğer değişmez kurallar ve Drive istisnaları korundu.
- Bunların dışında yeni bir kural çelişkisi saptanmadı. Ürün hedefindeki ilk girişte otomatik kurulum, kodda düğmeyle başlatılan mevcut kurulumdan PROJECT ve ARCHITECTURE içinde ayrıldı.

## Doğrulama

- Eski iki belge git mv ile taşındı; taşıma aşamasındaki git status iki R kaydı gösterdi. Arşivlerin HEAD'deki asıllarıyla bayt bayt aynı olduğu doğrulandı.
- Git gösterim farkı: aynı yolda yeni CLAUDE de commit'e eklenince git status onu M, arşivi A gösterir; git diff --cached -B -M ise yüzde 100 kopya olarak tanır. DURUM yüzde 100 rename olarak kalır. Git taşıma işlemini ayrı kaydetmez, içeriklerden karşılaştırma üretir; bu nedenle son staged görünümde iki R şartı sağlanamaz. İki arşiv de içerik kaybı olmadan korunur.
- CLAUDE tek satır @AGENTS.md; tüm yeni/değişen Markdown dosyaları ve arşivler geçerli UTF-8, BOM yok.
- AGENTS 40 satır (sınır 60); ARCHITECTURE 84 satır (hedef en fazla yaklaşık 120). İkisindeki yerel repo yolları mevcut; Drive yolları uzak veri adları olarak ayrıca işaretli.
- Ana mimari iddialar giriş noktası, kimlik doğrulama, Drive okuma/yazma, JSON modeli, PDF açma/çizme, 3D oda, dil tercihi, OCR API ve build kaynaklarından kontrol edildi. Canlı ortam ve cihaz denemeleri doğrulanmamış olarak ayrıldı.
- CURRENT_STATE ve DECISIONS yalnız başlık; TASK yalnız istenen yedi boş bölümden oluşur.
- npm run typecheck ve npm run build başarılı. Uygulama koduna dokunulmadığından yeni test eklenmedi.
