import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atlasJsonOku, pngKontrol } from '../src/elYazisi/atlasSema';

// Task 6.4d-3: the real handwriting atlas package (outside the repo, tools/atlas `uret.py paket`); missing → skipped
const PAKET = '../defter-test-dosyalari/atlas/4-paket/';

describe.skipIf(!existsSync(PAKET + 'el-yazisi-atlas.json'))('gerçek atlas paketi', () => {
  it('şemadan geçer, PNG ile uyuşur, kaynak adı yok', () => {
    const metin = readFileSync(PAKET + 'el-yazisi-atlas.json', 'utf8');
    const a = atlasJsonOku(metin);
    pngKontrol(new Uint8Array(readFileSync(PAKET + 'el-yazisi-atlas.png')), a);
    expect(metin).not.toMatch(/IMG_|#\d/);
  });
});
