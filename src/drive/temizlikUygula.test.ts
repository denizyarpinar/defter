import { describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME, IZIN_LISTESI, OZET } from './temizlikIzin';
import { copeAt, temizlikCalistir, type PdfBilgi, type TemizlikDeps } from './temizlikUygula';

vi.mock('./drive', () => ({ driveFetch: vi.fn() }));

const KILIT = '?temizlik=1';
const ESKI = new Uint8Array(100);   // the kept revision's bytes (fake)

interface Cagri { path: string; method: string; body?: string }

// A fake Drive where every listed item still matches; degis changes one item's metadata
function sahteDrive(degis: Record<string, object> = {}, yabanci: Record<string, { id: string; name: string }[]> = {}) {
  const cagrilar: Cagri[] = [];
  const cevap = (j: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(j), { status }));
  const istek = vi.fn((path: string, init: RequestInit = {}) => {
    cagrilar.push({ path, method: (init.method ?? 'GET').toUpperCase(), body: init.body as string | undefined });
    const u = new URL(path, 'https://x/');
    const id = decodeURIComponent(u.pathname.split('/')[2] ?? '');
    if (init.method === 'PATCH') return cevap({ id, trashed: true });
    if (u.pathname === '/files') {
      const klasor = /'([^']+)' in parents/.exec(u.searchParams.get('q') ?? '')![1];
      const ic = IZIN_LISTESI.filter(o => o.ebeveyn === klasor).map(o => ({ id: o.id, name: o.ad }));
      return cevap({ files: [...ic, ...(yabanci[klasor] ?? [])] });
    }
    if (id === OZET.id) {
      if (u.pathname.includes('/revisions/')) {
        if (u.searchParams.get('alt') === 'media') return Promise.resolve(new Response(ESKI));
        return cevap({ id: OZET.rev, keepForever: true, size: String(ESKI.byteLength), modifiedTime: '2026-10-15T15:01:50.782Z' });
      }
      if (u.searchParams.get('alt') === 'media') return Promise.resolve(new Response(ESKI));
      return cevap({ id, name: OZET.ad, parents: [OZET.ebeveyn], trashed: false, mimeType: 'application/pdf',
        modifiedTime: 'mt1', headRevisionId: OZET.head, capabilities: { canEdit: true } });
    }
    const o = IZIN_LISTESI.find(x => x.id === id);
    if (!o) return cevap({}, 404);
    return cevap({ id, name: o.ad, parents: [o.ebeveyn], trashed: false,
      mimeType: o.tur === 'klasor' ? FOLDER_MIME : 'application/pdf', ...degis[id] });
  });
  return { istek, cagrilar };
}

function deps(istek: TemizlikDeps['istek'], ek: Partial<TemizlikDeps> = {}): TemizlikDeps {
  const simdi = new Uint8Array(68), yedek = new Uint8Array(2);
  const ekIdler68 = Array.from({ length: 68 }, (_, i) => i >= 27 ? OZET.yedekEkId : null);
  return {
    istek,
    bekleyenKalem: async () => [],
    bekleyenFoto: async () => [],
    kitap: () => undefined,
    kurdeleler: () => [],
    suankiOzet: async () => simdi,
    // told apart by size: the current file 68 bytes, the backup 2, the kept revision 100
    incele: async (b): Promise<PdfBilgi> => b.byteLength === simdi.byteLength ? { sayfa: 68, ekIdler: ekIdler68, not: 21 }
      : b.byteLength === yedek.byteLength ? { sayfa: 2, ekIdler: [OZET.yedekEkId, OZET.yedekEkId], not: 0 }
      : { sayfa: 27, ekIdler: Array(27).fill(null), not: 0 },
    sayfalariAyir: async () => yedek,
    yedekKaydet: vi.fn(),
    ozetYukle: vi.fn(async () => ({ modifiedTime: 'mt2', headRevisionId: 'yeni' })),
    ...ek
  };
}

const yazmalar = (c: Cagri[]) => c.filter(x => x.method !== 'GET');

describe('temizlikCalistir', () => {
  it('without the lock: no request at all, nothing uploaded', async () => {
    const { istek } = sahteDrive();
    const d = deps(istek);
    const r = await temizlikCalistir(d, { gercek: true, search: '' });
    expect(r.durdu).toContain('Kilit kapalı');
    expect(istek).not.toHaveBeenCalled();
    expect(d.ozetYukle).not.toHaveBeenCalled();
  });

  it('dry run: only GET requests, nothing uploaded; everything "would be done"', async () => {
    const { istek, cagrilar } = sahteDrive();
    const d = deps(istek);
    const r = await temizlikCalistir(d, { gercek: false, search: KILIT });
    expect(cagrilar.length).toBeGreaterThan(30);
    expect(yazmalar(cagrilar)).toEqual([]);
    expect(d.ozetYukle).not.toHaveBeenCalled();
    expect(r.satirlar.filter(s => s.sonuc === 'yapılacaktı')).toHaveLength(30);
    expect(r.satirlar.filter(s => s.sonuc === 'klasörüyle gidecek')).toHaveLength(5);
    expect(r.ozet.join('\n')).toContain('KURU');
  });

  it('real run: one PATCH trashed=true per cop item, nothing else written; ozet uploaded once', async () => {
    const { istek, cagrilar } = sahteDrive();
    const d = deps(istek);
    const r = await temizlikCalistir(d, { gercek: true, search: KILIT });
    const w = yazmalar(cagrilar);
    expect(w).toHaveLength(30);
    for (const x of w) {
      expect(x.method).toBe('PATCH');
      expect(JSON.parse(x.body!)).toEqual({ trashed: true });
    }
    const ids = w.map(x => decodeURIComponent(x.path.split('/')[1].split('?')[0]));
    expect(new Set(ids)).toEqual(new Set(IZIN_LISTESI.filter(o => o.islem === 'cop').map(o => o.id)));
    // folders last
    expect(ids.slice(-2)).toEqual(['1QPTtgpjRpUbK43euaaoPK0CdEan0mxqh', '1GOJWYdRhqquNl9ehtk6jSqbhgOkHdP1r']);
    expect(d.yedekKaydet).toHaveBeenCalledWith(expect.any(Uint8Array), OZET.yedekAd);
    expect(d.ozetYukle).toHaveBeenCalledWith(ESKI, 'mt1');
    expect(r.ozet.join('\n')).toContain('KONTROL TAMAM');
  });

  it('a changed item (name / parent / already trashed) is not written', async () => {
    const { istek, cagrilar } = sahteDrive({
      '1wwxe0XABj833onJBQmyI2KU7Bm4b5_eB': { name: 'baska.pdf' },
      '1WJNZgLPN8yZEGwz90g5GIPkyMR1ZhS0A': { parents: ['baska-klasor'] },
      '1WHZMJQYQQtQ4sd8TSm6-CL5TJJdG571q': { trashed: true },
    });
    const r = await temizlikCalistir(deps(istek), { gercek: true, search: KILIT });
    const yazilan = yazmalar(cagrilar).map(x => x.path).join('\n');
    for (const id of ['1wwxe0XABj833onJBQmyI2KU7Bm4b5_eB', '1WJNZgLPN8yZEGwz90g5GIPkyMR1ZhS0A', '1WHZMJQYQQtQ4sd8TSm6-CL5TJJdG571q']) {
      expect(yazilan).not.toContain(id);
      expect(r.satirlar.find(s => s.id === id)?.sonuc).toBe('atlandı');
    }
    expect(yazmalar(cagrilar)).toHaveLength(27);
  });

  it('a folder with an unknown file inside is not trashed', async () => {
    const K99 = '1GOJWYdRhqquNl9ehtk6jSqbhgOkHdP1r';
    const { istek, cagrilar } = sahteDrive({}, { [K99]: [{ id: 'gercek', name: 'gercek-not.pdf' }] });
    const r = await temizlikCalistir(deps(istek), { gercek: true, search: KILIT });
    expect(yazmalar(cagrilar).map(x => x.path).join('\n')).not.toContain(K99);
    expect(r.satirlar.find(s => s.id === K99)?.neden).toContain('gercek-not.pdf');
  });

  it.each([
    ['a pending pen record for ozet.pdf', { bekleyenKalem: async () => [OZET.id] }],
    ['a pending photo for Konu-01', { bekleyenFoto: async () => [{ islemId: 'i', konuKlasorId: OZET.ebeveyn, hedefAd: 'ozet.pdf' }] }],
    ['the pen store cannot be read', { bekleyenKalem: async () => null }],
  ] as [string, Partial<TemizlikDeps>][])('real run with %s: stops, nothing written', async (_, ek) => {
    const { istek, cagrilar } = sahteDrive();
    const d = deps(istek, ek);
    const r = await temizlikCalistir(d, { gercek: true, search: KILIT });
    expect(r.durdu).toContain('DURDU');
    expect(yazmalar(cagrilar)).toEqual([]);
    expect(d.ozetYukle).not.toHaveBeenCalled();
  });

  it('ozet.pdf: another head → no backup, no upload', async () => {
    const { istek } = sahteDrive();
    const d = deps(vi.fn(async (p: string, i?: RequestInit) => {
      const res = await istek(p, i);
      if (p.startsWith(`files/${OZET.id}?fields=`)) return new Response(JSON.stringify({ ...await res.json(), headRevisionId: 'baska' }));
      return res;
    }));
    const r = await temizlikCalistir(d, { gercek: true, search: KILIT });
    expect(r.ozet.join('\n')).toContain('head sürümü değişmiş');
    expect(d.yedekKaydet).not.toHaveBeenCalled();
    expect(d.ozetYukle).not.toHaveBeenCalled();
  });

  it('ozet.pdf: the kept revision is not 27 clean pages → no upload', async () => {
    const { istek } = sahteDrive();
    const base = deps(istek);
    const d = deps(istek, { incele: async b => b.byteLength === ESKI.byteLength ? { sayfa: 27, ekIdler: ['x', ...Array(26).fill(null)], not: 0 } : base.incele(b) });
    const r = await temizlikCalistir(d, { gercek: true, search: KILIT });
    expect(r.ozet.join('\n')).toContain('beklenen gibi değil');
    expect(d.ozetYukle).not.toHaveBeenCalled();
  });
});

describe('copeAt', () => {
  it('an id not on the list (or a klasorle item) throws before any request', async () => {
    const istek = vi.fn();
    await expect(copeAt(istek, OZET.id)).rejects.toThrow('İzin listesinde olmayan');
    await expect(copeAt(istek, '1RVYQrYARDyW8lLnaEUBKuRih0dRVUxwv')).rejects.toThrow('İzin listesinde olmayan');
    expect(istek).not.toHaveBeenCalled();
  });
});
