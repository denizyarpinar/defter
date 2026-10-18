// Task 6.3-0a: which files in Drive are left over from testing. Pure: no Drive, only paths and appProperties.
// The list is only a list: nothing here (or in temizlikListesi.ts) trashes or changes a file.
// Paths start with "Kitaplık/…" (the library) or "(Drive kökü)/…" (My Drive's root).

export type Guven = 'kesin' | 'emin değilim';

export interface Aday {
  yol: string;                              // full path, the name at the end
  klasor: boolean;
  appProperties?: Record<string, string>;
}

export interface Secilen<T extends Aday = Aday> { aday: T; neden: string; guven: Guven }

// Never on the list, whatever else is true
const KORUNAN = [/^orijinal\.pdf$/i, /^ozet\.pdf$/i, /^brifing\.pdf$/i, /^sorular\.pdf$/i, /^kitap\.json$/i, /^kitaplik\.json$/i, /^kitap_v\d+_yedek\.json$/i];

const KONU_01 = /^Kitaplık\/kitaplar\/programmiergrundlagen\/Unite-01-Logik\/Konu-01-Aussagenlogik\//i;
const KONU_99 = /^Kitaplık\/kitaplar\/[^/]+\/(?:.+\/)?Konu-99-Test-5\.7(?:\/|$)/i;
const KITAP_KOKU = /^Kitaplık\/kitaplar\/[^/]+\/[^/]+$/i;
const CEVIRI_DENEME = /^\(Drive kökü\)\/Defter-ceviri-deneme(?:\/|$)/;

// "tahta", "tahta (1)", "tahta-2"
const ad = (s: string) => new RegExp(`^${s}(?:[\\s_-]*(?:\\(\\d+\\)|\\d+))?$`, 'i');

// Test names used in Konu-01 (5.8–6.2 tests). The name without .pdf and without _cozum.
const DESENLER: [RegExp, string][] = [
  [/^robotics-test/i, 'Robotics-test*'],
  [ad('tahta'), 'tahta'],
  [ad('defter'), 'defter'],
  [/^kucuk/i, 'kucuk*'],
  [/^a-test/i, 'A-test*'],
  [ad('b-test'), 'B-test'],
  [ad('klavye-test'), 'klavye-test'],
  [ad('ipad-foto'), 'ipad-foto'],
  [ad('coklu-test'), 'coklu-test'],
  [ad('coklu[-–]pdf'), 'coklu–pdf'],
  [/^IMG_/i, 'IMG_*'],
  [/^DFKI_Access.*_Rules/i, 'DFKI_Access*_Rules'],
  [ad('ders-notu'), 'ders-notu'],
  [ad('ders-sunumu'), 'ders-sunumu'],
  [ad('derso-sunumu'), 'derso-sunumu'],
  [ad('ipad-not'), 'ipad-not'],
  [ad('kilitsiz'), 'kilitsiz'],
  [ad('Lecture 01 Introduction to Robotics'), 'Lecture 01 Introduction to Robotics.pdf'],
];

const adi = (yol: string) => yol.slice(yol.lastIndexOf('/') + 1);
const klasoru = (yol: string) => yol.slice(0, yol.lastIndexOf('/'));
const govde = (name: string) => name.replace(/\.pdf$/i, '').replace(/_cozum$/i, '');
const cozumMu = (name: string) => /_cozum\.pdf$/i.test(name);

// One file on its own (the _cozum partners come in temizlikSec)
export function testMi(a: Aday): { neden: string; guven: Guven } | null {
  const name = adi(a.yol);
  const korunan = !a.klasor && KORUNAN.some(r => r.test(name));
  // inside the two test folders the protected names are test files too
  if (CEVIRI_DENEME.test(a.yol)) return { neden: korunan ? 'test klasörünün içi' : '5.11 çeviri denemesi klasörü (Drive kökü)', guven: 'kesin' };
  if (KONU_99.test(a.yol)) return { neden: korunan ? 'test klasörünün içi' : 'Konu-99-Test-5.7 test klasörü', guven: 'kesin' };
  if (korunan || a.klasor) return null;
  const islem = a.appProperties?.defterIslem;
  if (KONU_01.test(a.yol)) {
    const g = govde(name);
    if (/tutorial01/i.test(g) && !/^tutorial01$/i.test(g)) return { neden: 'ad deseni: tutorial01 kopyası', guven: 'kesin' };
    const d = DESENLER.find(([r]) => r.test(g));
    if (d) return { neden: `ad deseni: ${d[1]}${cozumMu(name) ? ' (_cozum)' : ''}`, guven: 'kesin' };
    if (islem) return { neden: 'Konu-01 test alanı, uygulama ekledi (defterIslem)', guven: 'kesin' };
    return null;
  }
  if (KITAP_KOKU.test(a.yol)) {
    if (/^deneme-5\.5\.pdf$/i.test(name)) return { neden: '5.5 deneme dosyası (kitap kökü)', guven: 'kesin' };
    if (/^01_Programmiergrundlagen\.pdf$/i.test(name)) return { neden: 'kitap kökünde; test mi gerçek mi bilinmiyor (Deniz\'e sor)', guven: 'emin değilim' };
  }
  if (islem && a.yol.startsWith('Kitaplık/')) return { neden: 'Konu-01 dışında defterIslem (gerçek ekleme olabilir)', guven: 'emin değilim' };
  return null;
}

// Every file of the tree → the test files, with X_cozum.pdf next to each listed X.pdf
export function temizlikSec<T extends Aday>(adaylar: readonly T[]): Secilen<T>[] {
  const out: Secilen<T>[] = [];
  const secili = new Set<T>();
  for (const a of adaylar) {
    const t = testMi(a);
    if (t) { out.push({ aday: a, ...t }); secili.add(a); }
  }
  for (const a of adaylar) {
    if (secili.has(a) || a.klasor || !cozumMu(adi(a.yol))) continue;
    const asil = `${klasoru(a.yol)}/${govde(adi(a.yol))}.pdf`.toLowerCase();
    const es = out.find(s => s.aday.yol.toLowerCase() === asil);
    if (es) out.push({ aday: a, neden: `${adi(es.aday.yol)} dosyasının çözümü`, guven: es.guven });
  }
  return out.sort((x, y) => x.aday.yol.localeCompare(y.aday.yol, 'tr'));
}
