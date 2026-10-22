import { describe, expect, it } from 'vitest';
import { CopAgHatasi, CopIzinYok, CopKilitli, CopYazmaYok, CopYeriBeklenmedik } from './copeAt';
import { dosyaCopYaz, dosyaGeriAlIsi, GeriAlAdDolu, yeniDosyaCopIsi, type DosyaCopSecenek } from './dosyaCop';
import { fakeDrive, KITAP } from './icindekilerSahte';

// Task 6.K6b: the reader's open file (and its solution) to the trash and "Geri al", with a made-up Drive.

const K1 = 'Unite-01-Logik/Konu-01-Aussagen';
const PDF = 'application/pdf';
// Konu-01 gets Uebungen/ with blatt1.pdf + blatt1_cozum.pdf; Konu-02's orijinal.pdf is f3
const UEB = {
  ue: { name: 'Uebungen', parent: 't1' },
  b1: { name: 'blatt1.pdf', parent: 'ue', mimeType: PDF, appProperties: {} },
  b1c: { name: 'blatt1_cozum.pdf', parent: 'ue', mimeType: PDF, appProperties: {} }
};
const KURDELELI = {
  ...structuredClone(KITAP),
  kurdele: { konu: K1, materyal: 'uebungen', dosya: 'blatt1_cozum.pdf', sayfa: 2 },
  uniteler: [
    { ...KITAP.uniteler[0], konular: [
      { ...KITAP.uniteler[0].konular[0], kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 }, uebungen: { dosya: 'blatt1.pdf', sayfa: 1 } } },
      KITAP.uniteler[0].konular[1]
    ] },
    KITAP.uniteler[1]
  ]
};

const sec = (o: Partial<DosyaCopSecenek> = {}): DosyaCopSecenek => ({
  kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: 2, kitapKlasorId: 'kb', kitapJsonId: 'kj', ...o
});
const blatt = (cozum = true) => yeniDosyaCopIsi('deneme-1', K1, 'uebungen', [
  { id: 'b1', ad: 'blatt1.pdf' }, ...(cozum ? [{ id: 'b1c', ad: 'blatt1_cozum.pdf' }] : [])
]);

describe('a file to the trash', () => {
  it('kitap.json first (the ribbons on it out), then the file, then its solution; nothing deleted', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI });
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:blatt1.pdf:true', 'cop:blatt1_cozum.pdf:true']);
    expect(f.copte('b1') && f.copte('b1c')).toBe(true);
    expect(f.copte('ue')).toBe(false);   // the folder never goes (also when it is empty now)
    const k = f.kitap();
    expect(k.kurdele).toBeNull();
    expect(k.uniteler[0].konular[0].kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 3 } });   // the other one stays
    expect(k.bilinmeyen).toBe(7);
    expect(f.calls.some(c => /delete|empty/i.test(c))).toBe(false);
  });

  it('the solution box off: only the file (no request for the solution)', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI });
    await dosyaCopYaz(f.drive, blatt(false), sec());
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:blatt1.pdf:true']);
    expect(f.copte('b1c')).toBe(false);
    // the book's ribbon is on the solution: it stays
    expect(f.kitap().kurdele).toEqual(KURDELELI.kurdele);
  });

  it('no ribbon on it: kitap.json is not written', async () => {
    const f = fakeDrive({ items: UEB });
    await dosyaCopYaz(f.drive, blatt(), sec());
    expect(f.yazmalar()).toEqual(['cop:blatt1.pdf:true', 'cop:blatt1_cozum.pdf:true']);
  });

  it('a file right in the topic folder (orijinal.pdf)', async () => {
    const f = fakeDrive();
    await dosyaCopYaz(f.drive, yeniDosyaCopIsi('deneme-1', K1, 'orijinal', [{ id: 'f1', ad: 'orijinal.pdf' }]), sec());
    expect(f.yazmalar()).toEqual(['cop:orijinal.pdf:true']);
  });

  it('the book\'s other writers first (oncesi), only for the trash', async () => {
    const f = fakeDrive({ items: UEB });
    const sira: string[] = [];
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec({ oncesi: async () => { sira.push('oncesi'); } }));
    expect(sira).toEqual(['oncesi']);
    await dosyaCopYaz(f.drive, dosyaGeriAlIsi(is), sec({ oncesi: async () => { sira.push('oncesi'); } }));
    expect(sira).toEqual(['oncesi']);
  });
});

describe('the guard: no write', () => {
  const yazmaYok = async (items: Record<string, { name: string; parent: string; mimeType?: string; appProperties?: Record<string, string> }>, is: ReturnType<typeof blatt>) => {
    const f = fakeDrive({ items: { ...UEB, ...items }, kitap: KURDELELI });
    await expect(dosyaCopYaz(f.drive, is, sec())).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    expect(f.yazmalar()).toEqual([]);
  };

  it('a file of another topic', () => yazmaYok({}, yeniDosyaCopIsi('deneme-1', K1, 'orijinal', [{ id: 'f3', ad: 'orijinal.pdf' }])));
  it('a folder', () => yazmaYok({}, yeniDosyaCopIsi('deneme-1', K1, 'uebungen', [{ id: 'ue', ad: 'Uebungen' }])));
  it('a name that is not the expected one', () => yazmaYok({}, yeniDosyaCopIsi('deneme-1', K1, 'uebungen', [{ id: 'b1', ad: 'blatt2.pdf' }])));
  it('a subfolder that is not Uebungen / Oedevler', () => yazmaYok({ ue: { name: 'Sonstiges', parent: 't1' } }, blatt()));
  it('Uebungen of another topic', () => yazmaYok({ ue: { name: 'Uebungen', parent: 't2' } }, blatt()));
  it('a file deeper down', () => yazmaYok({ x: { name: 'x', parent: 'ue' }, b1: { name: 'blatt1.pdf', parent: 'x', mimeType: PDF } }, blatt(false)));
  it('kitap.json, kitaplik.json', () => yazmaYok({}, yeniDosyaCopIsi('deneme-1', K1, 'orijinal', [{ id: 'kl', ad: 'kitaplik.json' }])));
  it('the solution in the wrong place (the file is fine): nothing written at all', () =>
    yazmaYok({ b1c: { name: 'blatt1_cozum.pdf', parent: 't2', mimeType: PDF } }, blatt()));

  it('locked / not writable / surum 1: no request at all', async () => {
    const f = fakeDrive({ items: UEB });
    await expect(dosyaCopYaz(f.drive, blatt(), sec({ kilitAcik: false }))).rejects.toBeInstanceOf(CopKilitli);
    await expect(dosyaCopYaz(f.drive, blatt(), sec({ kokKaynagi: null }))).rejects.toBeInstanceOf(CopKilitli);
    await expect(dosyaCopYaz(f.drive, blatt(), sec({ yazabilir: () => false }))).rejects.toBeInstanceOf(CopYazmaYok);
    await expect(dosyaCopYaz(f.drive, blatt(), sec({ surum: 1 }))).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    await expect(dosyaCopYaz(f.drive, blatt(), sec({ kitapJsonId: undefined }))).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    expect(f.calls).toEqual([]);
  });
});

describe('errors and Tekrar dene', () => {
  it('the network fails at the solution: Tekrar dene goes on there (kitap.json and the file not again)', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI, copHata: ['ok', 'ag'] });
    const is = blatt();
    await expect(dosyaCopYaz(f.drive, is, sec())).rejects.toBeInstanceOf(CopAgHatasi);
    await dosyaCopYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:blatt1.pdf:true', 'cop:blatt1_cozum.pdf:true', 'cop:blatt1_cozum.pdf:true']);
    expect(f.copte('b1c')).toBe(true);
  });

  it('403 → CopIzinYok', async () => {
    const f = fakeDrive({ items: UEB, copHata: ['403'] });
    await expect(dosyaCopYaz(f.drive, blatt(), sec())).rejects.toBeInstanceOf(CopIzinYok);
  });

  it('the answer lost after it was trashed: a retry sees it in the trash (no second request)', async () => {
    const f = fakeDrive({ items: UEB, copHata: ['agAmaOlustu'] });
    const is = blatt(false);
    await expect(dosyaCopYaz(f.drive, is, sec())).rejects.toBeInstanceOf(CopAgHatasi);
    await dosyaCopYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['cop:blatt1.pdf:true']);
  });
});

describe('Geri al', () => {
  it('the reverse: the solution, the file, then the ribbons back', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI });
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec());
    f.calls.length = 0;
    await dosyaCopYaz(f.drive, dosyaGeriAlIsi(is), sec());
    expect(f.yazmalar()).toEqual(['cop:blatt1_cozum.pdf:false', 'cop:blatt1.pdf:false', 'jsonYaz']);
    expect(f.copte('b1') || f.copte('b1c')).toBe(false);
    const k = f.kitap();
    expect(k.kurdele).toEqual(KURDELELI.kurdele);
    expect(k.uniteler[0].konular[0].kurdeleler).toEqual(KURDELELI.uniteler[0].konular[0].kurdeleler);
  });

  it('a ribbon set meanwhile is not overwritten', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI });
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec());
    const yeni = { konu: K1, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 9 };
    f.items.get('kj')!.icerik = JSON.stringify({ ...f.kitap(), kurdele: yeni });
    await dosyaCopYaz(f.drive, dosyaGeriAlIsi(is), sec());
    expect(f.kitap().kurdele).toEqual(yeni);
    expect(f.kitap().uniteler[0].konular[0].kurdeleler).toEqual(KURDELELI.uniteler[0].konular[0].kurdeleler);
  });

  it('a new file with the same name meanwhile (e.g. a new orijinal.pdf): nothing comes back, the ribbons stay out', async () => {
    const kitap = { ...structuredClone(KITAP), kurdele: { konu: K1, materyal: 'orijinal', dosya: 'orijinal.pdf', sayfa: 4 } };
    const f = fakeDrive({ kitap });
    const is = yeniDosyaCopIsi('deneme-1', K1, 'orijinal', [{ id: 'f1', ad: 'orijinal.pdf' }]);
    await dosyaCopYaz(f.drive, is, sec());
    expect(f.kitap().kurdele).toBeNull();
    f.items.set('yeni', { name: 'Orijinal.pdf', parent: 't1', mimeType: PDF, appProperties: { defter: '1' } });   // any case
    f.calls.length = 0;
    await expect(dosyaCopYaz(f.drive, dosyaGeriAlIsi(is), sec())).rejects.toBeInstanceOf(GeriAlAdDolu);
    expect(f.yazmalar()).toEqual([]);
    expect(f.copte('f1')).toBe(true);
    expect(f.kitap().kurdele).toBeNull();
    expect(new GeriAlAdDolu().message).toBe('Aynı adlı yeni bir dosya var; eski dosya Drive çöpünde kaldı.');
  });

  it('the same name for the solution: neither comes back', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI });
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec());
    f.items.set('yeni', { name: 'blatt1_cozum.pdf', parent: 'ue', mimeType: PDF, appProperties: {} });
    f.calls.length = 0;
    await expect(dosyaCopYaz(f.drive, dosyaGeriAlIsi(is), sec())).rejects.toBeInstanceOf(GeriAlAdDolu);
    expect(f.yazmalar()).toEqual([]);
  });

  it('a failing step: Tekrar dene goes on (its own file that came back is not a name clash)', async () => {
    const f = fakeDrive({ items: UEB, kitap: KURDELELI, copHata: ['ok', 'ok', 'ok', 'ag'] });
    const is = blatt();
    await dosyaCopYaz(f.drive, is, sec());
    dosyaGeriAlIsi(is);
    await expect(dosyaCopYaz(f.drive, is, sec())).rejects.toBeInstanceOf(CopAgHatasi);
    expect(f.copte('b1c')).toBe(false);
    await dosyaCopYaz(f.drive, is, sec());
    expect(f.copte('b1') || f.copte('b1c')).toBe(false);
    expect(f.yazmalar().filter(c => c.endsWith(':false'))).toEqual(['cop:blatt1_cozum.pdf:false', 'cop:blatt1.pdf:false', 'cop:blatt1.pdf:false']);
    expect(f.kitap().kurdele).toEqual(KURDELELI.kurdele);
  });
});
