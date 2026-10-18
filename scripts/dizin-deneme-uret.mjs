// Task 6.3f: a one-page test PDF for measuring how long Drive takes to index a new file (fullText).
// It holds a rare word ("Zebrafink4711") and the time it was made. Made-up text, no lecture material.
// Writes dizin-deneme.pdf to ../defter-test-dosyalari/ and to iCloudDrive/defter-test/ (if the folders exist).
// Run: node scripts/dizin-deneme-uret.mjs [word]   (another word → dizin-deneme-<word>.pdf, for a new measurement)

import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEDEFLER = [join(ROOT, '..', 'defter-test-dosyalari'), join(homedir(), 'iCloudDrive', 'defter-test')];
const KELIME = process.argv[2] ?? 'Zebrafink4711';
const AD = KELIME === 'Zebrafink4711' ? 'dizin-deneme.pdf' : `dizin-deneme-${KELIME}.pdf`;

const simdi = new Date();
const tarih = simdi.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

const doc = await PDFDocument.create();
doc.setTitle('Defter dizin deneme');
const page = doc.addPage([595.28, 841.89]);   // A4
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const satirlar = [
  [bold, 22, 'Defter: Drive dizin denemesi'],
  [font, 13, ''],
  [font, 13, `Nadir kelime: ${KELIME}`],
  [font, 13, `Olusturuldu: ${tarih}`],
  [font, 13, ''],
  [font, 11, 'Bu dosya sadece Drive fullText aramasinin yeni bir PDF\'i ne kadar'],
  [font, 11, 'surede buldugunu olcmek icindir (Defter, adim 6.3f).'],
  [font, 11, `Arama kelimesi tekrar: ${KELIME}`],
];
let y = 760;
for (const [f, size, text] of satirlar) {
  if (text) page.drawText(text, { x: 60, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  y -= size * 1.8;
}
const bytes = await doc.save();

for (const d of HEDEFLER) {
  if (!existsSync(d)) { console.log(`atlandı (klasör yok): ${d}`); continue; }
  const p = join(d, AD);
  writeFileSync(p, bytes);
  console.log(`${p} · ${bytes.length} bayt · ${tarih}`);
}
