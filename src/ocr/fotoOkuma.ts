import type { BekleyenFoto } from '../defter/bekleyenFotoKayit';
import type { KonuyaEklendi } from '../defter/konuyaEkle';
import { OkumaHatasi, type OkunanSayfa } from './claudeMotor';
import type { OcrKaynakDosya } from './kayit/kayitDrive';
import type { OcrSayfa } from './kayit/sema';

// Task 6.4c-2: "Temiz yazıya çevir" while adding photos. Runs only after the photos are on Drive (the
// adding's success, FotoEkleyici.bitti), one photo after the other. The fingerprint comes from the JPEG
// itself: pdf-lib embeds the JPEG bytes unchanged, so 'g:' + SHA-256(JPEG) is the page's fingerprint
// (parmakIzi.ts) without downloading the PDF (fotoOkuma.test.ts proves it). Never throws: a failed reading
// leaves the photo on its page and only says so.

export const OKUNAMADI = 'Okunamadı, okuyucudan tekrar dene';
export const BEKLE_429_MS = 60_000;

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// The fingerprint of a photo page (the single image on it)
export const jpegParmakIzi = async (jpeg: Uint8Array): Promise<string> => 'g:' + await sha256Hex(jpeg);

export interface FotoOkumaDeps {
  oku(jpeg: Uint8Array): Promise<OkunanSayfa>;
  yaz(k: OcrKaynakDosya, s: OcrSayfa): Promise<unknown>;
  kayitliIzler(k: OcrKaynakDosya): Promise<ReadonlySet<string>>;   // only when the pages were there already
  bildir(metin: string): void;
  bekle?(ms: number): Promise<void>;
  simdi?(): string;
}

export interface FotoOkumaSonucu { okunan: number; atlanan: number; hata: number }

// 429 (10 a minute): wait a minute, once
async function okuTekrarli(d: FotoOkumaDeps, jpeg: Uint8Array): Promise<OkunanSayfa> {
  try { return await d.oku(jpeg); }
  catch (e) {
    if (!(e instanceof OkumaHatasi) || e.durum !== 429) throw e;
    await (d.bekle ?? (ms => new Promise(r => setTimeout(r, ms))))(BEKLE_429_MS);
    return d.oku(jpeg);
  }
}

const neden = (e: unknown) => e instanceof Error ? e.message : String(e);

export async function temizYaziyaCevir(k: BekleyenFoto, r: KonuyaEklendi, d: FotoOkumaDeps): Promise<FotoOkumaSonucu> {
  const sonuc: FotoOkumaSonucu = { okunan: 0, atlanan: 0, hata: 0 };
  const istenen = k.jpegler.map((j, i) => ({ j, sayfa: r.eskiSayfa + 1 + i })).filter(x => x.j.temizYazi === true);
  if (!istenen.length) return sonuc;
  const kaynak: OcrKaynakDosya = { id: r.fileId, ad: r.ad, klasorId: k.konuKlasorId };
  const hatalar: string[] = [];
  try {
    // an earlier try had added the pages: maybe it read them too
    let kayitli: ReadonlySet<string> = new Set();
    if (r.zatenVardi) {
      try { kayitli = await d.kayitliIzler(kaynak); } catch (e) { console.warn('Okuma kaydına bakılamadı; sayfalar yine okunuyor.', e); }
    }
    for (const { j, sayfa } of istenen) {
      try {
        const parmakIzi = await jpegParmakIzi(j.bytes);
        if (kayitli.has(parmakIzi)) { sonuc.atlanan++; continue; }
        const o = await okuTekrarli(d, j.bytes);
        await d.yaz(kaynak, { sayfa, parmakIzi, model: o.model, okunma: d.simdi?.() ?? new Date().toISOString(), dondurme: 0, satirlar: o.satirlar });
        sonuc.okunan++;
      } catch (e) {
        sonuc.hata++;
        hatalar.push(`s.${sayfa}: ${neden(e)}`);
        console.warn(`Temiz yazı: s.${sayfa} okunamadı.`, e);
      }
    }
    if (hatalar.length) d.bildir(`${OKUNAMADI} (${hatalar.join(' · ')})`);
    else if (sonuc.okunan) d.bildir(`Temiz yazı kaydedildi: ${sonuc.okunan} sayfa (${r.ad})`);
  } catch (e) {
    console.warn('Temiz yazı tamamlanmadı.', e);
  }
  return sonuc;
}

// One reading after the other (two addings back to back don't read at the same time)
export class FotoOkumaKuyrugu {
  private zincir: Promise<unknown> = Promise.resolve();
  constructor(private readonly d: () => FotoOkumaDeps) {}
  ekle(k: BekleyenFoto, r: KonuyaEklendi): Promise<FotoOkumaSonucu> {
    const p = this.zincir.then(() => temizYaziyaCevir(k, r, this.d()));
    this.zincir = p.catch(() => undefined);
    return p;
  }
}
