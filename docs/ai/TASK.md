# TASK – 6.5-4b: İki dilde görünümü bitir

Onaylı plan (planlayıcı: Claude, 1 Kasım 2026). Kaynak: `FAZ6_5_PLAN.md` içindeki eski 6.5-4b promptu, yeni iş bölümüne göre yeniden yazıldı.

## Goal
EN ve TR arayüz telefon (390 px), iPad (820/1180) ve laptop (1280) genişliklerinde taşmasız görünsün: dar ekranda EN okuyucu sekmeleri kısa ad gösterir, bilinen eski taşmalar düzeltilir ya da gerekçeyle "beklenen" sayılır, iki dilde tam ekran turu çıkar, README iki dil desteğini anlatır.

## Context
- 6.5-1…6.5-4a bitti ve canlıda: kalan Türkçe dize 0, `npm run dil` kalan dize ya da tr/en anahtar farkı varsa hata verir. Testler tr sözlüğüyle çalışır. Varsayılan dil EN.
- Yerel main, 1 Kasım docs/ai kurulumunu içerir (`f681b5a`, `0187dbc`); push yok. Bu görevde `git status`'ta yalnız `docs/ai/TASK.md` değişmiş görünür: bu beklenen, başka değişiklik varsa dur.
- Eski taşmalar 6.5-3 ve 6.5-4a raporlarından (iki dilde de var, 390 px ağırlıklı): `#spread` 9 px, `#oSpread` 390 px, `#oZoom`, içindekiler durum simgeleri (33 > 22 px), `.o-title`, EN boş konu başlığı (5 px, … ile kısalıyor).
- Deniz kararı (26 Ekim 20:51): kısa sekme adı yalnız dar ekranda ve yalnız EN; laptop/iPad'de tam ad. Tam ad `title` + `aria-label`'da kalır.
- Kısa EN sekme adları (Deniz kararı, 1 Kasım 13:20): **Original · Summary · Practice · Homework** (yalnız uzun iki ad kısalır: Exercises → Practice, Assignments → Homework). Tam adlar aynen: Original / Summary / Exercises / Assignments.
- Eski CLAUDE.md ve docs/DURUM.md artık `docs/ai/arsiv/` altında; durum kaydı `docs/ai/CURRENT_STATE.md`'ye yazılır.

## Relevant Files
- `src/okuma/Okuyucu.ts` (sekmeler), `src/ui/reader.ts` (masadaki içindekiler), `src/styles.css`
- `src/dil/tr.ts`, `src/dil/en.ts`, `src/dil/sozluk.ts`
- `scripts/dil-kontrol.mjs`, `package.json` (betik adı)
- `README.md`, `docs/ai/CURRENT_STATE.md`
- Okuyucu sekmelerine bağlı Playwright betikleri (`scripts/` içinde; hangileri olduğunu sen bul)

## Requirements
1. **Dar ekran EN sekme adları.** Uygulamadaki mevcut dar ekran eşiğini kullan (yeni eşik uydurma; ≤390 px'i kapsamalı). Dil EN ve dar ekranken sekme metni kısa anahtardan gelir; tam ad `title` + `aria-label`'da. TR'de ve 820/1180/1280'de hiçbir değişiklik yok. Kısa adlar sözlükte ayrı anahtar (ör. `okuyucu.sekmeKisa.*`), tr.ts'de de karşılığı olur (TR değeri = bugünkü ad). Pencere boyutu değişince (iPad döndürme) doğru ada geçsin; tercihen CSS ile iki span, JS dinleyicisi gerekmez.
2. **Eski taşmalar.** Her öğe için önce nedenini bul. Düzelt; ya da gerçekten kasıtlıysa (yatay kaydırılan şerit, `…` ile kısalan başlık) `dil-kontrol` taşma listesinde "beklenen" diye işaretle ve gerekçesini yaz. Görünümü değiştiren her düzeltmede önce/sonra görüntüsü. Düzeltme yalnız CSS/yerleşim; okuyucu davranışı (kaydırma, yakınlaştırma, sekme seçimi) değişmez.
3. **Tam ekran turu.** `dil-kontrol.mjs`'in bütün ekran bölümleri (giriş, kitaplık, Özelleştir, okuyucu, ekleme panelleri, OCR paneli, bekleyen foto toast'ı) EN + TR × 390 / 820 / 1180 / 1280. Görüntüler → `C:\Users\yarpi\iCloudDrive\uni_plan_claude_code\Claude outputs\dil-6.5-4b\` (dosya adı: `<genişlik>-<dil>-<ekran>.png`) + `rapor.json` (öğe, genişlik, dil, px, beklenen/beklenmeyen, gerekçe).
4. **Sıkı mod.** dil-kontrol'e ayrı bir bayrak/npm betiği ekle (ör. `npm run dil:ekran`): beklenmeyen taşma varsa çıkış kodu 1. `npm run dil` hızlı kalsın (tarayıcı açmasın).
5. **README (İngilizce).** Kısa "Languages" bölümü: EN varsayılan, EN | TR düğmesi (giriş + kitaplık üst çubuğu), seçim cihazda ve Drive'da (`kitaplik.json` → `ayarlar.dil`) hatırlanır, `?lang=en|tr`, yeni metin eklerken `src/dil/tr.ts` kaynak + `en.ts` zorunlu + `npm run dil`. İsteğe bağlı tek satır Türkçe not. E-posta, Drive id, kullanıcı adı yazılmaz.
6. **Testler.** Okuyucu sekmelerine bağlı Playwright betikleri `lang=tr` geçer; ayrıca `lang=en` 390 px ile çalışır. Metne bağlı seçici kırılırsa id/rol ile seçmeye çevir.
7. **Durum.** `docs/ai/CURRENT_STATE.md`: 6.5-4b bitti satırı, sıradaki = 6.5-5 (faz-6 önizleme + iPad/laptop deneme + main onayı). ≤ 40 satır.

## Do Not
- Çeviri metinlerini değiştirme; tek istisna taşma için EN metni kısaltmak (listele).
- `api/`, Drive klasör/dosya adları, JSON anahtarları, `/Defter…` işaretleri, `src/dil/katla.ts`, yapay zekâ istemleri, `public/privacy.html`, `public/terms.html`.
- `AGENTS.md`, `docs/ai/DECISIONS.md` (kural zaten var; değişiklik gerekirse sor).
- Yeni kütüphane yok. İlgisiz refactor/temizlik yok.
- `git checkout` (dal değiştirme), `reset`, `stash`, force push. main'e ya da faz-6'ya push yok.
- Telifli PDF'ler `public/` veya git'e girmez.

## Definition of Done
- 390 px EN'de sekmeler Original · Summary · Practice · Homework (kısa), tam ad ipucunda; TR ve geniş ekranlar aynen.
- Eski taşma listesindeki her öğe: "düzeltildi" ya da "beklenen + gerekçe". Tam turda beklenmeyen taşma 0.
- Görüntüler + rapor.json iCloud klasöründe.
- README iki dil bölümü; CURRENT_STATE güncel.
- `npm run dil` 0, `npm test`, `npm run typecheck`, `npm run build` temiz; ilgili Playwright betikleri geçti.
- Tek commit: `6.5-4b: dar ekran EN sekme adları, eski taşmalar, iki dilde ekran turu, README iki dil` (TASK.md dahil, dosyalar tek tek adıyla). Push yok.

## Verification
1. `npm run dil` → kalan 0, anahtar farkı 0.
2. Yeni sıkı tur (ör. `npm run dil:ekran`) → beklenmeyen taşma 0, çıkış kodu 0.
3. `npm test` (Playwright aynı anda çalışmasın), `npm run typecheck`, `npm run build`.
4. Sekme betikleri: `lang=tr` (tüm genişlikler) + `lang=en` 390 px.
5. Sonunda göster: değişen dosyalar, kısa sekme adları, taşma tablosu (öğe / neden / düzeltildi ya da beklenen), önce/sonra görüntü yolları, test sayısı, betik tablosu (geçti/kaldı), `git status`, commit hash.
6. Deniz için deneme adımları (laptop + iPad, EN ve TR): telefon genişliğinde okuyucu sekmeleri, iPad dikey/yatay sekmeler, eski taşan yerler (iki sayfa düzeni, yakınlaştırma düğmesi, içindekiler simgeleri, başlık), boş konu başlığı EN; ayrıca 6.5-4a'dan kalan iki kontrol: bekleyen foto toast'ı EN ve OCR paneli EN. Adresler tam yazılır (`http://localhost:5173/?lang=en&...`).
