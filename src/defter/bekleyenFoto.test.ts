import { describe, expect, it } from 'vitest';
import { BekleyenFotoDepo } from './bekleyenFoto';
import { BekleyenFotoHatasi, yeniKayit } from './bekleyenFotoKayit';

// Task 5.8e: without IndexedDB (Node has none; a private tab, an old browser) every call rejects
// with a clear error. Nothing is swallowed: "Ekle" must stop before any network.

describe('BekleyenFotoDepo without IndexedDB', () => {
  it('every call rejects as BekleyenFotoHatasi idb-yok', async () => {
    expect(typeof indexedDB).toBe('undefined');
    const d = new BekleyenFotoDepo();
    const k = yeniKayit({ kitapAdi: 'b', konuKlasorId: 'K', konuBaslik: 'K', hedefAd: 'ozet.pdf',
      jpegler: [{ bytes: new Uint8Array([1]), width: 1, height: 1 }] }, 't', 'is-1');
    const calls: Promise<unknown>[] = [
      d.kaydet(k), d.hepsi(), d.konuIcin('K'), d.durumGuncelle('is-1', x => x), d.sil('is-1'), d.toplamBoyut(),
    ];
    for (const c of calls) {
      const e = await c.then(() => null, (err: unknown) => err);
      expect(e).toBeInstanceOf(BekleyenFotoHatasi);
      expect((e as BekleyenFotoHatasi).tur).toBe('idb-yok');
      expect((e as BekleyenFotoHatasi).message).toContain('cihazda saklayamıyor');
    }
  });
});
