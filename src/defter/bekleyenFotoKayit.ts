import type { HazirGorsel } from './gorsel';
import { t, type Anahtar } from '../dil';

// Task 5.8e: one adding of photos waiting on the device (the pure part; the store is bekleyenFoto.ts).
// Saved when "Ekle" is pressed, before any network; removed only after the pages are on Drive.
// islemId is the /DefterEkId of ozeteEkle: trying again with the same id never adds the pages twice.
// Status: bekliyor → yukleniyor → (success: the record is removed) | hata → yukleniyor → ...
// A record still 'yukleniyor' when the app opens again was cut off: it counts as 'bekliyor'.

// Task 6.2c: renkDuzelt = filter E is already in these bytes (only a note: an upload never filters
// again, so "Tekrar dene" gives the same pages). Records from before 6.2c have no field: not filtered.
// Task 6.4c-2: temizYazi = "Temiz yazıya çevir" asked for this photo (read by api/oku once it is on Drive).
// Older records have no field: off.
export type BekleyenJpeg = Pick<HazirGorsel, 'bytes' | 'width' | 'height'> & { renkDuzelt?: boolean; temizYazi?: boolean };

export const renkDuzeltildi = (j: BekleyenJpeg): boolean => j.renkDuzelt === true;
export type BekleyenDurum = 'bekliyor' | 'yukleniyor' | 'hata';

export interface BekleyenFoto {
  islemId: string;
  olusturma: string;      // ISO time
  guncelleme: string;
  kitapAdi: string;
  konuKlasorId: string;   // Drive id of the topic folder
  konuBaslik: string;
  hedefFileId?: string;   // the open summary file, if one was chosen
  hedefAd: string;        // its name, or the new file's (ozet.pdf)
  jpegler: BekleyenJpeg[];  // Uint8Array, not Blob (iPad Safari)
  durum: BekleyenDurum;
  deneme: number;         // upload tries started
  sonHata?: string;       // short text of the last error
}

export type YeniKayitGirdisi = Pick<BekleyenFoto, 'kitapAdi' | 'konuKlasorId' | 'konuBaslik' | 'hedefFileId' | 'hedefAd'>
  & { jpegler: readonly BekleyenJpeg[] };

export const SON_HATA_UZUNLUK = 200;

// Own copy of each JPEG: a view into a larger buffer would store the whole buffer
const kopya = (j: BekleyenJpeg): BekleyenJpeg => {
  const k: BekleyenJpeg = { bytes: j.bytes.slice(), width: j.width, height: j.height };
  if (j.renkDuzelt !== undefined) k.renkDuzelt = j.renkDuzelt;
  if (j.temizYazi) k.temizYazi = true;
  return k;
};

export function yeniKayit(g: YeniKayitGirdisi, simdi: string, islemId: string = crypto.randomUUID()): BekleyenFoto {
  if (g.jpegler.length === 0) throw new Error('Bekleyen kayıtta fotoğraf yok.');   // dil-kontrol: yoksay
  const k: BekleyenFoto = {
    islemId, olusturma: simdi, guncelleme: simdi,
    kitapAdi: g.kitapAdi, konuKlasorId: g.konuKlasorId, konuBaslik: g.konuBaslik, hedefAd: g.hedefAd,
    jpegler: g.jpegler.map(kopya), durum: 'bekliyor', deneme: 0,
  };
  if (g.hedefFileId) k.hedefFileId = g.hedefFileId;
  return k;
}

export class GecisHatasi extends Error {
  constructor(readonly islemId: string, readonly durum: BekleyenDurum, readonly hedef: BekleyenDurum) {
    super(`Bekleyen kayıt ${islemId}: ${durum} → ${hedef} geçişi yok.`);   // kisaNeden shows its own text. dil-kontrol: yoksay
    this.name = 'GecisHatasi';
  }
}

const gecisHatasi = (k: BekleyenFoto, hedef: BekleyenDurum) => new GecisHatasi(k.islemId, k.durum, hedef);

export function yuklemeBasla(k: BekleyenFoto, simdi: string): BekleyenFoto {
  if (k.durum === 'yukleniyor') throw gecisHatasi(k, 'yukleniyor');
  return { ...k, durum: 'yukleniyor', deneme: k.deneme + 1, guncelleme: simdi };
}

export function yuklemeHata(k: BekleyenFoto, mesaj: string, simdi: string): BekleyenFoto {
  if (k.durum !== 'yukleniyor') throw gecisHatasi(k, 'hata');
  const sonHata = mesaj.length > SON_HATA_UZUNLUK ? `${mesaj.slice(0, SON_HATA_UZUNLUK - 1)}…` : mesaj;
  return { ...k, durum: 'hata', sonHata, guncelleme: simdi };
}

// The app opened again: an upload cut off is waiting again (deneme and sonHata stay)
export function acilistaDuzelt(k: BekleyenFoto): BekleyenFoto {
  return k.durum === 'yukleniyor' ? { ...k, durum: 'bekliyor' } : k;
}

export const kayitBoyutu = (k: BekleyenFoto): number => k.jpegler.reduce((t, j) => t + j.bytes.byteLength, 0);
export const toplamBoyut = (ks: readonly BekleyenFoto[]): number => ks.reduce((t, k) => t + kayitBoyutu(k), 0);

export type DepoHataTuru = 'idb-yok' | 'kota' | 'diger';

const MESAJ: Record<DepoHataTuru, Anahtar> = {
  'idb-yok': 'bekleyen.idbYok',
  kota: 'bekleyen.kota',
  diger: 'bekleyen.diger',
};

export class BekleyenFotoHatasi extends Error {
  constructor(readonly tur: DepoHataTuru, readonly neden?: unknown) {
    super(t(MESAJ[tur]));
    this.name = 'BekleyenFotoHatasi';
  }
}

export const IDB_YOK = 'IndexedDB yok';

// Any failure of the store → a BekleyenFotoHatasi with a Turkish message (never swallowed)
export function depoHatasi(e: unknown): BekleyenFotoHatasi {
  if (e instanceof BekleyenFotoHatasi) return e;
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError') return new BekleyenFotoHatasi('kota', e);
  if (e instanceof Error && e.message === IDB_YOK) return new BekleyenFotoHatasi('idb-yok', e);
  return new BekleyenFotoHatasi('diger', e);
}
