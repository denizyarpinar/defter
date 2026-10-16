// Task 5.4: sample output for Deniz to look at the page layout (A4, margin, fitting).
//   ornek-cikti/5.4/dik.jpg, yatay.jpg               two made-up notebook photos (sharp, from SVG)
//   ornek-cikti/5.4/ozet-sayfa-eklenmis.pdf          public/demo/demo-ozet-notlu.pdf + the 2 photos at the end
//   ornek-cikti/5.4/fotograflardan.pdf               a new PDF from the same 2 photos
// The app's own code (src/defter/sayfaEkle.ts) runs through Vite. ornek-cikti/ is in .gitignore.
// Run: npm run sayfa-ornek

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'ornek-cikti', '5.4');
const KALITE = 85;   // same as JPEG_KALITE in src/defter/ayarlar.ts

// A notebook page: lined (portrait) or squared (landscape), a thin red frame at the photo's edge,
// so the margin around it on the PDF page is easy to see.
function svg(w, h, dik) {
  const lines = [];
  if (dik) {
    for (let y = 260; y < h - 60; y += 70) lines.push(`<line x1="60" y1="${y}" x2="${w - 60}" y2="${y}" stroke="#9db7d6" stroke-width="3"/>`);
    lines.push(`<line x1="200" y1="0" x2="200" y2="${h}" stroke="#e39a9a" stroke-width="4"/>`);
  } else {
    for (let x = 50; x < w; x += 50) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#c6d3e3" stroke-width="2"/>`);
    for (let y = 50; y < h; y += 50) lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#c6d3e3" stroke-width="2"/>`);
  }
  const title = dik ? 'Dik ornek 1500 x 2000' : 'Yatay ornek 2000 x 1500';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#fbf7ec"/>
    ${lines.join('\n')}
    <text x="${dik ? 240 : 120}" y="${dik ? 230 : 200}" font-family="Arial, sans-serif" font-size="96" fill="#22252b">${title}</text>
    <text x="${dik ? 240 : 120}" y="${dik ? 440 : 400}" font-family="Arial, sans-serif" font-size="56" fill="#3b4a8a">Defter fotografi (deneme)</text>
    <circle cx="${w / 2}" cy="${h * 0.62}" r="${Math.min(w, h) * 0.18}" fill="none" stroke="#3b4a8a" stroke-width="10"/>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="#c0392b" stroke-width="12"/>
  </svg>`;
}

const jpeg = async (w, h, dik) => new Uint8Array(await sharp(Buffer.from(svg(w, h, dik))).jpeg({ quality: KALITE }).toBuffer());

mkdirSync(OUT, { recursive: true });
const dik = await jpeg(1500, 2000, true);
const yatay = await jpeg(2000, 1500, false);
writeFileSync(join(OUT, 'dik.jpg'), dik);
writeFileSync(join(OUT, 'yatay.jpg'), yatay);

const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { sonaSayfaEkle, fotograflardanPdf } = await vite.ssrLoadModule('/src/defter/sayfaEkle.ts');
  const ozet = new Uint8Array(readFileSync(join(ROOT, 'public', 'demo', 'demo-ozet-notlu.pdf')));
  const outputs = {
    'ozet-sayfa-eklenmis.pdf': await sonaSayfaEkle(ozet, [{ bytes: dik }, { bytes: yatay }]),
    'fotograflardan.pdf': await fotograflardanPdf([{ bytes: dik }, { bytes: yatay }])
  };
  const before = (await PDFDocument.load(ozet)).getPageCount();
  console.log(`demo-ozet-notlu.pdf: ${before} sayfa`);
  for (const [name, bytes] of Object.entries(outputs)) {
    writeFileSync(join(OUT, name), bytes);
    const doc = await PDFDocument.load(bytes);   // can be opened again
    const sizes = doc.getPages().slice(-2).map(p => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`).join(', ');
    console.log(`${join(OUT, name)}: ${doc.getPageCount()} sayfa (son ikisi ${sizes}), ${(bytes.length / 1024).toFixed(0)} kB`);
  }
} finally {
  await vite.close();
}
