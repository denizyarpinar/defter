# TASK – 6.6-3b: Konuyu başka üniteye sürükleyip taşıma (Drive klasör taşıma + Geri al)

Onaylı plan (planlayıcı: Claude, 2 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-3. Deniz kararı S3 = A (telefon ana ekranı gibi: satırı kaldır, başka ünitenin içine bırak). Başlangıç: 6.6-3a canlı (2360b1d + docs commit'i). Bu bir **Drive/veri değişikliği**: ek kontrol + geri alma planı zorunlu (AGENTS.md).

**İki aşama:** Önce AŞAMA 0 (keşif raporu, kod yok) → Claude onaylar → AŞAMA 1 (kod). Aşama 0'ın sonunda dur.

## Goal
Düzenle modunda bir konu, tutamacından tutulup başka bir ünitenin konu listesine (ya da boş/kapalı ünitenin başlığına) bırakılınca o üniteye taşınsın: Drive'da konu klasörü yeni ünite klasörünün altına geçsin, kitap.json'da konu yeni ünitede bırakılan sıraya girsin. Bitince "Taşındı · Geri al" bildirimi; Geri al her şeyi eski haline koysun. Yarıda kalırsa "Tekrar dene" kaldığı yerden sürsün, "Vazgeç" klasörü eski yerine koysun.

## Context (kod okundu)
- 3a: `ui/icindekilerDuzenle.ts` sürükleme (dragStart/dragPaint/dragEnd, `ciz` ertelemesi), `ui/surukleDurumu.ts` (`surukleHedefi(..., unite)` 3b için hazır), `siraDegistir`.
- Konu anahtarı = `topicKey(klasor, baslik)` = klasör YOLU (`Unite-01-A/Konu-03-B`). Taşıma yolu değiştirir → anahtar değişir.
- Konu numaraları kitap boyunca tek sayaç (`klasorNumarasi.ts`: Unite-02, Konu-03 ile başlar) → taşınan `Konu-05-…` yeni ünitede de benzersizdir.
- Kuyruk: `drive/icindekilerYaz.ts` (islemId, tekrar dene, Vazgeç, `oncesi` ile diğer kitap.json yazıcıları önce). En yakın örnek: `drive/icindekilerCop.ts` + `kitap/copeAt.ts` (adım bayrakları `jsonTamam/klasorTamam`, `Cikan`, kurdele null/geri, `geriAlIsi`, `yonlendir`). Başlıktaki "No move, no rename in Drive" kuralı bu adımda bilinçli olarak yalnız konu klasörü TAŞIMA için gevşer.

## Teknik kararlar (planlayıcı)
- D1 Klasör ADI değişmez, yalnız ebeveyni: `files.update(konuKlasorId, addParents=hedefUniteId, removeParents=kaynakUniteId)`. Neden: Konu-NN kitap boyunca benzersiz; yeniden adlandırma ikinci bir riskli adım olurdu ve ad zaten ekranda görünmüyor (görünen ad kitap.json'da). (Plandaki "Konu-NN düzelt" maddesi bu kararla düşer.)
- D2 Sıra: (1) klasör + ebeveyn zinciri kontrolü (`ebeveynGecerliMi`/`zincirKontrol` deseni; hedef ünite klasörü bu kitabın klasörünün çocuğu olmalı) → (2) Drive'da taşı (zaten hedefteyse = yapılmış say) → (3) kitap.json: konuyu kaynak üniteden çıkar, `klasor` yolunu `<hedefUniteKlasor>/<KonuKlasorAdi>` yap, hedef ünitede verilen sıraya koy; `kurdele.konu` eski yolu gösteriyorsa yeni yola çevir. Her adım bayrakla işaretli (`klasorTamam`, `jsonTamam`), "Tekrar dene" kaldığı yerden.
- D3 Yeni istek türü `{ tur: 'konuTasi'; tasi: TasiIsi }` (CopIsi gibi tek nesne, adım bayrakları + `geriAl`). Saf kısım `kitap/konuTasi.ts`: `jsondaTasi(tutucu, eskiAnahtar, hedefUniteAnahtari, hedefSira, yeniYol)` ve tersi; kitap.json ham nesnesi ve bellekteki kitap için aynı kod (copeAt deseni), bilinmeyen alanlar korunur.
- D4 Geri al = aynı iş ters yönde (hedef→kaynak, eski sıraya, eski yola, kurdele geri). Vazgeç (Drive adımından sonra, json'dan önce kesildiyse) = klasörü eski ebeveynine geri koy. Bildirim: mevcut toast + "Geri al" (çöp akışındaki gibi).
- D5 Yerel anahtarlar: konu yoluna bağlı her yerel kayıt (localStorage/IndexedDB/bellek önbelleği: okuma kaydı, sayfa önbelleği, Temiz yazı/OCR önbelleği, silinen sayfa deposu, kurdeleler, arama dizini vb.) AŞAMA 0'da listelenir; her biri için "yeni anahtara taşı" ya da "geçersiz kıl (yeniden okunur)" kararı rapora yazılır. Drive'daki dosyalar (.ocr.json, kalem notları, Ozetler/, Uebungen/) klasörle birlikte taşınır, dokunulmaz.
- D6 Engeller (taşıma başlamaz, durum satırında neden): konunun bekleyen kalem/fotoğraf/dosya kaydı ya da kuyrukta bekleyen içindekiler işi varsa; hedef ünitenin klasörü bilinmiyorsa (`uniteKlasoru` boş); konu ya da ünite çöpe gidiyorsa / ekleniyorsa; kitap surum 1 ya da kitap.json yoksa.
- D7 Açık konu taşınırsa okuyucu yeni yola yönlenir (`yonlendir` / `yerDegisti` deseni), kurdele ve sayfa korunur.
- D8 Arayüz (S3 = A): konu sürüklenirken diğer ünitelerin konu listeleri de hedeftir; işaretçi başka ünitenin üstüne gelince o ünite hafif vurgulanır (mevcut vurgu rengi), satırlar orada kayarak yer açar; boş ya da tek satırlık ünitede başlığa bırakmak = sona ekle. Bırakınca satır yeni yerinde "Taşınıyor…" (Ekleniyor… gibi) gösterir, iş bitince normal olur. Ünite sürüklemesi ve aynı ünite içi sıra 3a'daki gibi kalır.
- D9 Kilit (DECISIONS D13): `const KONU_TASI = false` + adreste `?konuTasi=1`. Kilit kapalıyken başka üniteye bırakma 3a gibi davranır (kendi ünitesine sınırlı). Deniz denemesinden sonra main çıkışında `true`.
- D10 Diğer cihaz: eski kitap.json'u tutan başka cihaz/sekme eski yolu açarsa "konu bulunamadı" yerine kitap yeniden yüklensin (mevcut yönlendirme/yenileme yolu varsa onu kullan; yoksa raporla, ayrı iş).

## AŞAMA 0 – Keşif raporu (kod değişmez)
Şunları kısa listele ve DUR:
1. Konu klasör yolunu (`Topic.klasor` / `topicKey`) anahtar olarak kullanan HER yer (dosya:satır, ne sakladığı, yerel mi Drive mı) ve D5 için önerin (taşı / geçersiz kıl).
2. Okuyucu bir konunun dosyalarını yoldan mı (klasör adlarını gezerek) yoksa klasör id'sinden mi buluyor? Taşımadan hemen sonra açmak için ne gerekiyor?
3. OAuth kapsamı (`drive/kapsam.ts`): `files.update` addParents/removeParents elle yüklenmiş (uygulamanın oluşturmadığı) klasörlerde çalışır mı? Çalışmıyorsa hangi hata, kullanıcıya ne gösterilmeli?
4. Bekleyen kayıt kontrolü (D6) için hangi kuyruklara bakılmalı (kalem kuyruğu, foto, dosya ekleme, sayfa işleri)?
5. Önerdiğin dosya listesi ve tahmini test sayısı. Kararlarla çelişen bir şey görürsen yaz.

## AŞAMA 1 – Requirements (Claude'un onayından sonra)
1. `kitap/konuTasi.ts` saf (D3) + testler: ham json ve bellek aynı sonuç; bilinmeyen alanlar korunur; kurdele çevrilir/geri; hedef sıra; tekrar uygulama değişiklik yapmaz; ters işlem birebir eski hal; ünitenin `klasor` alanı yoksa (yolundan çıkarılan) son konu gidince `klasor` yazılır (copeAt'teki kural).
2. `drive/icindekilerYaz.ts` + yeni `drive/konuTasiYaz.ts`: D2 adımları, zincir kontrolü, zaten hedefteyse atla, Tekrar dene, Vazgeç (D4), Geri al. Sahte Drive testleri: normal, ağ hatası her adımda + tekrar dene, Vazgeç klasörü geri koyar, Geri al, izin hatası, hedef ünite başka kitapta → red, aynı islemId ile ikinci deneme çift taşımaz.
3. Arayüz D8 + engeller D6 + kilit D9; metinler `src/dil` TR + EN ("Taşınıyor…"/"Moving…", "Taşındı"/"Moved", "Geri al"/"Undo", engel nedenleri). 
4. D5 yerel anahtarlar Aşama 0'da onaylanan biçimde; D7 açık konu yönlendirmesi.

## Do Not
- `files.delete` yok; klasör/dosya ADI değişmez (Unite-NN, Konu-NN, orijinal.pdf, ozet.pdf, Ozetler, Uebungen, Oedevler, kitap.json); JSON anahtarları ve kitap.json biçimi değişmez (yalnız mevcut `klasor` değeri ve konunun yeri).
- Ünite taşıma (ünite başka kitaba) ve konuyu başka KİTABA taşıma yok.
- Kalem/girdi, auth, kaydedici akışı değişmez. Yeni renk/gölge icat etme.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. Commit atma, main'e push etme (Deniz söyleyince).

## Definition of Done
- `?konuTasi=1` ile: konu başka üniteye bırakılınca Drive'da klasör yeni ünite klasörünün altında, kitap.json'da yeni ünitede doğru sırada; sayfa yenileyince aynı; konunun özeti, Übungen'i, kalem notları, Temiz yazı/OCR ve kurdelesi yerinde.
- Geri al tam eski hal. Ağ kesintisinde Tekrar dene ve Vazgeç doğru. Kilit kapalıyken 3a davranışı.
- İkinci (temiz) hesapla: 3 konu taşıma + 1 Geri al + 1 yarıda kesip Tekrar dene.
- Testler, typecheck, build, `npm run dil` (0), `dil:ekran` taşma 0.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`, `npm run dil:ekran`.
- Derlenmiş uygulama + sahte Drive, Playwright 390×844 (dokunma) ve 1180×820 (fare), EN + TR: konuyu başka üniteye taşı, boş üniteye taşı, Geri al, ağ hatası + Tekrar dene, Vazgeç.
- Sonunda göster: değişen dosyalar, test sayısı, `git status`, laptop + iPad deneme adımları (`?konuTasi=1`).

## Ek kontrol + geri alma
- Kontrol: Claude diff'i okur (Drive'a giden tek yeni yazma `files.update` addParents/removeParents; delete/rename yok; adım bayrakları yarıda kesilmede tutarlı; kurdele ve yerel anahtarlar). Deniz önizlemede ikinci hesapla dener, sonra kendi gerçek kitabında bir konuyla.
- Geri alma: (1) `KONU_TASI = false` → yeni taşıma durur, sıralama (3a) çalışır. (2) Taşınmış konular kendi kitap.json'ları ve klasörleriyle tutarlı kalır; elle düzeltme gerekmez. (3) Gerekirse commit `git revert`; Drive'daki taşınmış klasörler yeni ünitelerinde kalır ve kitap.json onları doğru gösterir.
- Main çıkışında `docs/ai/DECISIONS.md` sonuna: `D31 – Konu taşıma (6.6-3b, 2 Kasım 2026): konu başka üniteye yalnız klasörün ebeveyni değiştirilerek taşınır, klasör adı (Konu-NN) değişmez; sonra kitap.json yolu güncellenir. Neden: Konu-NN kitap boyunca benzersiz, yeniden adlandırma ek risk.`

## AŞAMA 0 sonrası kararlar (Claude, 2 Kasım 11:10) – Aşama 1 bunlarla yapılır
- K1 D12 çelişkisi: Aşama 1'in İLK işi `docs/ai/DECISIONS.md`'yi güncellemek. D12 metnindeki "kopyalama/taşıma yok" → "kopyalama yok; taşıma yalnız D31". Sona D31: `D31 – Konu taşıma (6.6-3b, 2 Kasım 2026): konu başka üniteye yalnız klasörün ebeveyni değiştirilerek (addParents/removeParents) taşınır, klasör adı (Konu-NN) değişmez; sonra kitap.json yolu güncellenir. Kilit KONU_TASI / ?konuTasi=1. Neden: Konu-NN kitap boyunca benzersiz, yeniden adlandırma ek risk.` (Kilit kalkınca main çıkışında yalnız "Kilit" cümlesi silinir.)
- K2 Gerçeğin kaynağı = Drive'daki klasörün ebeveyni. Taşıma başlarken iş kaydı (islemId, kitapId, konuKlasorId, kaynak/hedef ünite id + yol, eski/yeni yol, hedef sıra, yön) localStorage'a `defter-konu-tasi` altında yazılır; bitince silinir. Kitap açılırken/düzenle modu açılırken kayıt varsa TOPARLA: klasörün gerçek ebeveynini Drive'dan oku → kitap.json'u ona uydur (hedefteyse ileri tamamla; kaynaktaysa kaydı sil, json'a dokunma). Sekme kapanması bu yolla kapanır. Toparlama da aynı kuyruktan geçer, testli.
- K3 D6 daraltıldı: kalem, fotoğraf, OCR/Temiz yazı ve sayfa önbellekleri dosya/klasör KİMLİĞİYLE çalıştığı için engel DEĞİL. Engel yalnız yola bağlı işler: (a) içindekiler kuyruğu boş değil (çöp/geri al dahil), (b) okumaKaydi kaydedilmemiş değişiklik → önce flush; başarısızsa engel, (c) bu konuda çalışan ya da IndexedDB'de yarım sayfa işi (bosSayfaIsi/sayfaIsiDepo), (d) bu konuda çalışan dosya ekleme (konuyaDosyaEkle kilidi; dışarı küçük bir `mesgulMu(konuKlasorId)` aç). Durum okunamazsa engel. Taşıma sürerken bu konuya yeni sayfa işi/dosya ekleme başlamaz (düzenle modu açıkken zaten okuyucu arkada).
- K4 Yerel kayıtlar: okumaYamasi/okumaDurumu, açık konu konumu, reader dayanağı, içindekiler yönlendirmeleri, silinenSayfaDepo içindeki yol → YENİ YOLA TAŞI (silme yok). kaynakCoz/konu materyal önbelleği ve arama ağacı → GEÇERSİZ KIL (bulunamadı sonucu dahil). Geri al aynı işlemleri ters yönde yapar. Taşıma yardımcısı tek yerde (`kitap/konuTasi.ts` içinde `yolCevir(eski, yeni)` ya da ayrı küçük modül) ve testli.
- K5 İzin: 403 appNotAuthorizedToFile / 404 → iş durur, hiçbir şey yazılmaz, durum satırında "Bu klasöre erişilemiyor; kitaplığı yenileyip tekrar dene." (TR/EN). Sahip dar kapsamdaysa mevcut "Tam erişimi aç" seçeneği gösterilir. Picker akışı kapsam dışı.
- K6 D10 (eski kitap.json'lu başka cihaz) bu adımın dışında; CURRENT_STATE "Açık riskler"e bir satır yazılır.
- K7 Açık konu taşınırsa okuyucu `openTopic` yerine yerinde yol güncellemesiyle aynı materyal + dosya + sayfada kalır (yeniden açma gerekiyorsa sayfa korunarak).
- Test hedefi Codex tahmini kadar (60–80); kaybolan taşıma yanıtı (Drive taşıdı ama cevap gelmedi → tekrar dene "zaten hedefte"), sekme kapanıp toparlama, Geri al, Vazgeç, başarısız okuma flush'ı mutlaka.
