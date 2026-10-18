import { durumMetni } from './fotoEklemeMetin';

// Task 6.2e-2: the status strip's text while photos go to Drive (no DOM, so it can be tested).
// One entry per adding, in the queue's order: waiting, being prepared (checks, pdf-lib) or uploading.

export type EklemeAsamasi =
  | { tur: 'sirada' }
  | { tur: 'hazirlaniyor' }
  | { tur: 'yukleniyor'; yuzde: number | null };   // null: no progress (without ?yeniYukleme=1)

export interface SiradakiEkleme { foto: number; asama: EklemeAsamasi }

// Whole percent, 0–100; nothing to send counts as 0
export function yuzdeHesapla(gonderilen: number, toplam: number): number {
  if (!(toplam > 0) || !(gonderilen > 0)) return 0;
  return Math.min(100, Math.floor(gonderilen / toplam * 100));
}

// "2 fotoğraf ekleniyor…" / "Fotoğraflar yükleniyor… %42" (+ " · 3 fotoğraf sırada"); nothing: null
export function yuklemeDurumMetni(eklemeler: readonly SiradakiEkleme[]): string | null {
  let sirada = 0, calisan: SiradakiEkleme | null = null;
  for (const e of eklemeler) {
    if (e.asama.tur === 'sirada') sirada += e.foto;
    else calisan ??= e;
  }
  // nothing running: the first waiting one starts right away (no "sırada" flash after "Ekle")
  const ilk = calisan ? undefined : eklemeler[0];
  if (ilk) { calisan = { foto: ilk.foto, asama: { tur: 'hazirlaniyor' } }; sirada -= ilk.foto; }
  const parca: string[] = [];
  if (calisan) {
    const a = calisan.asama;
    if (a.tur === 'yukleniyor') parca.push(a.yuzde === null ? 'Fotoğraflar yükleniyor…' : `Fotoğraflar yükleniyor… %${a.yuzde}`);
    else parca.push(durumMetni(calisan.foto) ?? 'Fotoğraflar ekleniyor…');
  }
  if (sirada) parca.push(`${sirada} fotoğraf sırada`);
  return parca.length ? parca.join(' · ') : null;
}
