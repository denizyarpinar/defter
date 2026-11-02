# TASK – 6.6-3a: İçindekilerde sürükle-bırak (aynı ünite içi + ünite sırası)

Onaylı plan (planlayıcı: Claude, 2 Kasım 2026). Kaynak: `FAZ6_6_PLAN.md` 6.6-3. Başlangıç: main = faz-6 = 74cff85 (6.6-2 canlı). Bu adım yalnız SIRA değiştirir; konuyu başka üniteye taşıma 6.6-3b'dir (ayrı TASK, Drive klasör taşıma).

## Goal
Düzenle modunda konu ve ünite satırları ↑ ↓ yerine tutamaçtan (⠿) sürüklenerek sıralansın: satır kalkar, parmağı/fareyi izler, diğerleri kayarak yer açar, bırakınca yeni sırada kalır. Konu yalnız kendi ünitesinde; ünite başlığı tüm üniteyi taşır.

## Context (kod okundu)
- `src/ui/icindekilerDuzenle.ts` (`IcindekilerDuzenleyici`): `ciz()` listeyi `innerHTML` ile çizer; satırlar `.ie-unite > .ie-satir.ie-ubas` ve `ol > li.ie-satir`. ↑ ↓ = `data-yukari/asagi="u0" | "k0.1"` → `tasi(yer, ±1)`.
- `tasi`: kitapta sırayı hemen değiştirir (`yerDegisti(() => kitabaUygula(...))`), yazmayı `SiraBirlestirici(800)` ile tek isteğe birleştirir, `siraOncesi` ile geri alma (`geri`) gönderir. Konu sırası ünite nesnesine bağlı gönderilir (araya ad değişikliği girerse doğru anahtar).
- Okuyucu kuyruk her değiştiğinde paneli yeniden çizdiriyor (`yeniden` / `ciz`).
- Bekleyen satırlar (`.ie-bekliyor`: Ekleniyor…/Çöpe atılıyor…) ve ad düzenleme (`duzenlenen`) satırları var.

## Teknik kararlar (planlayıcı)
- D1 Kütüphane yok, Pointer Events ile kendi küçük sürüklemesi. Neden: tek liste, iki seviye; 1945 testlik projeye bağımlılık eklemeye değmez.
- D2 Saf hesap ayrı modülde: `src/ui/surukleDurumu.ts` (DOM'suz, testli). Ör. `hedefSira(ortaNoktalar: number[], kaynak: number, y: number): number` (bırakılacak yeni indeks) ve `siraTasi<T>(dizi: T[], kaynak: number, hedef: number): T[]` (splice). 6.6-3b'de üniteler arası hedef buraya eklenecek; şimdiden "hangi ünitenin üstünde" bilgisini döndürebilecek biçimde kur ama 3a'da kendi ünitesi dışını hedef SAYMA.
- D3 Tutamaç: her ünite başlığı ve konu satırının en solunda `<button class="ie-tutamac" data-surukle="u0|k0.1" aria-label=…>⠿</button>`; yalnız tutamaçta `touch-action: none`. Sürükleme tutamaçta basıp ≥6 px oynatınca başlar (fare, parmak, kalem aynı). Satırın geri kalanında dokunma bugünkü gibi (kaydırma, çift dokunuşla ad). Neden: tutamaç dışında kaydırmayla karışma riski yok, basılı tutma beklemesi gereksiz.
- D4 Görünüm (S3 = A, telefon ana ekranı hissi): kalkan satır hafif büyür + gölge (mevcut kart gölgesi/değişkenleri, yeni renk icat etme), işaretçiyi dikey izler (`transform: translateY`); diğer satırlar 150 ms `transform` geçişiyle kayıp boşluk açar. Bırakınca yerine oturur. `prefers-reduced-motion`'da geçiş yok.
- D5 Sınırlar: konu yalnız kendi `ol`'u içinde (dışarı çekilirse en uç konumda kalır); ünite tüm `.ie-unite` bölümüyle üniteler arasında. Bekleyen (`.ie-bekliyor`) satır sürüklenmez ve hedef sayılmaz; tutamaç onlarda yok.
- D6 Kenar kaydırma: işaretçi kaydırılabilir liste kabının üst/alt 40 px'ine gelince kap kendiliğinden kayar (rAF, hız kenara yakınlıkla artar).
- D7 Yazma: `tasi(yer, yon)` genelleşir → `siraDegistir(yer, hedefIndeks)`; ↑ ↓ bunu `i±1` ile çağırır. Bırakınca TEK çağrı; aynı yere bırakmak yazmaz. `SiraBirlestirici`, `siraOncesi`, `geri`, `yerDegisti`, ünite nesnesine bağlı gönderim aynen korunur. kitap.json biçimi ve Drive yolu değişmez → kilit gerekmez.
- D8 Sürükleme sırasında `ciz()` ertelenir (bayrak); bırakınca/iptalde bir kez çizilir. Neden: kuyruk değişince gelen yeniden çizim sürüklenen satırı silmesin.
- D9 İptal: Escape, `pointercancel`, liste dışında bırakma değil (son geçerli yere bırakır). Escape ve pointercancel satırı eski yerine döndürür, yazma yok.
- D10 Kapalılık: `yazar` değilse, ad düzenlenirken (`duzenlenen`) ya da editör kapalıyken tutamaç `disabled`. Sürükleme başlarken bekleyen ad girdisi yok sayılmaz: `duzenlenen` varsa sürükleme başlamaz.
- D11 ↑ ↓ ekranda görsel olarak gizlenir (`.ie-gizli` = görünmez ama odaklanabilir), klavye odağında (`:focus-visible`) görünür. Tutamaç da klavyede: odaktayken ↑/↓ tuşu `siraDegistir(yer, i±1)`.
- D12 Metinler `src/dil` (TR + EN): tutamaç `aria-label` TR "Sürükleyerek taşı" / EN "Drag to reorder"; sürükleme sonrası ekran okuyucu için `aria-live` mevcut durum satırında kısa not gerekmez (görsel yeterli). `t()` modül yüklenirken çağrılmaz.

## Relevant Files
`src/ui/icindekilerDuzenle.ts`, yeni `src/ui/surukleDurumu.ts` + `surukleDurumu.test.ts`, `src/ui/icindekilerDurumu.ts` (gerekirse), içindekiler stilleri (`styles.css` içinde `.ie-*`), `src/dil/tr.ts` + `en.ts`. Okuyucu tarafı (`Okuyucu.ts` panel çizimi) yalnız D8 gerektirirse.

## Requirements
1. Konu: aynı ünite içinde sürükle-bırak; ünite: üniteler arasında sürükle-bırak (D3–D7).
2. ↑ ↓ ve klavye tutamacı aynı `siraDegistir` yolunu kullanır (D11); hızlı ardışık sürüklemeler 800 ms içinde tek yazma.
3. Sürükleme sırasında yeniden çizim ertelenir (D8); iptal (D9); kapalılık (D10).
4. Açık konu ünite taşınırken doğru kalır (`yerDegisti`, mevcut davranış).
5. Testler: `hedefSira` (yukarı/aşağı, uçlar, aynı yer, tek eleman), `siraTasi`; editörde ↑ ↓ eski davranışla aynı istek + geri (mevcut testler geçer); sürükleme → tek `konuSirasi`/`uniteSirasi` isteği ve doğru `geri`; aynı yere bırakma → istek yok; bekleyen satırda tutamaç yok; `duzenlenen` varken sürükleme başlamaz. Tüm mevcut testler geçer.

## Do Not
- Konuyu başka üniteye taşıma (3b). Drive'da klasör taşıma/yeniden adlandırma yok; Konu-NN / Unite-NN klasör adları değişmez.
- kitap.json biçimi, JSON anahtarları, `icindekilerYaz` kuyruk/istek türleri değişmez (yalnız mevcut `konuSirasi`/`uniteSirasi` kullanılır).
- Sürükleme kütüphanesi ekleme; HTML5 drag&drop (`draggable`) kullanma (iPad'de güvenilmez).
- Kalem/girdi (`src/kalem/*`), auth, kaydedici değişmez. Yeni renk/gölge icat etme.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. Commit atma, main'e push etme (Deniz söyleyince).

## Definition of Done
- Laptop (fare) ve iPad (parmak + kalem): konu kendi ünitesinde, ünite üniteler arasında sürüklenir; diğerleri kayar; bırakınca sıra kitapta ve Drive'da (kitap.json) kalıcı, sayfa yenileyince aynı.
- Tutamaç dışından liste bugünkü gibi kayar; çift dokunuşla ad değiştirme, çöp, + Konu bozulmaz.
- Testler, typecheck, build, `npm run dil` (0) geçer; `dil:ekran` taşma 0.

## Verification
- `npm test`, `npm run typecheck`, `npm run build`, `npm run dil`, `npm run dil:ekran`.
- Derlenmiş uygulama + sahte Drive, Playwright: 390×844 (dokunma) ve 1180×820 (fare): konu 1→3 sürükle, ünite 2→1 sürükle, Escape iptali, uzun listede kenar kaydırma; gönderilen istek sayısı ve sırası.
- Sonunda göster: değişen dosyalar, test sayısı, `git status`, laptop + iPad deneme adımları.

## Ek kontrol + geri alma
- Kontrol: Claude diff'i okur (yazma yolu yalnız mevcut sıra istekleri, ciz ertelemesi sızıntısız, ↑ ↓ davranışı aynı).
- Geri alma: tek commit `git revert` (veri biçimi değişmediği için Drive'da temizlik gerekmez).
