// Run after npm run build. Fail if trial UI, modules or OCR dependency survive tree shaking.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const files = readdirSync('dist/assets').filter(name => /\.(?:m?js)$/.test(name));
assert.ok(files.length, 'Production assets missing; build first.');
const markers = /reader-ocr-search|ocrArama|ocrDeneme|defterOcr64a|OCR 6\.4a|Google OCR okuyucu araması|tesseract|Tesseract|traineddata|defter-auth-change/;
for (const name of files) {
  assert.doesNotMatch(name, /okuyucuPanel|okuyucuArama|driveDeneme|tesseract|^deneme-/i);
  assert.doesNotMatch(readFileSync(join('dist/assets', name), 'utf8'), markers, name);
}
console.log(`Production check passed: ${files.length} JS/MJS assets; reader OCR, comparison tool, Tesseract and DEV session hooks absent.`);
