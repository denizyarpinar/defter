import { SessionExpired } from '../drive/drive';
import { DosyaOlusturAgHatasi, DosyaYazmaYok, IdAlinamadi, YerDisi, YetkiYok } from '../drive/pdfOlustur';
import { PdfReadOnly, PdfUploadSession } from '../drive/pdfYazici';
import { PdfYazilamaz } from '../kalem/pdfNotlari';
import type { BekleyenFoto } from './bekleyenFotoKayit';
import { BekleyenFotoHatasi, GecisHatasi } from './bekleyenFotoKayit';
import { HedefOzetDegil, OzetSecilmeli, type KonuyaEklendi } from './konuyaEkle';
import { DosyaBulunamadi, PdfDosyasiDegil, SayfaEklemeAgHatasi, SayfaEklemeCakisma, SayfaYazmaYok } from './ozeteEkle';
import { t } from '../dil';

// Task 5.8f: the texts of adding photos (no DOM, so it can be tested): the toast after success,
// the short reason on the error card, the "waiting photos" strip, the reminder when the app opens.

const fotoSayisi = (ks: readonly Pick<BekleyenFoto, 'jpegler'>[]) => ks.reduce((t, k) => t + k.jpegler.length, 0);

export function basariMetni(r: KonuyaEklendi): string {
  if (r.zatenVardi) return t('foto.zatenEklenmis');
  if (r.tur === 'yeni') return t('foto.yeniOlusturuldu', { ad: r.ad, n: r.yeniSayfa });
  return t('foto.eklendi', { ad: r.ad, eski: r.eskiSayfa, n: r.yeniSayfa });
}

// "2 fotoğraf ekleniyor…"; nothing going on: null
export const durumMetni = (n: number): string | null => n > 0 ? t('foto.ekleniyorN', { n }) : null;


// The reason for the card, short, without a full stop at the end
export function kisaNeden(e: unknown): string {
  if (e instanceof TypeError || e instanceof SayfaEklemeAgHatasi || e instanceof DosyaOlusturAgHatasi) return t('foto.neden.ag');
  if (e instanceof OzetSecilmeli) {
    return t('foto.neden.ozetSecilmeli', { dosyalar: e.dosyalar.map(f => f.name).join(', ') });
  }
  if (e instanceof HedefOzetDegil) return t('foto.neden.hedefOzetDegil');
  if (e instanceof DosyaBulunamadi) return t('foto.neden.dosyaBulunamadi');
  if (e instanceof PdfDosyasiDegil) return t('foto.neden.pdfDegil');
  if (e instanceof PdfReadOnly || e instanceof YetkiYok) return t('foto.neden.yetkiYok');
  if (e instanceof SayfaEklemeCakisma) return t('foto.neden.cakisma');
  if (e instanceof SayfaYazmaYok || e instanceof DosyaYazmaYok) return t('foto.neden.yazmaYok');
  if (e instanceof SessionExpired) return t('foto.neden.oturum');
  if (e instanceof YerDisi) return t('foto.neden.yerDisi');
  if (e instanceof IdAlinamadi || e instanceof PdfUploadSession) return t('foto.neden.yuklemeBaslamadi');
  if (e instanceof GecisHatasi) return t('foto.neden.gecis');
  if (e instanceof PdfYazilamaz || e instanceof BekleyenFotoHatasi) return e.message.replace(/\.\s*$/, '');
  return t('foto.neden.beklenmeyen');
}

export const kartMetni = (neden: string): string => t('foto.kart', { neden });

export interface SeritDurumu {
  goster: boolean;
  fotoSayisi: number;
  metin: string;
  kayitlar: BekleyenFoto[];   // what "Şimdi ekle" adds
}

// The topic's waiting records; the ones uploading now and the ones with an error card open don't count
export function seritDurumu(kayitlar: readonly BekleyenFoto[], calisanlar: ReadonlySet<string>, kartlilar: ReadonlySet<string>): SeritDurumu {
  const kalan = kayitlar.filter(k => !calisanlar.has(k.islemId) && !kartlilar.has(k.islemId));
  const n = fotoSayisi(kalan);
  return { goster: n > 0, fotoSayisi: n, metin: t('foto.serit', { n }), kayitlar: kalan };
}

export function acilisToastMetni(kayitlar: readonly BekleyenFoto[]): string | null {
  const n = fotoSayisi(kayitlar);
  return n ? t('foto.acilisToast', { n }) : null;
}
