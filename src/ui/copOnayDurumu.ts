import { CopIzinYok } from '../drive/copeAt';
import { GeriAlAdDolu } from '../drive/dosyaCop';
import { IcindekilerIzinYok } from '../drive/icindekilerYaz';
import { adEsitMi } from '../kitap/copeAt';

// Task 6.K5b: the trash dialog, the parts without the DOM (copOnay.ts draws it). Pure, tested.
// Steps: sayiliyor (Drive is asked what goes) → uyari (changes on the device not in Drive yet) → onay (what goes;
// a book: its name typed) → calisiyor → done (the dialog closes) | hata (Tekrar dene / Tekrar giriş yap, and
// Vazgeç = put back what was done; "Geri al" failed: Tekrar dene / Kapat).
// Task 6.K6b: a file ('dosya'); engel = it can't go now (a summary with photos waiting: only Kapat); an error
// "Tekrar dene" can't help (GeriAlAdDolu) shows only Kapat.

export type CopTuru = 'konu' | 'unite' | 'kitap' | 'yarim' | 'dosya';
export interface CopOzeti { konu: number; dosya: number; bekleyen: number; engel?: string }

export type CopAdimi =
  | { tur: 'sayiliyor' }
  | { tur: 'uyari'; ozet: CopOzeti }
  | { tur: 'onay'; ozet: CopOzeti }
  | { tur: 'engel'; metin: string }
  | { tur: 'calisiyor'; geri: boolean }
  | { tur: 'hata'; mesaj: string; izin: boolean; asama: 'sayim' | 'cop' | 'geri'; tekrarYok?: boolean };

export const BASLIKLAR: Record<CopTuru, string> = {
  konu: 'Konuyu çöpe at', unite: 'Üniteyi çöpe at', kitap: 'Kitabı çöpe at', yarim: 'Yarım kitabı çöpe at',
  dosya: 'Dosyayı çöpe at'
};

const AG_METNI = "Drive'a bağlanılamadı. İnternet bağlantını kontrol et ve tekrar dene.";

export function ozetMetni(t: CopTuru, o: CopOzeti): string {
  if (t === 'dosya') return `${o.dosya > 1 ? 'Dosya ve çözümü' : 'Dosya'} çöpe gidecek. Drive'ın çöpünden 30 gün içinde geri alınabilir.`;
  const dosya = `${o.dosya} dosya`;
  const ne = t === 'yarim' ? `Yarım klasör ve içindeki ${dosya}` : `${o.konu} konu, ${dosya}`;
  return `${ne} çöpe gidecek. Drive'ın çöpünden 30 gün içinde geri alınabilir.`;
}

export const uyariMetni = (n: number): string =>
  `Kaydedilmemiş ${n} değişiklik var (kalem ya da fotoğraf). Çöpe atılırsa Drive'a yazılamaz; cihazda kalır, silinmez.`;

export const ENGEL_FOTO = "Bu konuda Drive'a eklenmeyi bekleyen fotoğraflar var. Önce bekleyen fotoğrafları ekle, sonra özeti çöpe at.";

export const sayildi = (ozet: CopOzeti): CopAdimi =>
  ozet.engel ? { tur: 'engel', metin: ozet.engel } : ozet.bekleyen > 0 ? { tur: 'uyari', ozet } : { tur: 'onay', ozet };

// The red button: only in the confirm step; a book only with its name typed (any case, İ/ı as I/i)
export function copAcik(adim: CopAdimi, adSor: boolean, yazilan: string, ad: string): boolean {
  return adim.tur === 'onay' && (!adSor || adEsitMi(yazilan, ad));
}

export const adSorulur = (t: CopTuru): boolean => t === 'kitap';

// Esc, a tap outside and Vazgeç close it except while it runs
export const kapatilabilir = (adim: CopAdimi): boolean => adim.tur !== 'calisiyor';

export function hataAdimi(e: unknown, asama: 'sayim' | 'cop' | 'geri'): CopAdimi {
  const mesaj = e instanceof TypeError || !(e instanceof Error) ? AG_METNI : e.message;
  return { tur: 'hata', mesaj, izin: e instanceof CopIzinYok || e instanceof IcindekilerIzinYok, asama, ...(e instanceof GeriAlAdDolu ? { tekrarYok: true } : {}) };
}

// The buttons of an error: [the main one, the other one]
export function hataDugmeleri(a: Extract<CopAdimi, { tur: 'hata' }>): { ana: 'tekrar' | 'giris' | null; yan: 'vazgec' | 'kapat' } {
  return { ana: a.tekrarYok ? null : a.izin ? 'giris' : 'tekrar', yan: a.asama === 'cop' ? 'vazgec' : 'kapat' };
}
