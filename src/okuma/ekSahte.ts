import type { DriveFile } from '../drive/drive';
import type { YuklemeDinleyici } from '../drive/pdfYazici';
import { EklemeSuruyor } from '../defter/konuyaDosyaEkle';
import { MESAJLAR } from '../defter/sayfaEkle';

// Task 6.EK-2, development only (`npm run dev`, never in the build): window.defterEkSahte(o) gives the open reader
// made-up summary additions, so the band shows in the sample library (scripts/ozet-ek-kontrol.mjs). The marks are a
// list in memory, "Ekle" only waits (with progress) and then adds the mark, fails, or says "already going".
// Nothing is read from or written to Drive.

export interface EkSahteSecenek {
  ekler: { ad: string; id?: string; md5?: string }[];
  isaretler?: string[] | 'yazilamaz';     // the summary's /DefterEkId marks; 'yazilamaz': encrypted / signed
  sonuc?: 'basari' | 'hata' | 'suruyor';  // what "Ekle" does (default basari)
  sure?: number;                          // ms the fake upload takes (default 1200)
}

export interface EkSahteDurum { eklenen: string[]; isaretler: string[] | 'yazilamaz' }

export interface EkSahte {
  ekler: DriveFile[];
  isaretler(): Set<string> | 'yazilamaz';
  yazilamazNeden: string;
  ekle(islemId: string, y?: YuklemeDinleyici): Promise<void>;
  durum: EkSahteDurum;
}

export function ekSahte(o: EkSahteSecenek): EkSahte {
  const durum: EkSahteDurum = { eklenen: [], isaretler: o.isaretler === 'yazilamaz' ? 'yazilamaz' : [...o.isaretler ?? []] };
  const ekler = o.ekler.map((e, i): DriveFile => ({
    id: e.id ?? `sahte-ek-${i + 1}`, name: e.ad, mimeType: 'application/pdf', modifiedTime: '2026-10-27T10:00:00.000Z',
    md5Checksum: e.md5 ?? `${'0'.repeat(31)}${i + 1}`
  }));
  return {
    ekler, durum, yazilamazNeden: MESAJLAR.sifreli,
    isaretler: () => durum.isaretler === 'yazilamaz' ? 'yazilamaz' : new Set(durum.isaretler),
    async ekle(islemId, y) {
      if (o.sonuc === 'suruyor') throw new EklemeSuruyor();
      y?.basladi?.();
      const sure = o.sure ?? 1200;
      for (let i = 1; i <= 4; i++) {
        await new Promise(r => setTimeout(r, sure / 4));
        y?.ilerleme?.(i * 25, 100);
      }
      if (o.sonuc === 'hata') throw new TypeError('Failed to fetch');
      durum.eklenen.push(islemId);
      if (durum.isaretler !== 'yazilamaz') durum.isaretler.push(islemId);
    },
  };
}

declare global {
  interface Window {
    defterEkSahte?: (o?: EkSahteSecenek | false) => EkSahteDurum | null;
  }
}

// kur(o): the reader uses the fake (false: off) and checks the band again; its state back
export function installEkSahte(kur: (o: EkSahteSecenek | false | undefined) => EkSahteDurum | null): void {
  window.defterEkSahte = o => kur(o);
}
