// Task 6.K5b: "Hiçbir dosya silinmez" — no source file in src/ sends an HTTP DELETE to Drive or empties the trash.
// Trashing is only files.update with trashed=true / false (drive/copeAt.ts, drive/ofisCevir.ts). Comments are skipped.
// Run: npx vitest run scripts/silme-yok.test.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const dosyalar = (d: string): string[] => readdirSync(d).flatMap(a => {
  const p = join(d, a);
  return statSync(p).isDirectory() ? dosyalar(p) : /\.ts$/.test(a) && !/\.test\.ts$/.test(a) ? [p] : [];
});

describe('no delete anywhere in the app', () => {
  it('no method DELETE and no emptyTrash in src/', () => {
    const bulunan = dosyalar(SRC).filter(p => {
      const kod = readFileSync(p, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      return /['"`]DELETE['"`]|emptyTrash/.test(kod);
    });
    expect(bulunan).toEqual([]);
  });

  it('the trash request sends only { trashed }', () => {
    const kod = readFileSync(join(SRC, 'drive', 'copeAt.ts'), 'utf8');
    expect(kod).toMatch(/method: 'PATCH'[\s\S]*body: JSON\.stringify\(\{ trashed \}\)/);
  });
});
