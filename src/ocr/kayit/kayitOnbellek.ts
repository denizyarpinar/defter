import { depoOku, depoSil, depoYaz } from '../../okuma/temizDepo';
import { kayitOku, type OcrKayit } from './sema';

// Task 6.4e-2b: the last read record of a PDF on the device (temizDepo "kayit"), key = account + PDF id.
// The reader shows it at once and reads Drive behind it (okuyucuOcrKaynak.ts); Drive's answer is always
// written here. kayitOnbellegeYaz is the only writer (6.4e-3's hand corrections will call it too).
// A copy that does not pass the record check, or belongs to another PDF, is ignored (→ Drive).

const anahtar = (hesap: string, dosyaId: string) => `${hesap}|${dosyaId}`;

export async function kayitOnbellegeYaz(hesap: string, dosyaId: string, kayit: OcrKayit): Promise<void> {
  await depoYaz('kayit', anahtar(hesap, dosyaId), JSON.stringify(kayit));
}

export async function kayitOnbellektenOku(hesap: string, dosyaId: string): Promise<OcrKayit | null> {
  const x = await depoOku('kayit', anahtar(hesap, dosyaId));
  if (typeof x !== 'string') return null;
  try {
    const k = kayitOku(JSON.parse(x));
    return k.kaynak.id === dosyaId ? k : null;
  } catch {
    return null;
  }
}

export async function kayitOnbellektenSil(hesap: string, dosyaId: string): Promise<void> {
  await depoSil('kayit', anahtar(hesap, dosyaId));
}
