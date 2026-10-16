import { SessionExpired } from '../drive/drive';
import { DosyaOlusturAgHatasi, DosyaOlusturKilitli, DosyaYazmaYok, IdAlinamadi, YerDisi, YetkiYok } from '../drive/pdfOlustur';
import { PdfReadOnly, PdfUploadSession } from '../drive/pdfYazici';
import { PdfYazilamaz } from '../kalem/pdfNotlari';
import type { BekleyenFoto } from './bekleyenFotoKayit';
import { BekleyenFotoHatasi, GecisHatasi } from './bekleyenFotoKayit';
import { HedefOzetDegil, OzetSecilmeli, type KonuyaEklendi } from './konuyaEkle';
import { DosyaBulunamadi, PdfDosyasiDegil, SayfaEklemeAgHatasi, SayfaEklemeCakisma, SayfaYazmaYok } from './ozeteEkle';

// Task 5.8f: the texts of adding photos (no DOM, so it can be tested): the toast after success,
// the short reason on the error card, the "waiting photos" strip, the reminder when the app opens.

const fotoSayisi = (ks: readonly Pick<BekleyenFoto, 'jpegler'>[]) => ks.reduce((t, k) => t + k.jpegler.length, 0);

export function basariMetni(r: KonuyaEklendi): string {
  if (r.zatenVardi) return 'Bu fotoğraflar zaten eklenmişti';
  if (r.tur === 'yeni') return `Yeni ${r.ad} oluşturuldu (${r.yeniSayfa} sayfa)`;
  return `${r.ad}'e eklendi: ${r.eskiSayfa} → ${r.yeniSayfa} sayfa`;
}

// "2 fotoğraf ekleniyor…"; nothing going on: null
export const durumMetni = (n: number): string | null => n > 0 ? `${n} fotoğraf ekleniyor…` : null;

const AG = 'İnternet yok ya da Drive\'a ulaşılamadı';

// The reason for the card, short, without a full stop at the end
export function kisaNeden(e: unknown): string {
  if (e instanceof TypeError || e instanceof SayfaEklemeAgHatasi || e instanceof DosyaOlusturAgHatasi) return AG;
  if (e instanceof OzetSecilmeli) {
    return `Bu konuda birden çok özet var (${e.dosyalar.map(f => f.name).join(', ')}). Konuyu açıp Fotoğraf ekle'den hedef dosyayı seç`;
  }
  if (e instanceof HedefOzetDegil) return 'Seçilen dosya artık bu konunun özeti değil';
  if (e instanceof DosyaBulunamadi) return 'Özet dosyası Drive\'da bulunamadı (silinmiş ya da taşınmış olabilir)';
  if (e instanceof PdfDosyasiDegil) return 'Hedef dosya PDF değil';
  if (e instanceof PdfReadOnly || e instanceof YetkiYok) return 'Drive\'da bu dosyaya ya da klasöre yazma iznin yok';
  if (e instanceof SayfaEklemeCakisma) return 'PDF başka bir cihazda değişip duruyor; biraz sonra tekrar dene';
  if (e instanceof DosyaOlusturKilitli) return 'Ekleme şimdilik kilitli (adrese ?dosyaOlustur=1 ekle)';
  if (e instanceof SayfaYazmaYok || e instanceof DosyaYazmaYok) return 'Drive kitaplığı açık değil; Google ile giriş yap';
  if (e instanceof SessionExpired) return 'Oturumun süresi doldu; tekrar Google ile giriş yap';
  if (e instanceof YerDisi) return 'Konu klasörü kitaplığın dışında görünüyor';
  if (e instanceof IdAlinamadi || e instanceof PdfUploadSession) return 'Drive yüklemeyi başlatmadı; biraz sonra tekrar dene';
  if (e instanceof GecisHatasi) return 'Bu fotoğraflar şu an ekleniyor (başka bir sekmede olabilir); sayfayı yenileyip tekrar dene';
  if (e instanceof PdfYazilamaz || e instanceof BekleyenFotoHatasi) return e.message.replace(/\.\s*$/, '');
  return 'Beklenmeyen bir hata oldu';
}

export const kartMetni = (neden: string): string => `Fotoğraflar eklenemedi: ${neden}. Cihazda saklandı.`;

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
  return { goster: n > 0, fotoSayisi: n, metin: `Bu konuda eklenmeyi bekleyen ${n} fotoğraf var`, kayitlar: kalan };
}

export function acilisToastMetni(kayitlar: readonly BekleyenFoto[]): string | null {
  const n = fotoSayisi(kayitlar);
  return n ? `Cihazda eklenmeyi bekleyen ${n} fotoğraf var. İlgili konuyu açınca ekleyebilirsin.` : null;
}
