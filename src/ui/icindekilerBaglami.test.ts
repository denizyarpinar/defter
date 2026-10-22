import { describe, expect, it, vi } from 'vitest';
import { fakeDrive, KITAP, sec } from '../drive/icindekilerSahte';
import type { IcindekilerIstegi } from '../drive/icindekilerYaz';
import { kitabaUygula, type IcindekilerIslemi } from '../kitap/icindekiler';
import { parseBook } from '../model/parse';
import { icindekilerBaglamiKur } from './icindekilerBaglami';

// Task 6.K5a-2: "Tekrar dene" ends like the first try; "Vazgeç" brings the screen back to Drive.
// The real queue with a made-up Drive (no request goes anywhere).

function kur(f: ReturnType<typeof fakeDrive>, o: { yenile?: () => void; jsonYok?: boolean } = {}) {
  const b = parseBook('deneme-1', structuredClone(KITAP));
  const yenile = vi.fn(o.yenile ?? (() => {}));
  let n = 0;
  const k = icindekilerBaglamiKur({
    drive: f.drive, secenek: () => sec(), kilitAcik: true, hasJson: () => true, uniteKlasorleri: async () => [],
    kitap: id => id === 'deneme-1' ? b : undefined, yenile,
    jsonOku: async () => { if (o.jsonYok) throw new TypeError('Failed to fetch'); return f.kitap(); },
    girisYap() {}, islemId: () => 'islem-' + ++n
  });
  const dinleyici = vi.fn();
  k.baglam.dinle(dinleyici);
  // as the edit mode does: names and order change in memory at once, then go to the queue with their undo
  const iyimser = (istek: IcindekilerIstegi & IcindekilerIslemi, geri: IcindekilerIslemi) => { kitabaUygula(b, istek); k.baglam.gonder(b, istek, geri); };
  const durum = () => k.baglam.durum().tur;
  const bekle = (tur: string) => vi.waitFor(() => expect(durum()).toBe(tur));
  const adlar = () => b.uniteler.map(u => `${u.baslik}: ${u.konular.map(t => t.baslik).join(', ')}`);
  return { b, k, yenile, dinleyici, iyimser, durum, bekle, adlar };
}

describe('Tekrar dene: the same as the first try', () => {
  it('a topic added: the book in memory, the refresh, the listeners, "kaydedildi"', async () => {
    const f = fakeDrive({ davranis: ['ag', 'ag', 'ag'] });
    const t = kur(f);
    t.k.baglam.gonder(t.b, { tur: 'konuEkle', unite: 'k:Unite-01-Logik', uniteSira: 0, baslik: 'Induktion' });
    await t.bekle('hata');
    expect(t.k.baglam.bekleyenEklemeler(t.b)).toHaveLength(1);   // "Ekleniyor…" stays
    expect(t.yenile).not.toHaveBeenCalled();
    t.dinleyici.mockClear();
    t.k.baglam.tekrarDene();
    await t.bekle('kaydedildi');
    expect(t.b.uniteler[0].konular.map(x => x.baslik)).toEqual(['Aussagen', 'Beweisen', 'Induktion']);
    expect(t.k.baglam.bekleyenEklemeler(t.b)).toEqual([]);
    expect(t.yenile).toHaveBeenCalledTimes(1);
    expect(t.dinleyici).toHaveBeenCalled();
    expect(f.olusturmalar()).toHaveLength(4);   // 3 failed tries, then one folder
    expect(f.kitap().uniteler[0].konular).toHaveLength(3);
  });

  it('a name: written on the retry, the refresh and the listeners', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f);
    t.iyimser({ tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagenlogik' }, { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagen' });
    await t.bekle('hata');
    t.dinleyici.mockClear();
    t.k.baglam.tekrarDene();
    await t.bekle('kaydedildi');
    expect(f.kitap().uniteler[0].konular[0].baslik).toBe('Aussagenlogik');
    expect(t.b.uniteler[0].konular[0].baslik).toBe('Aussagenlogik');
    expect(t.yenile).toHaveBeenCalledTimes(1);
    expect(t.dinleyici).toHaveBeenCalled();
  });

  it('an order: written on the retry, the refresh and the listeners', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f);
    const sira = ['Unite-01-Logik/Konu-02-Beweisen', 'Unite-01-Logik/Konu-01-Aussagen'];
    t.iyimser({ tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira }, { tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira: [...sira].reverse() });
    await t.bekle('hata');
    t.k.baglam.tekrarDene();
    await t.bekle('kaydedildi');
    expect(f.kitap().uniteler[0].konular.map(x => x.baslik)).toEqual(['Beweisen', 'Aussagen']);
    expect(t.yenile).toHaveBeenCalledTimes(1);
  });

  it('a refresh that fails does not turn a written change into an error', async () => {
    const f = fakeDrive();
    const t = kur(f, { yenile: () => { throw new Error('çizim'); } });
    const uyari = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t.k.baglam.gonder(t.b, { tur: 'uniteEkle', baslik: 'Graphen' });
    await t.bekle('kaydedildi');
    expect(t.k.kuyruk.bekleyenler).toHaveLength(0);
    expect(t.b.uniteler.at(-1)!.baslik).toBe('Graphen');
    expect(t.k.iz()).toContain('yenile hata');
    uyari.mockRestore();
  });
});

describe('Vazgeç: back to Drive', () => {
  it('a name: the one in kitap.json comes back', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f);
    t.iyimser({ tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'Logik und Beweise' }, { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'Logik' });
    await t.bekle('hata');
    t.dinleyici.mockClear();
    await t.k.vazgec();
    expect(t.b.uniteler[0].baslik).toBe('Logik');
    expect(t.durum()).toBe('bos');
    expect(t.yenile).toHaveBeenCalledTimes(1);
    expect(t.dinleyici).toHaveBeenCalled();
  });

  it('kitap.json can\'t be read: the order before the change comes back', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f, { jsonYok: true });
    const uyari = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const once = ['k:Unite-01-Logik', 'b:Leer#0'];
    t.iyimser({ tur: 'uniteSirasi', sira: ['b:Leer#0', 'k:Unite-01-Logik'] }, { tur: 'uniteSirasi', sira: once });
    expect(t.b.uniteler.map(u => u.baslik)).toEqual(['Leer', 'Logik']);
    await t.bekle('hata');
    await t.k.vazgec();
    expect(t.b.uniteler.map(u => u.baslik)).toEqual(['Logik', 'Leer']);
    uyari.mockRestore();
  });

  it('a change still waiting behind it stays on the screen (and is written)', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f);
    t.iyimser({ tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'X' }, { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagen' });
    const sira = ['Unite-01-Logik/Konu-02-Beweisen', 'Unite-01-Logik/Konu-01-Aussagen'];
    t.iyimser({ tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira }, { tur: 'konuSirasi', unite: 'k:Unite-01-Logik', sira: [...sira].reverse() });
    await t.bekle('hata');
    await t.k.vazgec();
    expect(t.adlar()[0]).toBe('Logik: Beweisen, Aussagen');
    await t.bekle('kaydedildi');
    expect(f.kitap().uniteler[0].konular.map(x => x.baslik)).toEqual(['Beweisen', 'Aussagen']);
  });

  it('adding: dropped, the book in memory does not change', async () => {
    const f = fakeDrive({ davranis: ['ag', 'ag', 'ag'] });
    const t = kur(f);
    const once = t.adlar();
    t.k.baglam.gonder(t.b, { tur: 'uniteEkle', baslik: 'Graphen' });
    await t.bekle('hata');
    await t.k.vazgec();
    expect(t.adlar()).toEqual(once);
    expect(t.k.baglam.bekleyenEklemeler(t.b)).toEqual([]);
    expect(t.durum()).toBe('bos');
  });
});
