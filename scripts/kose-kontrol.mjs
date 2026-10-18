// Task 6.2d-1: contact sheets for the koseB measurement (photos stay outside the repo).
//   node scripts/kose-kontrol.mjs dogru   → dogru-kontrol-1.jpg, -2.jpg   green = hand-set corners
//   node scripts/kose-kontrol.mjs koseB   → bugun-koseB-1.jpg, -2.jpg     green = hand-set, red = koseB (sonuc-koseB.json)
//   node scripts/kose-kontrol.mjs yeni [ek] → yeni-koseB[-ek]-1.jpg, …    same, after 6.2d-2 (ek: e.g. asama1 for a stage copy)
// The 6.2d-2 control photos are left out unless KOSE_KONTROL=1.
// Each tile: the whole photo (600 px wide) and below it the 4 corners zoomed in, so the paper edge can be checked.
// Input: ../defter-test-dosyalari/kose/ (dogru.json, *.jpg); output: iCloudDrive/uni_plan_claude_code/Claude outputs/kose-6.2d/

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const KOSE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'defter-test-dosyalari', 'kose');
const OUT = join(homedir(), 'iCloudDrive', 'uni_plan_claude_code', 'Claude outputs', 'kose-6.2d');
const TW = 600;            // tile width; the photo is drawn TW × TW·h/w
const ZW = TW / 4;         // one corner zoom
const ZOOM = 0.07;         // zoom window = this × long edge
const SUTUN = 4, KARE_BASINA = 8;

const kip = process.argv[2];
if (kip !== 'dogru' && kip !== 'koseB' && kip !== 'yeni') { console.error('Kullanım: node scripts/kose-kontrol.mjs dogru|koseB|yeni [ek]'); process.exit(1); }
const KONTROL = ['wa-2303-2.jpg', 'img-1384-lamba.jpg'];   // same as kose-olcum.test.ts
if (!existsSync(join(KOSE, 'dogru.json'))) { console.error(`Bulunamadı: ${join(KOSE, 'dogru.json')}`); process.exit(1); }
const dogruTum = JSON.parse(readFileSync(join(KOSE, 'dogru.json'), 'utf8'));
let sonuc = {};
if (kip !== 'dogru') {
  // koseB = the 6.2d-1 result (kept as sonuc-koseB-bugun.json once 6.2d-2 started)
  const bugun = join(KOSE, 'sonuc-koseB-bugun.json');
  const yol = kip === 'koseB' && existsSync(bugun) ? bugun : join(KOSE, 'sonuc-koseB.json');
  if (!existsSync(yol)) { console.error('Önce ölçümü çalıştır: npx vitest run scripts/kose-olcum.test.ts'); process.exit(1); }
  for (const r of JSON.parse(readFileSync(yol, 'utf8'))) sonuc[r.dosya] = r;
}
mkdirSync(OUT, { recursive: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const poly = (k, renk, kalin) => `<polygon points="${k.map(p => p.join(',')).join(' ')}" fill="none" stroke="${renk}" stroke-width="${kalin}" stroke-linejoin="round"/>`
  + k.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${kalin * 1.6}" fill="none" stroke="${renk}" stroke-width="${kalin * 0.6}"/>`).join('');

async function kare(dosya, d) {
  const { data, info } = await sharp(join(KOSE, dosya)).rotate().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, uzun = Math.max(W, H);
  const r = sonuc[dosya];
  const cizgiler = (kalin) => poly(d.koseler, '#00e040', kalin) + (r?.koseler ? poly(r.koseler, '#ff2020', kalin) : '');
  // lines in full-resolution pixels; thin enough for the zooms, thick enough for the overview
  const ana = async kalin => sharp(data).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${cizgiler(kalin)}</svg>`) }]).png().toBuffer();
  const buyuk = await ana(uzun / 500), ince = await ana(uzun / 1500);
  const TH = Math.round(TW * H / W);
  const parts = [{ input: await sharp(buyuk).resize(TW, TH).png().toBuffer(), left: 0, top: 0 }];
  const z = Math.round(ZOOM * uzun);
  for (let i = 0; i < 4; i++) {
    const [x, y] = d.koseler[i];
    const left = Math.max(0, Math.min(W - z, Math.round(x - z / 2))), top = Math.max(0, Math.min(H - z, Math.round(y - z / 2)));
    parts.push({ input: await sharp(ince).extract({ left, top, width: z, height: z }).resize(ZW, ZW).png().toBuffer(), left: i * ZW, top: TH });
  }
  const yazi = r ? `${dosya} · IoU ${r.iou} · hata %${r.hataYuzde ?? '–'} · güven ${r.guven ?? '–'} · ${r.karar}` : dosya;
  const h = TH + ZW + 28;
  parts.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${h}">
    <rect x="0" y="${TH + ZW}" width="${TW}" height="28" fill="#111"/>
    ${[0, 1, 2, 3].map(i => `<line x1="${i * ZW}" y1="${TH}" x2="${i * ZW}" y2="${TH + ZW}" stroke="#111" stroke-width="2"/><text x="${i * ZW + 4}" y="${TH + 14}" font-size="12" fill="#ff0" stroke="#000" stroke-width="0.4">${['sol-üst', 'sağ-üst', 'sağ-alt', 'sol-alt'][i]}</text>`).join('')}
    <text x="6" y="${TH + ZW + 19}" font-size="15" font-family="sans-serif" fill="#fff">${esc(yazi)}</text></svg>`), left: 0, top: 0 });
  return { w: TW, h, buf: await sharp({ create: { width: TW, height: h, channels: 3, background: '#111' } }).composite(parts).png().toBuffer() };
}

const dosyalar = Object.keys(dogruTum).filter(k => !k.startsWith('_') && (kip === 'dogru' || k in sonuc) && (process.env.KOSE_KONTROL === '1' || !KONTROL.includes(k)));
const kareler = [];
for (const f of dosyalar) kareler.push(await kare(f, dogruTum[f]));
const ad = kip === 'dogru' ? 'dogru-kontrol' : kip === 'koseB' ? 'bugun-koseB' : process.argv[3] ? `yeni-koseB-${process.argv[3]}` : 'yeni-koseB';
for (let s = 0; s * KARE_BASINA < kareler.length; s++) {
  const grup = kareler.slice(s * KARE_BASINA, (s + 1) * KARE_BASINA);
  const satirH = [];
  for (let i = 0; i < grup.length; i += SUTUN) satirH.push(Math.max(...grup.slice(i, i + SUTUN).map(k => k.h)));
  const G = 8, W = SUTUN * TW + (SUTUN + 1) * G, H = satirH.reduce((a, b) => a + b + G, G);
  const parts = grup.map((k, i) => ({ input: k.buf, left: G + (i % SUTUN) * (TW + G), top: G + satirH.slice(0, Math.floor(i / SUTUN)).reduce((a, b) => a + b + G, 0) }));
  const yol = join(OUT, `${ad}-${s + 1}.jpg`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#2a2a2a' } }).composite(parts).jpeg({ quality: 88 }).toFile(yol);
  console.log(yol);
}
