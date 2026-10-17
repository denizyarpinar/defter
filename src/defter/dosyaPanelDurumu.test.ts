import { describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive';
import { AyniIsimVar } from '../drive/pdfOlustur';
import { emptyMaterials, type Material, type TopicMaterials } from '../okuma/konuKesfi';
import {
  adDurumu, AYNI_AD_METIN, cozumAdaylari, dosyaHedefi, eklendiMetni, ekleDurumu, hataMetni, hedefSecenekleri, islemAnahtari,
  kaynakEtiketi, ofisBilgi, ORNEK_METIN, sayfaYazi, tekDosyaYolu, varsayilanHedef, type AdDurumu, type Secenek
} from './dosyaPanelDurumu';
import { BOS_DOSYA_METIN, boyutMetni } from './dosyaEklemeMetin';
import { dosyaTuru } from './dosyaTuru';
import { KlasorYok } from './konuyaDosyaEkle';

// Task 5.10e: the "Dosya ekle" panel's pure part.

const f = (name: string): DriveFile => ({ id: `id-${name}`, name, mimeType: 'application/pdf', modifiedTime: 't' });
const mat = (name: string, cozum = false): Material => ({ file: f(name), cozum: cozum ? f(name.replace(/\.pdf$/i, '_cozum.pdf')) : null });
const konu = (o: Partial<TopicMaterials>): TopicMaterials => ({ ...emptyMaterials(), ...o });
const sec = (l: Secenek[], h: string) => l.find(x => x.hedef === h)!;

describe('hedefSecenekleri', () => {
  it('an empty topic, folders known to exist: all but Çözüm', () => {
    const l = hedefSecenekleri(emptyMaterials(), { Uebungen: true, Oedevler: true });
    expect(l.map(x => x.hedef)).toEqual(['uebungen', 'oedevler', 'cozum', 'orijinal', 'ozet']);
    expect(l.map(x => x.secilebilir)).toEqual([true, true, false, true, true]);
    expect(sec(l, 'cozum').neden).toBe('Çözümü olmayan dosya yok');
    expect(sec(l, 'uebungen').etiket).toBe('Übungen');
    expect(sec(l, 'cozum').etiket).toBe('Çözüm');
  });
  it('orijinal / özet there: grey with a reason (brifing counts as a summary)', () => {
    const l = hedefSecenekleri(konu({ orijinal: [mat('orijinal.pdf')], ozet: [mat('brifing.pdf')] }), null);
    expect(sec(l, 'orijinal')).toMatchObject({ secilebilir: false, neden: 'Bu konuda orijinal var' });
    expect(sec(l, 'ozet')).toMatchObject({ secilebilir: false, neden: 'Bu konuda özet var' });
  });
  it('a missing folder: grey "(klasör yok)"; not known yet: can be chosen', () => {
    const yok = hedefSecenekleri(emptyMaterials(), { Uebungen: false, Oedevler: true });
    expect(sec(yok, 'uebungen')).toMatchObject({ secilebilir: false, neden: '(klasör yok)' });
    expect(sec(yok, 'oedevler').secilebilir).toBe(true);
    const bilinmiyor = hedefSecenekleri(emptyMaterials(), null);
    expect(sec(bilinmiyor, 'uebungen').secilebilir).toBe(true);
    expect(sec(bilinmiyor, 'oedevler').secilebilir).toBe(true);
  });
  it('a folder with files exists even if the listing says otherwise', () => {
    const l = hedefSecenekleri(konu({ uebungen: [mat('Blatt01.pdf')] }), { Uebungen: false, Oedevler: false });
    expect(sec(l, 'uebungen').secilebilir).toBe(true);
    expect(sec(l, 'cozum').secilebilir).toBe(true);
  });
  it('Çözüm: grey when every file has its solution', () => {
    const l = hedefSecenekleri(konu({ uebungen: [mat('Blatt01.pdf', true)] }), null);
    expect(sec(l, 'cozum').secilebilir).toBe(false);
  });
});

describe('cozumAdaylari', () => {
  it('Übungen then Ödevler, only files without a solution', () => {
    const m = konu({ uebungen: [mat('Blatt01.pdf', true), mat('Blatt02.pdf')], oedevler: [mat('Odev1.pdf')], orijinal: [mat('orijinal.pdf')] });
    expect(cozumAdaylari(m).map(x => x.etiket)).toEqual(['Übungen · Blatt02', 'Ödevler · Odev1']);
    expect(cozumAdaylari(m)[0].file.id).toBe('id-Blatt02.pdf');
  });
});

describe('varsayilanHedef', () => {
  const l = hedefSecenekleri(konu({ ozet: [mat('ozet.pdf')], uebungen: [mat('B.pdf')] }), { Uebungen: true, Oedevler: false });
  it('the open tab when it can be chosen', () => {
    expect(varsayilanHedef(l, 'uebungen')).toBe('uebungen');
  });
  it('the open tab grey (Özet there): the first that can be chosen', () => {
    expect(varsayilanHedef(l, 'ozet')).toBe('uebungen');
    expect(varsayilanHedef(l, null)).toBe('uebungen');
  });
  it('none can be chosen: null', () => {
    const hic = hedefSecenekleri(konu({ orijinal: [mat('orijinal.pdf')], ozet: [mat('ozet.pdf')] }), { Uebungen: false, Oedevler: false });
    expect(varsayilanHedef(hic, 'orijinal')).toBeNull();
  });
});

describe('adDurumu', () => {
  const m = konu({ uebungen: [mat('Blatt01.pdf', true)], oedevler: [mat('Odev1.pdf')] });
  it('fixed names for orijinal / özet / çözüm, not editable', () => {
    expect(adDurumu(m, 'orijinal', 'x.pdf', null)).toEqual({ duzenlenebilir: false, ad: 'orijinal.pdf', hata: null });
    expect(adDurumu(m, 'ozet', 'x.pdf', null)).toEqual({ duzenlenebilir: false, ad: 'ozet.pdf', hata: null });
    expect(adDurumu(m, 'cozum', 'x.pdf', f('Odev1.pdf'))).toEqual({ duzenlenebilir: false, ad: 'Odev1_cozum.pdf', hata: null });
    expect(adDurumu(m, 'cozum', 'x.pdf', null).ad).toBe('');
  });
  it('Übungen / Ödevler: editable, .pdf added', () => {
    expect(adDurumu(m, 'uebungen', ' Blatt02 ', null)).toEqual({ duzenlenebilir: true, ad: 'Blatt02.pdf', hata: null });
  });
  it('the same name in that folder (any case, solutions too): a warning', () => {
    expect(adDurumu(m, 'uebungen', 'blatt01.PDF', null).hata).toBe(AYNI_AD_METIN);
    expect(adDurumu(m, 'uebungen', 'Blatt01_cozum.pdf', null).hata).toContain('_cozum');
    expect(adDurumu(m, 'oedevler', 'Blatt01.pdf', null).hata).toBeNull();   // another folder
    expect(adDurumu(m, 'oedevler', 'odev1', null).hata).toBe(AYNI_AD_METIN);
  });
  it('empty name / _cozum name: the error texts of konuyaDosyaEkle', () => {
    expect(adDurumu(m, 'uebungen', '   ', null)).toMatchObject({ ad: '', hata: 'Dosya adı boş. Dosyaya bir ad verip tekrar dene.' });
    expect(adDurumu(m, 'oedevler', 'Odev2_Cozum', null).hata).toContain('Çözüm ekle');
  });
});

describe('ekleDurumu', () => {
  const ok: Secenek = { hedef: 'uebungen', etiket: 'Übungen', secilebilir: true, neden: null };
  const ad: AdDurumu = { duzenlenebilir: true, ad: 'B.pdf', hata: null };
  const g = { ornek: false, secenek: ok, ad, ekleniyor: false, hataVar: false };
  it('everything fine: active "Ekle"', () => {
    expect(ekleDurumu(g)).toEqual({ aktif: true, metin: 'Ekle', aciklama: null });
  });
  it('sample library: never active, with the reason', () => {
    expect(ekleDurumu({ ...g, ornek: true })).toEqual({ aktif: false, metin: 'Ekle', aciklama: ORNEK_METIN });
  });
  it('passive: grey target, no target, name error, no solution file chosen, while adding', () => {
    expect(ekleDurumu({ ...g, secenek: { ...ok, secilebilir: false } }).aktif).toBe(false);
    expect(ekleDurumu({ ...g, secenek: null }).aktif).toBe(false);
    expect(ekleDurumu({ ...g, ad: { ...ad, hata: AYNI_AD_METIN } }).aktif).toBe(false);
    expect(ekleDurumu({ ...g, ad: { ...ad, ad: '' } }).aktif).toBe(false);
    expect(ekleDurumu({ ...g, ekleniyor: true })).toMatchObject({ aktif: false, metin: 'Ekleniyor…' });
  });
  it('images not ready (none, or being prepared): passive', () => {
    expect(ekleDurumu({ ...g, hazirDegil: true })).toEqual({ aktif: false, metin: 'Ekle', aciklama: null });
    expect(ekleDurumu({ ...g, hazirDegil: false }).aktif).toBe(true);
  });
  it('after an error: "Tekrar dene"', () => {
    expect(ekleDurumu({ ...g, hataVar: true })).toEqual({ aktif: true, metin: 'Tekrar dene', aciklama: null });
  });
});

describe('dosyaHedefi / islemAnahtari', () => {
  it('maps the panel target to konuyaDosyaEkle\'s', () => {
    expect(dosyaHedefi('uebungen', null)).toBe('uebungen');
    expect(dosyaHedefi('cozum', null)).toBeNull();
    const x = f('B.pdf');
    expect(dosyaHedefi('cozum', x)).toEqual({ cozumOf: x });
  });
  it('the same target + name (any case) = the same key; a change = another', () => {
    expect(islemAnahtari('uebungen', 'B.pdf', null)).toBe(islemAnahtari('uebungen', 'b.PDF', null));
    expect(islemAnahtari('uebungen', 'B.pdf', null)).not.toBe(islemAnahtari('oedevler', 'B.pdf', null));
    expect(islemAnahtari('cozum', 'B_cozum.pdf', f('B.pdf'))).not.toBe(islemAnahtari('cozum', 'C_cozum.pdf', f('C.pdf')));
  });
});

describe('texts', () => {
  it('source, pages, success', () => {
    expect(kaynakEtiketi('pdf')).toBe('PDF');
    expect(kaynakEtiketi('gorsel')).toBe('Görsel → PDF');
    expect(sayfaYazi(3)).toBe('3 sayfa');
    expect(sayfaYazi(null)).toBe('? sayfa');
    expect(eklendiMetni('B.pdf')).toBe('Eklendi: B.pdf');
    expect(eklendiMetni('B.pdf', 'kalemYazamaz')).toBe('Eklendi: B.pdf · Kalem bu dosyaya çizim yazamaz (şifreli ya da imzalı PDF).');
  });
  it('errors: konuyaDosyaEkle\'s own message as it is, others short', () => {
    expect(hataMetni(new KlasorYok('Uebungen'))).toBe(new KlasorYok('Uebungen').message);
    expect(hataMetni(new AyniIsimVar('B.pdf', 'x'))).toContain('"B.pdf"');
    expect(hataMetni(new TypeError('Failed to fetch'))).toBe('Dosya eklenemedi: İnternet yok ya da Drive\'a ulaşılamadı.');
    expect(hataMetni('?')).toBe('Dosya eklenemedi: Beklenmeyen bir hata oldu.');
  });
});

describe('tekDosyaYolu (6.1c)', () => {
  const ZIP = new Uint8Array([0x50, 0x4b, 3, 4]);
  const docx = dosyaTuru('ders-notu.docx', '', ZIP);
  const pptx = dosyaTuru('sunum.pptx', '', ZIP);
  const acik = { drive: true, bayt: 120_000 };
  it('Word / PowerPoint in the Drive library: the panel converts', () => {
    expect(tekDosyaYolu(docx, acik)).toEqual({ yol: 'ofis', alt: 'word' });
    expect(tekDosyaYolu(pptx, acik)).toEqual({ yol: 'ofis', alt: 'powerpoint' });
    expect(tekDosyaYolu(dosyaTuru('not.rtf', '', new TextEncoder().encode('{\\rtf1')), acik)).toEqual({ yol: 'ofis', alt: 'word' });
  });
  it('sample library / no Drive: the old way (dosyaHazirla refuses with its text)', () => {
    expect(tekDosyaYolu(docx, { ...acik, drive: false })).toEqual({ yol: 'hazirla' });
  });
  it('Keynote / Pages: the old refusal, even in the Drive library', () => {
    expect(tekDosyaYolu(dosyaTuru('sahte.key', '', ZIP), acik)).toEqual({ yol: 'hazirla' });
    expect(tekDosyaYolu(dosyaTuru('not.pages', '', ZIP), acik)).toEqual({ yol: 'hazirla' });
  });
  it('PDF, image, unsupported: the old way', () => {
    expect(tekDosyaYolu({ tur: 'pdf' }, acik)).toEqual({ yol: 'hazirla' });
    expect(tekDosyaYolu({ tur: 'gorsel', alt: 'jpeg' }, acik)).toEqual({ yol: 'hazirla' });
    expect(tekDosyaYolu({ tur: 'desteklenmeyen' }, acik)).toEqual({ yol: 'hazirla' });
  });
  it('empty or over 50 MB: refused before converting (the texts of dosyaHazirla)', () => {
    expect(tekDosyaYolu(docx, { ...acik, bayt: 0 })).toEqual({ yol: 'ret', metin: BOS_DOSYA_METIN });
    expect(tekDosyaYolu(pptx, { ...acik, bayt: 62_400_000 })).toEqual({ yol: 'ret', metin: boyutMetni(62_400_000) });
    expect(tekDosyaYolu(pptx, { ...acik, bayt: 40_000_000 })).toEqual({ yol: 'ofis', alt: 'powerpoint' });
  });
});

describe('ofisBilgi (6.1c)', () => {
  const g = { ad: 'ders-notu.docx', bayt: 120_000, alt: 'word' as const };
  it('converting: the seconds', () => {
    expect(ofisBilgi({ ...g, durum: 'cevriliyor', sn: 12 })).toBe('ders-notu.docx · 117 KB · Word → PDF · Çevriliyor… 12 sn');
    expect(ofisBilgi({ ...g, durum: 'cevriliyor' })).toBe('ders-notu.docx · 117 KB · Word → PDF · Çevriliyor… 0 sn');
  });
  it('ready: counting, then the pages', () => {
    expect(ofisBilgi({ ...g, durum: 'hazir' })).toBe('ders-notu.docx · 117 KB · Word → PDF · sayfa sayılıyor…');
    expect(ofisBilgi({ ...g, durum: 'hazir', sayfa: 3 })).toBe('ders-notu.docx · 117 KB · Word → PDF · 3 sayfa');
    expect(ofisBilgi({ ...g, durum: 'hazir', sayfa: null })).toBe('ders-notu.docx · 117 KB · Word → PDF · ? sayfa');
  });
  it('error; PowerPoint', () => {
    expect(ofisBilgi({ ...g, durum: 'hata' })).toBe('ders-notu.docx · 117 KB · Word → PDF · Çevrilemedi');
    expect(ofisBilgi({ ad: 'sunum.pptx', bayt: 27_000_000, alt: 'powerpoint', durum: 'cevriliyor', sn: 3 }))
      .toBe('sunum.pptx · 25,7 MB · PowerPoint → PDF · Çevriliyor… 3 sn');
  });
});

describe('ekleDurumu while converting (6.1c)', () => {
  it('no PDF yet: Ekle passive; ready: active', () => {
    const ad: AdDurumu = { duzenlenebilir: true, ad: 'ders-notu.pdf', hata: null };
    const secenek: Secenek = { hedef: 'uebungen', etiket: 'Übungen', secilebilir: true, neden: null };
    expect(ekleDurumu({ ornek: false, secenek, ad, ekleniyor: false, hataVar: false, hazirDegil: true }).aktif).toBe(false);
    expect(ekleDurumu({ ornek: false, secenek, ad, ekleniyor: false, hataVar: false, hazirDegil: false }).aktif).toBe(true);
  });
});
