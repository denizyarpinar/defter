# AGENTS.md

Kuralların kaynağı bu dosyadır; mimari çelişkilerde `docs/ai/DECISIONS.md` geçerlidir.
Önce sırayla oku: `docs/ai/PROJECT.md`, `docs/ai/ARCHITECTURE.md`, `docs/ai/CURRENT_STATE.md`, `docs/ai/DECISIONS.md`, `docs/ai/TASK.md`.
Eski belgeler `docs/ai/arsiv/` içindedir; yalnız görev gerektirince ilgili bölümü oku, asla tamamını yükleme. Faz ayrıntıları: `docs/ai/arsiv/CLAUDE_eski.md`.

## Her görevde
1. `git status` temiz mi bak; değilse dur ve Deniz'e sor. Sonra `git pull`.
2. `docs/ai/TASK.md` varsa içindeki görev onaylı plandır; Verification geçince commit at. Yoksa önce kısa plan göster (dosyalar + değişiklikler), Deniz onaylayınca uygula.
3. `.env*` dosyaları ve secret'lar asla yazılmaz, gösterilmez, istenmez; gizli bilgi, API anahtarı veya token repoya konmaz.
4. main'e birleştirme sadece Deniz'in onayıyla.
5. Alınmış kararları (`AGENTS.md`, `docs/ai/DECISIONS.md`, `docs/ai/CURRENT_STATE.md`) onaysız değiştirme.
6. Deneme adreslerini her zaman tam yaz: dar `http://localhost:5173/?kapsam=dar&sahip=0&kurulum=1&olcum=1`, sahip `http://localhost:5173/?kurulum=1&olcum=1`.
7. Görev sonunda `docs/ai/CURRENT_STATE.md`'yi güncelle (durum + sıradaki adım + "Son güncelleyen"; en fazla yaklaşık 40 satır).
8. Oturum/limit bitmek üzereyse bırakmadan önce `docs/ai/CURRENT_STATE.md`'ye "Yarım kalan iş" yaz: yapılan, kalan, değişen dosyalar, sonraki adım. Sonraki oturum önce bu bölümü okur.

## Deniz ile çalışma kuralları
- Deniz ile Türkçe, kısa ve basit konuş; teknik terimi ilk kullanımda bir cümleyle açıkla.
- Büyük kararlarda (yeni kütüphane, veri formatı değişikliği, dosya silme) önce sor.
- Bilmediğini uydurma; söyle ve nasıl öğrenilebileceğini öner. Gereksinim belirsizse veya kararlara aykırıysa dur ve sor, tahmin etme.
- Yalnız `docs/ai/TASK.md`'deki işi yap; ilgisiz refactor/temizlik yapma. Do Not kapsamına veya `docs/ai/DECISIONS.md` ile çelişen hiçbir şeye dokunma.
- Kapsam dışı sorunları sona "Sonra bakılabilir" diye listele.
- Son mesaj basit, kısa Türkçe: yapılanlar (3–5 madde), adım adım deneme, bilinen eksikler ve sıradaki iş.

## Değişmez kurallar
- Aşağıdaki Drive adları/yolları uzak veriyi tanımlar, yerel repo yolu değildir; faz ayrıntıları arşivin ilgili bölümündedir.
- Drive dosyaları kopyalanmaz, taşınmaz, silinmez; Faz 1: yalnız `kitaplik.json` ve `kitap.json` içindeki `kapak` yazılır. Faz 5: Drive'daki `kitaplar/<kitap>/` altında yeni PDF ve PDF sonuna sayfa ekleme izinli.
- Drive'daki `Kitaplık/` içinde `kitaplik.json` yoksa ilk raf/oda değişikliğinde bir kez oluşturulur. Diğer oluşturma istisnaları yalnız Faz 5 PDF, Faz 6.K uygulama kökü/kurulum ve aşağıdakilerdir; başka JSON oluşturulmaz.
- 6.4c: PDF'in klasöründe `<pdf adı>.ocr.json` oluşturulur/güncellenir; appProperties `defter=1`, `defterOcr=1`, `defterOcrKaynak=<pdf id>`.
- 6.4d-3: kitaplık kökünde yalnız `_sistem/el-yazisi/` ve yalnız `el-yazisi-atlas.png`, `el-yazisi-atlas.json` oluşturulur; varsa aynı id güncellenir. Yalnız kullanıcı `atlas-yukle.html` geliştirme sayfasında düğmeye basınca.
- Atlas öğelerinde appProperties `defter=1`, `defterSistem=1`; çift varsa en eskisi. İşaretsiz aynı ad varsa hata, hiçbir şey yazılmaz. `_` ile başlayan klasörler kitap değildir; kitaplıkta/aramada görünmez (`src/model/gizliKlasor.ts`).
- Yazmadan önce dosyanın son halini oku; başka cihazda değişmiş olabilir.
- Erişim token'ını localStorage'a yazma; bellekte tut. `.env.local` git'e girmez.
- Arayüz ve hata metinleri src/dil/ üzerinden iki dilli (tr.ts kaynak, en.ts), kod içi isimler İngilizce. Hata metni kullanıcıya ne yapacağını söyler.
- iPad: pixel ratio en fazla 2, gölge haritası en fazla 2048; sahne değişmiyorsa render etme.

## Git ve bitirme
- Bitirmeden önce `docs/ai/TASK.md` Verification kontrollerini çalıştır; ayrıca `npm run typecheck` ve `npm run build` hatasız geçmeli.
- Verification geçince açık ve Türkçe açıklayıcı mesajla commit at; `docs/ai/TASK.md`'yi anlattığı işle birlikte commit et. TASK yoksa görev bitip Deniz denedikten sonra commit at.
- Commit öncesinde `git status` ile değişenleri Deniz'e göster; görev sonunda durum belgesini 7. maddeye göre güncelle.
