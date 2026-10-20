import { describe, expect, it, vi } from 'vitest';
import { CopCakisma, CopIzinYok, CopKilitli, CopYazmaYok, CopYeriBeklenmedik } from './copeAt';
import { fakeDrive, KITAPLIK } from './icindekilerSahte';
import { kitapCopBasladi, kitapCopYaz, kitapGeriAlIsi, yeniKitapCopIsi, type KitapCopSecenek } from './kitapCop';

// Task 6.K5b: a book / a half-made book to the trash and "Geri al", with a made-up Drive (no request goes anywhere).
// deneme-1 (kb) is the second book on r1 in kitaplik.json (kl).

const sec = (o: Partial<KitapCopSecenek> = {}): KitapCopSecenek => ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, ...o });
const kitap = (klasorId = 'kb', kitapId = 'deneme-1') => yeniKitapCopIsi(kitapId, 'Deneme 1', klasorId);

describe('kitapCopYaz', () => {
  it('first the shelf entry out of kitaplik.json (other fields stay), then the folder trashed=true; the place kept', async () => {
    const f = fakeDrive();
    const oncesi = vi.fn(async () => { expect(f.yazmalar()).toEqual([]); });
    const is = kitap();
    await kitapCopYaz(f.drive, is, sec({ oncesi }));
    expect(oncesi).toHaveBeenCalledTimes(1);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:deneme-1:true']);
    expect(f.kitaplik()).toEqual({ ...KITAPLIK, raflar: [{ ...KITAPLIK.raflar[0], kitaplar: ['a', 'b'] }, KITAPLIK.raflar[1]] });
    expect(is.yerler).toEqual([{ rafId: 'r1', sira: 1 }]);
    expect(f.copte('t1')).toBe(true);
    expect(f.calls.some(c => /delete|empty/i.test(c))).toBe(false);
  });

  it('Geri al: the folder out of the trash first, then the entry at its old place', async () => {
    const f = fakeDrive();
    const is = kitap();
    await kitapCopYaz(f.drive, is, sec());
    const oncesi = vi.fn(async () => {});
    await kitapCopYaz(f.drive, kitapGeriAlIsi(is), sec({ oncesi }));
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:deneme-1:true', 'cop:deneme-1:false', 'jsonYaz']);
    expect(f.kitaplik()).toEqual(KITAPLIK);
    expect(f.copte('kb')).toBe(false);
    expect(oncesi).not.toHaveBeenCalled();
  });

  it('Vazgeç after the folder step failed: the entry goes back to its shelf and place (not "Yeni gelenler"); the folder never went', async () => {
    const f = fakeDrive({ copHata: ['ag'] });
    const is = kitap();
    await expect(kitapCopYaz(f.drive, is, sec())).rejects.toThrow(/bağlanılamadı/);
    expect(f.kitaplik().raflar[0].kitaplar).toEqual(['a', 'b']);
    expect(kitapCopBasladi(is)).toBe(true);
    await kitapCopYaz(f.drive, kitapGeriAlIsi(is), sec());
    expect(f.kitaplik()).toEqual(KITAPLIK);
    expect(f.copte('kb')).toBe(false);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:deneme-1:true', 'jsonYaz']);   // no trashed=false: it never was
  });

  it('Tekrar dene goes on where it stopped (the shelf is not written twice)', async () => {
    const f = fakeDrive({ copHata: ['ag'] });
    const is = kitap();
    await expect(kitapCopYaz(f.drive, is, sec())).rejects.toThrow();
    await kitapCopYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:deneme-1:true', 'cop:deneme-1:true']);
    expect(f.copte('kb')).toBe(true);
  });

  it('Geri al fails at the shelf: Tekrar dene writes only the shelf (the folder is not asked again)', async () => {
    const f = fakeDrive({ yazHata: ['ok', 'ag'] });
    const is = kitap();
    await kitapCopYaz(f.drive, is, sec());
    kitapGeriAlIsi(is);
    await expect(kitapCopYaz(f.drive, is, sec())).rejects.toThrow();
    expect(f.copte('kb')).toBe(false);
    await kitapCopYaz(f.drive, is, sec());
    expect(f.yazmalar().filter(x => x.endsWith(':false'))).toHaveLength(1);
    expect(f.kitaplik()).toEqual(KITAPLIK);
  });

  it('not a book folder in kitaplar/ (the root, kitaplar/, kitaplik.json, a unit, a file, another name) → nothing written', async () => {
    for (const [id, ad] of [['kok', 'Defter Library'], ['kitaplar', 'kitaplar'], ['kl', 'kitaplik.json'], ['u1', 'Unite-01-Logik'], ['kj', 'kitap.json'], ['kb', 'baska']] as const) {
      const f = fakeDrive();
      await expect(kitapCopYaz(f.drive, kitap(id, ad), sec())).rejects.toBeInstanceOf(CopYeriBeklenmedik);
      expect(f.yazmalar()).toEqual([]);
    }
  });

  it('locked, no root, not signed in → no request at all', async () => {
    for (const [s, hata] of [[{ kilitAcik: false }, CopKilitli], [{ kokKaynagi: null }, CopKilitli], [{ yazabilir: () => false }, CopYazmaYok]] as const) {
      const f = fakeDrive();
      const oncesi = vi.fn(async () => {});
      await expect(kitapCopYaz(f.drive, kitap(), sec({ ...s, oncesi }))).rejects.toBeInstanceOf(hata);
      expect(f.calls).toEqual([]);
      expect(oncesi).not.toHaveBeenCalled();
    }
  });

  it('the folder in the trash already = done; the entry still goes', async () => {
    const f = fakeDrive({ items: { kb: { name: 'deneme-1', parent: 'kitaplar', trashed: true } } });
    await kitapCopYaz(f.drive, kitap(), sec());
    expect(f.yazmalar()).toEqual(['jsonYaz']);
  });

  it('no kitaplik.json (the owner\'s root): only the folder', async () => {
    const f = fakeDrive({ sil: ['kl'] });
    await kitapCopYaz(f.drive, kitap(), sec({ kokKaynagi: 'ad' }));
    expect(f.yazmalar()).toEqual(['cop:deneme-1:true']);
  });

  it('kitaplik.json changed while it was read: once more; twice → CopCakisma, nothing written', async () => {
    const f = fakeDrive({ mtimeDegis: 2 });
    await expect(kitapCopYaz(f.drive, kitap(), sec())).rejects.toBeInstanceOf(CopCakisma);
    expect(f.yazmalar()).toEqual([]);
  });

  it('no permission (403) → CopIzinYok', async () => {
    const f = fakeDrive({ copHata: ['403'] });
    await expect(kitapCopYaz(f.drive, kitap(), sec())).rejects.toBeInstanceOf(CopIzinYok);
  });
});

describe('a half-made book', () => {
  const yarim = { yk: { name: 'deneme-5', parent: 'kitaplar', appProperties: { defter: '1', defterIslem: 'x' } }, yu: { name: 'Unite-01-A', parent: 'yk' } };
  it('ours and without kitap.json: only the folder (no shelf step); Geri al takes it out again', async () => {
    const f = fakeDrive({ items: yarim });
    const is = yeniKitapCopIsi('deneme-5', 'deneme-5', 'yk', true);
    await kitapCopYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['cop:deneme-5:true']);
    expect(f.kitaplik()).toEqual(KITAPLIK);
    await kitapCopYaz(f.drive, kitapGeriAlIsi(is), sec());
    expect(f.copte('yk')).toBe(false);
  });

  it('with a kitap.json, or not ours → nothing written', async () => {
    const f = fakeDrive({ items: { ...yarim, yj: { name: 'kitap.json', parent: 'yk', mimeType: 'application/json' } } });
    await expect(kitapCopYaz(f.drive, yeniKitapCopIsi('deneme-5', 'deneme-5', 'yk', true), sec())).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    const g = fakeDrive({ items: { yk: { ...yarim.yk, appProperties: {} } } });
    await expect(kitapCopYaz(g.drive, yeniKitapCopIsi('deneme-5', 'deneme-5', 'yk', true), sec())).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    expect([...f.yazmalar(), ...g.yazmalar()]).toEqual([]);
  });
});
