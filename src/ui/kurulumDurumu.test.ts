import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import { kokBul, type KokAday, type KokCocuk, type KokDrive, type KokModu, type KokSonucu } from '../drive/kok';
import { kartSec, KurulumAkisi, kurulumGerekli } from './kurulumDurumu';

const eski: KokAday = { id: 'K', name: 'Kitaplık' };
const d1: KokAday = { id: 'D1', name: 'Defter Library', createdTime: '2026-10-19T10:00:00Z' };
const d2: KokAday = { id: 'D2', name: 'Defter Library', createdTime: '2026-10-19T09:00:00Z' };
const tam: KokCocuk[] = [{ name: 'kitaplar', mimeType: FOLDER_MIME }, { name: 'kitaplik.json', mimeType: 'application/json' }];
const sadeceKitaplar: KokCocuk[] = [tam[0]];

// Drive's state → the real kokBul result (so mode × Drive is tested as main.ts sees it)
const drive = (adla: KokAday[], defterKok: KokAday[], cocuklar: KokCocuk[]): KokDrive => ({
  adlaAra: async () => adla, defterKokAra: async () => defterKok, kokCocuklari: async () => cocuklar
});

describe('kurulumGerekli', () => {
  const ornekler: Array<[string, KokSonucu, ReturnType<typeof kurulumGerekli>]> = [
    ['no root', { tur: 'yok' }, 'kur'],
    ['our root, whole', { tur: 'bulundu', kok: d1, kaynak: 'defterKok' }, null],
    ['our root, half', { tur: 'yarim', kok: d1, kaynak: 'defterKok', eksik: ['kitaplik.json'] }, 'tamamla'],
    ['the owner\'s Kitaplık, half (loaded as before)', { tur: 'yarim', kok: eski, kaynak: 'ad', eksik: ['kitaplik.json'] }, null],
    ['the owner\'s Kitaplık, whole', { tur: 'bulundu', kok: eski, kaynak: 'ad' }, null],
    ['two roots, the oldest whole', { tur: 'cokKok', kok: d2, kokler: [d2, d1], uyari: 'x', eksik: [] }, null],
    ['two roots, the oldest half', { tur: 'cokKok', kok: d2, kokler: [d2, d1], uyari: 'x', eksik: ['kitaplar'] }, 'tamamla'],
  ];
  for (const [ad, kok, beklenen] of ornekler) it(ad, () => expect(kurulumGerekli(kok)).toBe(beklenen));
});

describe('kartSec: mode × Drive × owner × lock', () => {
  type Satir = { ad: string; mod: KokModu; sahip: boolean; d: KokDrive; beklenen: ReturnType<typeof kartSec> };
  const tablo: Satir[] = [
    { ad: 'dar, nothing', mod: 'dar', sahip: false, d: drive([], [], []), beklenen: { kart: 'kurulum', dugme: 'kur', kilitli: false } },
    { ad: 'dar, an old Kitaplık is not seen', mod: 'dar', sahip: false, d: drive([eski], [], tam), beklenen: { kart: 'kurulum', dugme: 'kur', kilitli: false } },
    { ad: 'dar, our root whole', mod: 'dar', sahip: false, d: drive([], [d1], tam), beklenen: { kart: null } },
    { ad: 'dar, our root half', mod: 'dar', sahip: false, d: drive([], [d1], sadeceKitaplar), beklenen: { kart: 'kurulum', dugme: 'tamamla', kilitli: false } },
    { ad: 'dar, two roots, oldest half', mod: 'dar', sahip: false, d: drive([], [d1, d2], []), beklenen: { kart: 'kurulum', dugme: 'tamamla', kilitli: false } },
    { ad: 'tam owner, neither', mod: 'tam', sahip: true, d: drive([], [], []), beklenen: { kart: 'kurulum', dugme: 'kur', kilitli: false } },
    { ad: 'tam owner, Kitaplık', mod: 'tam', sahip: true, d: drive([eski], [d1], tam), beklenen: { kart: null } },
    { ad: 'tam owner, Kitaplık without kitaplik.json', mod: 'tam', sahip: true, d: drive([eski], [], sadeceKitaplar), beklenen: { kart: null } },
    { ad: 'tam owner, only our root', mod: 'tam', sahip: true, d: drive([], [d1], tam), beklenen: { kart: null } },
    { ad: 'owner with drive.file: full access first, even with no root', mod: 'dar', sahip: true, d: drive([], [], []), beklenen: { kart: 'tamErisim' } },
    { ad: 'owner with drive.file: full access first, even with our root', mod: 'dar', sahip: true, d: drive([], [d1], tam), beklenen: { kart: 'tamErisim' } },
  ];
  for (const s of tablo) {
    it(s.ad, async () => {
      const kok = await kokBul(s.d, s.mod);
      expect(kartSec({ sahip: s.sahip, aktif: s.mod, kok, kilitAcik: true })).toEqual(s.beklenen);
    });
  }

  it('without ?kurulum=1: the same card, the button locked', () => {
    expect(kartSec({ sahip: false, aktif: 'dar', kok: { tur: 'yok' }, kilitAcik: false })).toEqual({ kart: 'kurulum', dugme: 'kur', kilitli: true });
    expect(kartSec({ sahip: false, aktif: 'dar', kok: { tur: 'yarim', kok: d1, kaynak: 'defterKok', eksik: ['kitaplar'] }, kilitAcik: false }))
      .toEqual({ kart: 'kurulum', dugme: 'tamamla', kilitli: true });
  });

  it('the lock never hides the full access card', () => {
    expect(kartSec({ sahip: true, aktif: 'dar', kok: { tur: 'yok' }, kilitAcik: false })).toEqual({ kart: 'tamErisim' });
    expect(kartSec({ sahip: true, aktif: null, kok: { tur: 'yok' }, kilitAcik: true })).toEqual({ kart: 'tamErisim' });
  });
});

describe('KurulumAkisi: click lock and islemId', () => {
  const sayac = () => { let n = 0; return () => `islem-${++n}`; };

  it('a second tap while running does nothing', () => {
    const a = new KurulumAkisi(sayac());
    a.yeniKart();
    expect(a.basla(true)).toBe(true);
    expect(a.basla(true)).toBe(false);
    a.bitti();
    expect(a.basla(true)).toBe(true);
  });

  it('locked (?kurulum=1 missing): never starts', () => {
    const a = new KurulumAkisi(sayac());
    a.yeniKart();
    expect(a.basla(false)).toBe(false);
    expect(a.basla(false)).toBe(false);
  });

  it('"Tekrar dene" uses the same islemId', () => {
    const a = new KurulumAkisi(sayac());
    a.yeniKart();
    a.basla(true);
    const ilk = a.islemId;
    a.bitti();   // the error came back
    a.basla(true);
    expect(a.islemId).toBe(ilk);
    expect(ilk).toBe('islem-1');
  });

  it('a new card opening: a new islemId; not while running', () => {
    const a = new KurulumAkisi(sayac());
    a.yeniKart();
    expect(a.islemId).toBe('islem-1');
    a.basla(true);
    a.yeniKart();
    expect(a.islemId).toBe('islem-1');
    a.bitti();
    a.yeniKart();
    expect(a.islemId).toBe('islem-2');
  });
});
