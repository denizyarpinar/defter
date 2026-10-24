import type { BekleyenFoto } from '../defter/bekleyenFotoKayit';
import type { KonuyaEklendi } from '../defter/konuyaEkle';
import { currentToken } from '../drive/auth';
import type { DriveLocation } from '../drive/driveLibrary';
import { toast } from '../ui/toast';
import { okuApi } from './claudeMotor';
import { FotoOkumaKuyrugu, OKUNAMADI, type FotoOkumaSonucu } from './fotoOkuma';
import { driveOcrApi, kayitOkuDrive, sayfaYaz } from './kayit/kayitDrive';

// Task 6.4c-2: "Temiz yazıya çevir" with the real engine (api/oku) and the real record (Drive).
// Loaded only behind ?ocrKayit=1 (Okuyucu.ts → FotoEkleyici.bitti).

let yer: DriveLocation | null = null;
const kuyruk = new FotoOkumaKuyrugu(() => {
  const loc = yer;
  if (!loc) throw new Error('Drive kitaplığı açık değil.');
  const drive = driveOcrApi(loc);
  return {
    oku: jpeg => okuApi(jpeg, { token: currentToken() }),
    yaz: (k, s) => sayfaYaz(drive, k, s),
    kayitliIzler: async k => new Set((await kayitOkuDrive(drive, k)).kayit?.sayfalar.map(s => s.parmakIzi) ?? []),
    bildir: m => toast(m)
  };
});

export function fotoOku(k: BekleyenFoto, r: KonuyaEklendi, loc: DriveLocation | null): Promise<FotoOkumaSonucu | void> {
  if (!loc) { toast(`${OKUNAMADI} (Drive kitaplığı açık değil)`); return Promise.resolve(); }
  yer = loc;
  return kuyruk.ekle(k, r).catch(e => { console.warn('Temiz yazı tamamlanmadı.', e); toast(OKUNAMADI); });
}
