# TASK – 6.6-2: Bir konuya birden çok özet (Übungen gibi seçici)

Onaylı plan (planlayıcı: Claude, 2 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-2. Deniz kararı S2 = A (Übungen'deki gibi seçici; 2. özet eklenince sayfa sayısı uzamasın). Başlangıç: main = faz-6 = d7a6746 (6.6-6 canlı).

## Goal
Bir konuya ikinci, üçüncü özet ayrı PDF olarak eklenebilsin. Özet sekmesinde Übungen'deki gibi dosya seçici çıksın, seçilen özet tek başına açılsın. Eski kitaplar aynen çalışsın (ozet.pdf yerinde kalır, taşıma yok).

## Context (kod okundu)
- `okuma/konuKesfi.ts classifyTopic`: özet = kökte `ozet.pdf` (yoksa brifing.pdf + sorular.pdf, o da yoksa ilk ozet-ek). Uebungen/Oedevler alt klasörden `pairSolutions` ile.
- `Okuyucu.ts showMaterial`: Übungen/Ödevler `fileIndex` ile tek dosya; özet ise `t.materials.ozet` dosyalarının HEPSİNİ tek akışta birleştiriyor. Seçici `#oFiles/#oFile` yalnız uebungen/oedevler için (`showSelectedTab`).
- `defter/konuyaDosyaEkle.ts`: özet varsa "Özet" hedefi = `{ ozetSonu }` (sayfalar sona, 6.S-3); yoksa yeni `ozet.pdf`. Alt klasör `drive/altKlasorAc.ts` (`AltKlasor = 'Uebungen' | 'Oedevler'`).
- `defter/konuyaEkle.ts ozetKarari(kok)` yalnız kök listesine bakıyor; foto ekleme ve `sonaEkle` hedef kontrolü bunu kullanıyor.
- `defter/dosyaPanelDurumu.ts` + `ui/dosyaPanel.ts`: hedef satırları, "Hangi özet" seçimi zaten var.

## Teknik kararlar (planlayıcı)
- D1 Yer: yeni özetler `Ozetler/<ad>.pdf` (konu klasörünün alt klasörü, Uebungen ile aynı desen). İlk özet `ozet.pdf` olarak kalır. Neden: altKlasorAc/pairSolutions yeniden kullanılır, eski veri taşınmaz. kitap.json DEĞİŞMEZ.
- D2 Keşif: `discoverTopic` `ozetler` alt klasörünü de listeler (Uebungen/Oedevler ile paralel, +1 istek yalnız klasör varsa). `classifyTopic(root, uebungen, oedevler, ozetler = [])`: özet listesi = bugünkü asıl özet(ler) + Ozetler PDF'leri (ada göre, `byName`). `_cozum.pdf` ve `ozet-ek*` Ozetler içinde özet sayılmaz.
- D3 Okuyucu: `topic.materials.ozet.length > 1` iken özet de `fileIndex` ile TEK dosya açar ve `#oFiles` seçicisi görünür (Übungen'deki aynı select, dosya adı .pdf'siz). 1 dosyada seçici gizli (bugünkü görünüm). Not: eski brifing + sorular konuları da artık seçiciyle iki ayrı dosya olur (bilinçli, tutarlı). Saf yardımcı ör. `secimliTur(kind, m)`: uebungen/oedevler her zaman, ozet yalnız >1.
- D4 Kurdele: Übungen gibi tür başına tek kurdele (`kurdeleler.ozet = { dosya, sayfa }`); `dosya` hangi özet dosyasının açılacağını seçer (`kurdeleSecimi` özet için de fileIndex döndürür). Dosyası yoksa ilk özet. Neden: veri biçimi aynı kalır.
- D5 Dosya ekle paneli, konuda özet VARKEN iki satır: **"Yeni özet (ayrı dosya)"** varsayılan, ad kutusu Übungen gibi (aynı ad kontrolü tüm özet dosyalarına karşı; `_cozum` ve `ozet-ek` ile başlayan ad reddedilir) → `Ozetler/<ad>.pdf`, klasör yoksa `altKlasorAc` ile açılır (`AltKlasor`a `'Ozetler'`, umlaut eşdeğeri `özetler`). **"Mevcut özetin sonuna"** ikinci satır = bugünkü `ozetSonu` yolu (6.S-3, değişmeden; çok özette "Hangi özet" seçimi aynı). Konuda özet YOKKEN bugünkü gibi yeni `ozet.pdf`.
- D6 Hedef kontrolleri: `ozetKarari`/`ozetDurumu` Ozetler alt klasörünü de sayar (async yolda Ozetler varsa listelenir). Böylece foto ekleme ve `sonaEkle` Ozetler dosyalarına da yazabilir (yoksa `HedefOzetDegil`).
- D7 Fotoğraf paneli: değişmez; sayfalar ekrandaki/seçilen özetin sonuna gider (bugünkü `hedefFileId`).
- D8 6.EK ek bandı yalnız asıl özet (fileIndex 0, kökteki dosya) açıkken; Ozetler dosyalarında bant yok.
- D9 Eklendikten sonra "Göster": yeni özet → Özet sekmesi + o dosya seçili (`dosyaGosterHedefi` Ozetler'i tanır). `showAdded` (sayfalar sona) `fileIndex = 0` yerine hedef dosyanın indeksini kullanır.
- D10 Kilit (DECISIONS D13): `const COKLU_OZET = false` + adreste `?cokluOzet=1`. Kilit kapalıyken panel bugünkü gibidir (yalnız "sonuna"); OKUMA (keşif, seçici, kurdele) kilitten bağımsız hep açık. Deniz denemesinden sonra main çıkışında `true` yapılır.

## Relevant Files
`src/okuma/konuKesfi.ts`, `src/okuma/Okuyucu.ts` (showMaterial, showSelectedTab, buildTopicPages, pageCache, showAdded, showAddedFile, ek bandı), `src/okuma/bosKonu.ts` (kurdeleSecimi), `src/defter/konuyaDosyaEkle.ts`, `src/defter/konuyaEkle.ts`, `src/defter/dosyaPanelDurumu.ts`, `src/ui/dosyaPanel.ts`, `src/drive/altKlasorAc.ts`, `src/kitap/dosyaCop.ts` (Ozetler dosyası çöpe: Übungen dosyası gibi), `src/arama/*` (arama sonucu Ozetler dosyasını doğru sekme + dosyayla açsın, gerekiyorsa), `src/dil/tr.ts` + `en.ts`. Testler mevcut yanlarına.

## Requirements
1. Keşif + sınıflama (D2), eski konular birebir aynı sonuç (mevcut testler geçer).
2. Okuyucu seçici, tek dosya açma, sayfa önbelleği anahtarı yalnız açık dosya (D3); kitap modu, kalem, Temiz yazı, OCR, sayfa ekle/sil, arama açık dosyada bugünkü gibi çalışır.
3. Kurdele (D4); kaldığı yer dil dönüşü ve yeniden açılışta doğru dosya + sayfa.
4. Panel iki seçenek + ad kutusu + Ozetler klasörü açma (D5, D6, D10). Aynı islemId ile tekrar deneme ikinci klasör/dosya yapmaz (mevcut desen).
5. Metinler iki dilde: TR "Yeni özet (ayrı dosya)", "Mevcut özetin sonuna"; EN "New summary (separate file)", "Add to the end of a summary". 6.5 dar ekran kuralları geçerli.
6. Testler: classifyTopic (Ozetler, cozum/ek hariç, sıralama, eski konu aynı); secimliTur; kurdeleSecimi özet dosyası; hedefSecenekleri/adDurumu/dosyaHedefi/islemAnahtari yeni satırla (kilit açık/kapalı); konuyaDosyaEkle → Ozetler/<ad>.pdf, klasör yokken açar, aynı ad → AyniIsimVar, tekrar deneme; ozetKarari Ozetler dosyasını hedef kabul eder; foto ekleme Ozetler dosyasının sonuna; altKlasorAc 'Ozetler' + 'Özetler' adı farklı uyarısı. Tüm mevcut testler geçer.

## Do Not
- `ozet.pdf`'i taşıma/bölme/yeniden adlandırma; mevcut uzun özetleri bölme YOK.
- kitap.json biçimi, Drive klasör adları (Uebungen, Oedevler, Unite-NN, Konu-NN, orijinal.pdf, ozet.pdf), JSON anahtarları değişmez. `files.delete` yok.
- Fotoğraf panelinin akışı, kalem kuyruğu, kaydedici, auth değişmez.
- Yeni stil icat etme: seçici Übungen'deki `#oFiles` ile aynı.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. main'e push etme. Commit atma (Deniz söyleyince).

## Definition of Done
- `?cokluOzet=1` ile: özeti olan konuya "Yeni özet" → Drive'da `Ozetler/<ad>.pdf`, Özet sekmesinde seçici, iki dosya ayrı açılır, ilk özetin sayfa sayısı değişmez.
- "Mevcut özetin sonuna" bugünkü gibi çalışır. Kilit kapalıyken panel bugünkü gibi.
- Laptop + iPad: seçiciyle geçiş, kurdele, kalemle yazma ve fotoğraf ekleme Ozetler dosyasında kaydolur.
- Testler, typecheck, build, `npm run dil` (0) geçer.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`, `npm run dil:ekran` (Özet sekmesinde seçici, 390×844 ve 1180×820, EN + TR, taşma 0).
- Derlenmiş uygulamada sahte Drive ile: yeni özet ekle → seçici → geçiş → kurdele.
- Sonunda göster: değişen dosyalar, test sayısı, `git status`, laptop + iPad deneme adımları (`?cokluOzet=1`).

## Ek kontrol + geri alma (Drive yapısı değişikliği)
- Kontrol: Claude diff'i okur (eski konu sınıflaması aynı, yazma yalnız Ozetler altında ve kilitli, ozetKarari değişikliği foto yolunu bozmuyor). Deniz önizlemede gerçek bir konuda dener.
- Geri alma: `COKLU_OZET = false` (yeni yazma durur, okuma kalır) ya da commit'i `git revert` (Ozetler dosyaları Drive'da kalır, kaybolmaz; yalnız okuyucuda görünmez).
- Main çıkışında `docs/ai/DECISIONS.md` sonuna ekle: `D30 – Birden çok özet (6.6-2, 2 Kasım 2026): ilk özet konu klasöründe ozet.pdf; sonrakiler Ozetler/<ad>.pdf, okuyucuda seçiciyle ayrı açılır. Neden: özet uzamasın, Uebungen deseni yeniden kullanılsın.`
