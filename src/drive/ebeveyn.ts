import { FOLDER_MIME } from './drive';

// 6.K4c: a create goes only into the root's kitaplar/ or a folder this operation made (pure).
// Task 6.K5a: the same rule for the contents' new folders (the book's folder or one of its unit folders).
export const ebeveynGecerliMi = (ebeveynId: string, kitaplarId: string, izinli: ReadonlySet<string>): boolean =>
  ebeveynId === kitaplarId || izinli.has(ebeveynId);

// Task 6.K6b: a file to the trash must sit right in the open topic's folder, or in that topic's Uebungen / Oedevler
// (pure). dosya / alt: as Drive gives them (alt: the file's parent when it is not the topic's folder).
interface DosyaOgesi { name: string; mimeType?: string; parents?: string[] }
const ALT_ADLAR = new Set(['uebungen', 'oedevler']);

export function dosyaEbeveyniGecerliMi(dosya: DosyaOgesi, beklenenAd: string, konuId: string, alt: (DosyaOgesi & { id: string }) | null): boolean {
  if (dosya.mimeType === FOLDER_MIME || dosya.name !== beklenenAd || !/\.pdf$/i.test(dosya.name)) return false;
  const ebeveyn = dosya.parents ?? [];
  if (ebeveyn.length !== 1) return false;
  if (ebeveyn[0] === konuId) return true;
  return !!alt && alt.id === ebeveyn[0] && alt.mimeType === FOLDER_MIME && ALT_ADLAR.has(alt.name.trim().toLowerCase())
    && (alt.parents ?? []).length === 1 && alt.parents![0] === konuId;
}
