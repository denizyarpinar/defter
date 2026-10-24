import { describe, expect, it } from 'vitest';
import { driveMetinAra, fullTextKelimeleri, fullTextSorgusu, ocrBulgulari, parcala, yazimlar } from './aramaDrive';
import { DriveError } from './drive';
import type { Getirici } from './saltOkunur';

const SON = "trashed = false and not appProperties has { key='defterGecici' and value='1' }";

describe('fullTextSorgusu', () => {
  it('one word, the folders, no trash, no temporary file', () => {
    expect(fullTextSorgusu('Fehleranfällig', ['a', 'b'])).toBe(`fullText contains 'Fehleranfällig' and ('a' in parents or 'b' in parents) and ${SON}`);
  });

  it('two words = and', () => {
    expect(fullTextSorgusu('  Logik   Beweis ', ['a'])).toBe(`fullText contains 'Logik' and fullText contains 'Beweis' and ('a' in parents) and ${SON}`);
  });

  it("escapes ' and \\, drops \"", () => {
    expect(fullTextKelimeleri('"Deniz\'in" a\\b')).toEqual(["Deniz'in", 'a\\b']);
    expect(fullTextSorgusu("Deniz'in a\\b", ['x'])).toContain("fullText contains 'Deniz\\'in' and fullText contains 'a\\\\b'");
    expect(fullTextSorgusu("x", ["k'1"])).toContain("('k\\'1' in parents)");
  });

  it('nothing to search: null', () => {
    expect(fullTextSorgusu('  " ', ['a'])).toBeNull();
    expect(fullTextSorgusu('x', [])).toBeNull();
  });
});

describe('parcala', () => {
  it('groups of 40', () => {
    const ids = Array.from({ length: 81 }, (_, i) => `k${i}`);
    expect(parcala(ids).map(g => g.length)).toEqual([40, 40, 1]);
    expect(parcala([])).toEqual([]);
  });
});

describe('driveMetinAra', () => {
  const ids = Array.from({ length: 41 }, (_, i) => `k${i}`);

  it('one query per 40 folders, at most 2 pages each, only GET', async () => {
    const istekler: URLSearchParams[] = [];
    const getir: Getirici = async (path, init) => {
      expect(init?.method ?? 'GET').toBe('GET');
      const p = new URLSearchParams(path.slice('files?'.length));
      istekler.push(p);
      const ilk = p.get('q')!.includes("'k0' in parents");
      const sayfa = p.get('pageToken') ? +p.get('pageToken')! : 1;
      return new Response(JSON.stringify(ilk
        ? { files: [{ id: `a${sayfa}` }], nextPageToken: String(sayfa + 1) }   // never ends
        : { files: [{ id: 'b1' }, { id: 'a1' }] }));
    };
    const r = await driveMetinAra('wort', ids, getir);
    expect(istekler.every(p => p.get('pageSize') === '100')).toBe(true);
    expect(istekler.length).toBe(3);   // group 1: 2 pages, group 2: 1 page
    expect(r.istek).toBe(3);
    expect(r.eksik).toBe(true);
    expect([...r.idler].sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('a Drive error is a DriveError', async () => {
    const getir: Getirici = async () => new Response('', { status: 403 });
    await expect(driveMetinAra('wort', ['k'], getir)).rejects.toBeInstanceOf(DriveError);
  });
});

describe('6.4c-3: yazimlar (ä ↔ ae)', () => {
  it('umlaut → ae/oe/ue/ss, case kept', () => {
    expect(yazimlar('Einrückung')).toEqual(['Einrückung', 'Einrueckung']);
    expect(yazimlar('Fuß')).toEqual(['Fuß', 'Fuss']);
    expect(yazimlar('Äpfel')).toEqual(['Äpfel', 'Aepfel']);
    expect(yazimlar('Öffnung')).toEqual(['Öffnung', 'Oeffnung']);
  });
  it('ae/oe/ue/ss → umlaut', () => {
    expect(yazimlar('Einrueckung')).toEqual(['Einrueckung', 'Einrückung']);
    expect(yazimlar('dueguem')).toEqual(['dueguem', 'dügüm']);
    expect(yazimlar('Aepfel')).toEqual(['Aepfel', 'Äpfel']);
    expect(yazimlar('Strasse')).toEqual(['Strasse', 'Straße']);
  });
  it('nothing to change: the word alone', () => {
    expect(yazimlar('Logik')).toEqual(['Logik']);
  });
});

describe('6.4c-3: fullTextSorgusu with yazimlar', () => {
  it('both spellings with or; the other words as before', () => {
    expect(fullTextSorgusu('Einrückung Logik', ['a'], { yazimlar: true })).toBe(
      `(fullText contains 'Einrückung' or fullText contains 'Einrueckung') and fullText contains 'Logik' and ('a' in parents) and ${SON}`);
  });
  it('without the option: exactly as before', () => {
    expect(fullTextSorgusu('Einrückung', ['a'])).toBe(`fullText contains 'Einrückung' and ('a' in parents) and ${SON}`);
    expect(fullTextSorgusu('Einrueckung', ['a'], {})).toBe(`fullText contains 'Einrueckung' and ('a' in parents) and ${SON}`);
  });
});

describe('6.4c-3: driveMetinAra with elYazisi', () => {
  const cevap = { files: [
    { id: 'pdf1', parents: ['k1'] },
    { id: 'ocr1', parents: ['k1'], appProperties: { defter: '1', defterOcr: '1', defterOcrKaynak: 'pdf1' } },
    { id: 'baska', parents: ['k1'], appProperties: { defter: '1' } },
  ] };
  const getirici = (istekler: URLSearchParams[]): Getirici => async path => {
    istekler.push(new URLSearchParams(path.slice('files?'.length)));
    return new Response(JSON.stringify(cevap));
  };

  it('asks parents + appProperties, both spellings; the records come as ocr', async () => {
    const istekler: URLSearchParams[] = [];
    const r = await driveMetinAra('Fuß', ['k1'], getirici(istekler), undefined, { elYazisi: true });
    expect(istekler[0].get('fields')).toBe('nextPageToken,files(id,parents,appProperties)');
    expect(istekler[0].get('q')).toContain("(fullText contains 'Fuß' or fullText contains 'Fuss')");
    expect(r.ocr).toEqual([{ kaynak: 'pdf1', klasor: 'k1' }]);
  });

  it('without it: only ids, one spelling, no ocr', async () => {
    const istekler: URLSearchParams[] = [];
    const r = await driveMetinAra('Fuß', ['k1'], getirici(istekler));
    expect(istekler[0].get('fields')).toBe('nextPageToken,files(id)');
    expect(istekler[0].get('q')).not.toContain('Fuss');
    expect(r.ocr).toBeUndefined();
  });

  it('ocrBulgulari: only defterOcr=1 with a source', () => {
    expect(ocrBulgulari([
      { id: 'a', appProperties: { defterOcr: '1' } },
      { id: 'b', appProperties: { defterOcr: '0', defterOcrKaynak: 'x' } },
      { id: 'c', appProperties: { defterOcr: '1', defterOcrKaynak: 'x' } },
    ])).toEqual([{ kaynak: 'x', klasor: undefined }]);
  });
});
