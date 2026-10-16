import { describe, expect, it } from 'vitest';
import { SessionExpired } from '../drive/drive';
import { DosyaOlusturAgHatasi } from '../drive/pdfOlustur';
import { PdfReadOnly } from '../drive/pdfYazici';
import { BekleyenFotoHatasi, GecisHatasi, yeniKayit, type BekleyenFoto } from './bekleyenFotoKayit';
import { FotoEkleyici, type FotoEklemeUI } from './fotoEkleme';
import { acilisToastMetni, basariMetni, durumMetni, kartMetni, kisaNeden, seritDurumu } from './fotoEklemeMetin';
import { HedefOzetDegil, OzetSecilmeli, type KonuEklemeOrtami, type KonuyaEklendi } from './konuyaEkle';
import { DosyaBulunamadi, SayfaEklemeAgHatasi, SayfaEklemeCakisma } from './ozeteEkle';

// Task 5.8f: the texts of adding photos, and the flow store → Drive → remove.

const jpeg = { bytes: new Uint8Array([1, 2, 3]), width: 10, height: 20 };
const kayit = (islemId: string, n = 2, konu = 'K'): BekleyenFoto =>
  yeniKayit({ kitapAdi: 'b', konuKlasorId: konu, konuBaslik: 'Konu', hedefAd: 'ozet.pdf', jpegler: Array(n).fill(jpeg) }, 't0', islemId);
const sonuc = (x: Partial<KonuyaEklendi>): KonuyaEklendi =>
  ({ tur: 'eklendi', fileId: 'F', ad: 'ozet.pdf', eskiSayfa: 24, yeniSayfa: 26, zatenVardi: false, islemId: 'i', ...x });

describe('basariMetni / durumMetni', () => {
  it('added, new file, already there', () => {
    expect(basariMetni(sonuc({}))).toBe('ozet.pdf\'e eklendi: 24 → 26 sayfa');
    expect(basariMetni(sonuc({ tur: 'yeni', eskiSayfa: 0, yeniSayfa: 2 }))).toBe('Yeni ozet.pdf oluşturuldu (2 sayfa)');
    expect(basariMetni(sonuc({ zatenVardi: true }))).toBe('Bu fotoğraflar zaten eklenmişti');
  });
  it('status', () => {
    expect(durumMetni(2)).toBe('2 fotoğraf ekleniyor…');
    expect(durumMetni(0)).toBeNull();
  });
});

describe('kisaNeden / kartMetni', () => {
  it('no connection', () => {
    for (const e of [new TypeError('Failed to fetch'), new SayfaEklemeAgHatasi(), new DosyaOlusturAgHatasi()]) {
      expect(kisaNeden(e)).toBe('İnternet yok ya da Drive\'a ulaşılamadı');
    }
  });
  it('summary errors in plain Turkish', () => {
    const f = (name: string) => ({ id: name, name, mimeType: 'application/pdf', modifiedTime: 't' });
    expect(kisaNeden(new OzetSecilmeli([f('brifing.pdf'), f('sorular.pdf')]))).toContain('birden çok özet var (brifing.pdf, sorular.pdf)');
    expect(kisaNeden(new HedefOzetDegil())).toBe('Seçilen dosya artık bu konunun özeti değil');
    expect(kisaNeden(new DosyaBulunamadi())).toContain('bulunamadı');
  });
  it('the others', () => {
    expect(kisaNeden(new PdfReadOnly())).toContain('yazma iznin yok');
    expect(kisaNeden(new SayfaEklemeCakisma())).toContain('başka bir cihazda');
    expect(kisaNeden(new SessionExpired())).toContain('Google ile giriş');
    expect(kisaNeden(new GecisHatasi('x', 'yukleniyor', 'yukleniyor'))).toContain('şu an ekleniyor');
    expect(kisaNeden(new BekleyenFotoHatasi('kota'))).toBe('Cihazda yer kalmadı; fotoğraflar kaydedilemedi. Biraz yer aç ve tekrar dene');
    expect(kisaNeden(new Error('x'))).toBe('Beklenmeyen bir hata oldu');
    expect(kisaNeden('x')).toBe('Beklenmeyen bir hata oldu');
  });
  it('card text', () => {
    expect(kartMetni('İnternet yok')).toBe('Fotoğraflar eklenemedi: İnternet yok. Cihazda saklandı.');
  });
});

describe('seritDurumu / acilisToastMetni', () => {
  const a = kayit('a', 2), b = kayit('b', 3);
  it('counts the photos of the waiting records', () => {
    const d = seritDurumu([a, b], new Set(), new Set());
    expect(d).toMatchObject({ goster: true, fotoSayisi: 5, metin: 'Bu konuda eklenmeyi bekleyen 5 fotoğraf var' });
    expect(d.kayitlar.map(k => k.islemId)).toEqual(['a', 'b']);
  });
  it('running ones and ones with a card don\'t count', () => {
    expect(seritDurumu([a, b], new Set(['a']), new Set()).fotoSayisi).toBe(3);
    expect(seritDurumu([a, b], new Set(['a']), new Set(['b'])).goster).toBe(false);
    expect(seritDurumu([], new Set(), new Set()).goster).toBe(false);
  });
  it('reminder at the start', () => {
    expect(acilisToastMetni([a, b])).toBe('Cihazda eklenmeyi bekleyen 5 fotoğraf var. İlgili konuyu açınca ekleyebilirsin.');
    expect(acilisToastMetni([])).toBeNull();
  });
});

// ---- the flow, with a store in memory ----

function kur(ekle: (konu: string, j: unknown, o: unknown, s: { islemId?: string; hedefFileId?: string }) => Promise<KonuyaEklendi>, kaydetHata?: unknown) {
  const kayitlar = new Map<string, BekleyenFoto>();
  const olaylar: string[] = [];
  const depo = {
    async kaydet(k: BekleyenFoto) { if (kaydetHata) throw kaydetHata; kayitlar.set(k.islemId, structuredClone(k)); },
    async durumGuncelle(id: string, g: (k: BekleyenFoto) => BekleyenFoto) {
      const k = kayitlar.get(id);
      if (!k) return null;
      const y = g(k);
      kayitlar.set(id, y);
      return y;
    },
    async sil(id: string) { kayitlar.delete(id); },
  };
  const ui: FotoEklemeUI = {
    durum: m => olaylar.push(`durum:${m}`),
    basari: (_, m) => olaylar.push(`basari:${m}`),
    hata: (_, m) => olaylar.push(`hata:${m}`),
  };
  const e = new FotoEkleyici({ depo, ortam: () => ({}) as KonuEklemeOrtami, ui, ekle: ekle as never, simdi: () => 't1' });
  return { e, kayitlar, olaylar };
}

const girdi = { kitapAdi: 'b', konuKlasorId: 'K', konuBaslik: 'Konu', hedefFileId: 'F', hedefAd: 'ozet.pdf', jpegler: [jpeg, jpeg] };

describe('FotoEkleyici', () => {
  it('saves, adds, removes the record', async () => {
    const cagri: unknown[] = [];
    const { e, kayitlar, olaylar } = kur(async (konu, _j, _o, s) => { cagri.push([konu, s]); expect(kayitlar.size).toBe(1); return sonuc({ islemId: s.islemId }); });
    const k = await e.baslat(girdi);
    await e.bekle();
    expect(cagri).toEqual([['K', { islemId: k.islemId, hedefFileId: 'F' }]]);
    expect(kayitlar.size).toBe(0);
    expect(olaylar).toEqual(['durum:2 fotoğraf ekleniyor…', 'basari:ozet.pdf\'e eklendi: 24 → 26 sayfa', 'durum:null']);
  });

  it('a failing store: nothing goes to Drive', async () => {
    let cagrildi = false;
    const { e } = kur(async () => { cagrildi = true; return sonuc({}); }, new BekleyenFotoHatasi('kota'));
    await expect(e.baslat(girdi)).rejects.toThrow(BekleyenFotoHatasi);
    await e.bekle();
    expect(cagrildi).toBe(false);
  });

  it('an error keeps the record; trying again uses the same islemId', async () => {
    const idler: (string | undefined)[] = [];
    let cevrimdisi = true;
    const { e, kayitlar, olaylar } = kur(async (_k, _j, _o, s) => {
      idler.push(s.islemId);
      if (cevrimdisi) throw new SayfaEklemeAgHatasi();
      return sonuc({ zatenVardi: false });
    });
    const k = await e.baslat(girdi);
    await e.bekle();
    expect(kayitlar.get(k.islemId)).toMatchObject({ durum: 'hata', deneme: 1, sonHata: 'İnternet yok ya da Drive\'a ulaşılamadı' });
    expect(olaylar).toContain('hata:Fotoğraflar eklenemedi: İnternet yok ya da Drive\'a ulaşılamadı. Cihazda saklandı.');
    cevrimdisi = false;
    expect(e.sirayaKoy(kayitlar.get(k.islemId)!)).toBe(true);
    await e.bekle();
    expect(idler).toEqual([k.islemId, k.islemId]);
    expect(kayitlar.size).toBe(0);
  });

  it('the same record twice at once runs once; one at a time', async () => {
    let calisan = 0, enCok = 0, sayi = 0;
    const { e, kayitlar } = kur(async () => {
      sayi++; calisan++; enCok = Math.max(enCok, calisan);
      await new Promise(r => setTimeout(r, 5));
      calisan--;
      return sonuc({});
    });
    const a = kayit('a'), b = kayit('b');
    kayitlar.set('a', a); kayitlar.set('b', b);
    expect(e.sirayaKoy(a)).toBe(true);
    expect(e.sirayaKoy(a)).toBe(false);
    expect(e.sirayaKoy(b)).toBe(true);
    expect([...e.calisanlar()]).toEqual(['a', 'b']);
    await e.bekle();
    expect(sayi).toBe(2);
    expect(enCok).toBe(1);
    expect(e.calisanlar().size).toBe(0);
  });

  it('a record already gone: nothing is sent', async () => {
    let cagrildi = false;
    const { e, olaylar } = kur(async () => { cagrildi = true; return sonuc({}); });
    e.sirayaKoy(kayit('yok'));
    await e.bekle();
    expect(cagrildi).toBe(false);
    expect(olaylar.filter(o => !o.startsWith('durum:'))).toEqual([]);
  });
});
