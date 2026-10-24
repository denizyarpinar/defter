// Run after npm run build. Fail if trial tools, old OCR engines or DEV hooks survive tree shaking.
// Task 6.4c-4: the handwriting panel and search are real features now (their chunks are expected); the
// ?ocrKayit lock, the DEV helpers (defterOcrDizinOlc, defterOcrKayitDene) and the ocr-ai trial page must be gone.
// Optional: node scripts/ocr-production-kontrol.mjs https://<address> → api/oku answers there (not 404):
// GET (status) 200 { acik: false } without a token, POST without a token 401. The owner check (403 for another
// account) needs a real token: it is proved by the unit tests (src/ocrAi/okuApi.test.ts) and by hand.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const files = readdirSync('dist/assets').filter(name => /\.(?:m?js)$/.test(name));
assert.ok(files.length, 'Production assets missing; build first.');
const markers = /ocrKayit|ocrDizinOlc|defterOcrDizinOlc|defterOcrKayitDene|ocrAi|ocr-ai|ocrArama|ocrDeneme|defterOcr64a|OCR 6\.4a|Google OCR okuyucu araması|tesseract|Tesseract|traineddata|Event\(.defter-auth-change/;   // the DEV dispatch (auth.ts); the panel only listens
for (const name of files) {
  assert.doesNotMatch(name, /driveDeneme|tesseract|^deneme-|ocrAi|ocrDizinOlc|kayitDene/i);
  const m = markers.exec(readFileSync(join('dist/assets', name), 'utf8'));
  if (m) throw new Error(`${name}: "${m[0]}" found`);
}
assert.ok(!readdirSync('dist').some(name => /ocr/i.test(name)), 'An OCR trial page is in dist.');
assert.doesNotMatch(readFileSync('dist/index.html', 'utf8'), /ocrKayit|ocr-ai/);
console.log(`Production check passed: ${files.length} JS/MJS assets; no ?ocrKayit lock, DEV OCR helpers, ocr-ai, Tesseract or DEV session hooks.`);

const adres = process.argv[2];
if (adres) {
  const url = new URL('/api/oku', adres).href;
  const durum = await fetch(url, { cache: 'no-store' });
  assert.notEqual(durum.status, 404, `GET ${url}: 404 (api/oku is not deployed here)`);
  assert.equal(durum.status, 200, `GET ${url}: ${durum.status} (a protected Preview answers 401/403 itself)`);
  assert.deepEqual(await durum.json(), { acik: false }, `GET ${url} without a token must say acik: false`);
  const post = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.notEqual(post.status, 404, `POST ${url}: 404`);
  assert.equal(post.status, 401, `POST ${url} without a token: ${post.status}, 401 expected`);
  console.log(`api/oku at ${new URL(adres).host}: GET 200 { acik: false }, POST without a token 401 (not 404).`);
}
