# TASK – Özet eki: "Ayrı özet olarak ekle / Aynı özete ekle" (EK-3)

Başlangıç: main (E-1 commit'inden sonra). İstek: Deniz, 3 Kasım 2026.

## Goal
Claude konu klasörüne `ozet-ek*.pdf` koyunca Özet sekmesinde çıkan bant (6.EK-2) bugün yalnız "Ekle" (ekin sayfaları özetin SONUNA) ve "Sonra" sunuyor. Birden fazla özet tek PDF'te birleşince 100 sayfayı buluyor; Deniz seçiciyle ayrı açmak istiyor (D30 çoklu özet zaten var: `Ozetler/<ad>.pdf`).
- Konunun özeti VARSA bant: **Ayrı özet olarak ekle** · **Aynı özete ekle** · Sonra.
  - Aynı özete ekle = bugünkü "Ekle" (davranış aynen).
  - Ayrı özet olarak ekle = ekin baytları `Ozetler/<ad>.pdf` olarak yeni dosya; bitince okuyucu bu dosyayı seçicide açar.
- Konunun özeti YOKSA (bugün K3: ilk ek salt okunur özet gibi görünür, bant çıkmaz): bant tek düğme **Ekle** · Sonra → ek `ozet.pdf` olarak kopyalanır; artık kalemle yazılabilir.

## Context
- `src/defter/ozetEkBandi.ts`: saf karar (`bantKarari`, `ekDurumu`, `ekIslemId`, `siradakiEk`, `pdfLibYuklensinMi`). Özet yoksa `gizli`.
- `src/okuma/Okuyucu.ts`: `ekBandi`, `ozetIsaretleri`, `ekSeridiCiz`, `ekEkle` (~1600–1700). `gecerli()` yalnız `ozet|brifing|sorular.pdf` ilk dosyada bandı açar.
- `photoBox.ekSeritGoster(...)` (ui/fotoDurum.ts ya da fotoPanel.ts): bant arayüzü; `ekle`/`sonra` geri çağrıları.
- `src/defter/konuyaDosyaEkle.ts`: `konuyaDosyaEkle` hedefleri `'ozet'` (yeni ozet.pdf), `'yeniOzet'` (Ozetler/<ad>, klasörü açar), `{ ozetSonu }`. islemId → `appProperties.defterIslem`; aynı islemId'li dosyayı bulan tekrar "yapıldı" sayılır. `yeniOzet` adı `ozet-ek`/`_cozum` ile başlayamaz (AdOzetGibi).
- `src/okuma/konuKesfi.ts`: `classifyTopic`, `ozetEkleri`, `gercekOzet`, `discoverTopic` (kök + Ozetler listesi).
- `src/okuma/ekSahte.ts`: `?ekSahte` deneme sahtesi.

## Kararlar (Claude)
- K1 Ayrı ekleme `konuyaDosyaEkle({ hedef: 'yeniOzet', ad, bytes, islemId: ekIslemId(file) })`; özet yokken `hedef: 'ozet'`, aynı islemId. Neden: klasör açma, aynı ad, tekrar deneme orada hazır ve testli.
- K2 "Bu ek eklendi mi?" iki kaynaktan: özetteki /DefterEkId işaretleri (bugünkü) **veya** kökte / Ozetler'de `appProperties.defterIslem === ekIslemId` olan dosya. Biri varsa o ek `gizli`. Listede appProperties gelmiyorsa `listChildren` alanlarına `appProperties` eklenir (yalnız okuma). Neden: her cihaz görür, ek kayıt tutulmaz (6.EK-1 ilkesi).
- K3 `guncellendi` (ekin içeriği değişti) durumunda da iki düğme sunulur; eski sürüm ayrı eklendiyse bu da `appProperties.defterIslem` öneki (`ozet-ek-<id>-`) ile anlaşılır.
- K4 Ad türetme (saf fonksiyon, `ozetEkBandi.ts`): `ozet-ek-2-relationen.pdf` → `relationen.pdf`; `ozet-ek_x.pdf` → `x.pdf`; önek atılınca boşsa (`ozet-ek.pdf`, `ozet-ek-3.pdf`) → `ozet-<n>.pdf` (n = Ozetler'deki dosya sayısı + 2). Ozetler'de aynı ad varsa `-2`, `-3` … eklenir (büyük/küçük harf duyarsız). Sonuç `dosyaAdiHazirla`'dan geçer.
- K5 Özet yokken bant: `ekBandi`'nin `gecerli()` koşulu, okuyucu ilk ek dosyasını özet olarak gösterirken de bandı açar; `ozetIsaretleri` çağrılmaz (işaret yok), yalnız K2'nin appProperties kontrolü yapılır. Bant yalnız sıradaki (adına göre ilk) ek için; `ozet.pdf` oluşunca diğer ekler normal iki düğmeli banda geçer.
- K6 Bitince: ayrı → `afterFileAdded(t, 'yeniOzet', r)`, özet yok → `afterFileAdded(t, 'ozet', r)` (Dosya ekle panelinin yolu); toast `eklendiMetni`. Hata bantta "Tekrar dene" ile kalır, aynı islemId.
- K7 Ek dosyası Drive'da kalır, hiç yazılmaz/silinmez/taşınmaz (AGENTS).
- K8 Metinler (tr.ts kaynak, en.ts): `ek.ayriEkle` "Ayrı özet olarak ekle" / "Add as separate summary"; `ek.ayniEkle` "Aynı özete ekle" / "Add to this summary"; `ek.ekle` "Ekle" / "Add". Dar ekranda (≤600 px) düğmeler iki satıra inebilir ama taşmaz.
- K9 Kilit: `ozetEkBandi.ts` başında `export const EK_AYRI = true;`, `?ekAyri=0` bandı eski haline döndürür (tek "Ekle" = sona ekle; özet yokken bant yok).
- K10 `?ekSahte` sahtesi üç durumu gösterebilsin: özet var (iki düğme), özet yok (tek Ekle), ayrı eklenmiş (bant gizli).

## Relevant Files
- src/defter/ozetEkBandi.ts, src/defter/ozetEkBandi.test.ts
- src/okuma/Okuyucu.ts (yalnız ek bandı bölümü)
- src/ui/fotoDurum.ts / src/ui/fotoPanel.ts (ekSeritGoster: ikinci düğme)
- src/okuma/ekSahte.ts
- src/drive/drive.ts (yalnız gerekirse listChildren alanlarına appProperties)
- src/dil/tr.ts, src/dil/en.ts; src/styles.css (az)

## Requirements
1. K1–K10'u uygula.
2. Testler (önce yaz, kırmızı gör, sonra yeşil):
   - bantKarari: özet var + işaret yok → `goster`; özet yok + ek var → yeni durum (ör. `ozetYok`) gösterilir; appProperties.defterIslem eşleşmesi → `gizli`; eski sürüm appProperties'te → `guncellendi`.
   - Ad türetme: yukarıdaki örnekler, çakışmada `-2`, `-3`.
   - EK_AYRI kapalı → bugünkü kararlar aynen.
   - Mevcut ozetEkBandi / konuyaDosyaEkle / dosyaPanelDurumu testleri değişmeden geçer.
3. TR/EN anahtarları ekle; `npm run dil` 0.

## Do Not
- "Dosya ekle" panelini, `{ ozetSonu }` yolunu, /DefterEkId biçimini değiştirme.
- Drive klasör/dosya adlarını (Ozetler, ozet.pdf, ozet-ek*) değiştirme; ek dosyasına yazma.
- Yeni paket ekleme. `git checkout`/`reset`/`stash`, push yapma.

## Definition of Done
- Özetli konuda ek bandı iki seçenek sunar; "Ayrı" yeni dosyayı seçicide açar, "Aynı" bugünkü gibi sona ekler; eklenen ek her iki yolda da başka cihazda bir daha sorulmaz.
- Özetsiz konuda "Ekle" ozet.pdf oluşturur, kalem çalışır.
- Tüm testler + typecheck + build + `npm run dil` geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`.
- Playwright `?ekSahte` ile 390×844, 1180×820, 1920×1080 × EN/TR: bant tek satır ya da düzgün iki satır, taşma yok. Ekran görüntüleri `C:\Users\yarpi\Projeler\defter-test-dosyalari\ek-ayri\`.
- Sonunda göster: değişen dosyalar, test sayısı, typecheck/build/dil, `git status`, laptop + iPad deneme adımları (gerçek Drive: Mathe 1 bir konuya `ozet-ek-1-deneme.pdf` koyulacak, Claude koyar).
