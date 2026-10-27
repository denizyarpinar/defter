import type { DriveFile } from '../drive/drive';

// Task 6.EK-1: the pure part of the "Yeni ek var · Ekle" band (UI: 6.EK-2). Another tool puts ozet-ek*.pdf into the
// topic folder (konuKesfi.ozetEkleri); "Ekle" puts its pages at the end of the summary (6.S-3's way: konuyaDosyaEkle
// { ozetSonu }, /DefterEkId = ekIslemId). The addition itself is never written to.
// - "Added?" is read from the summary's /DefterEkId marks (ozeteEkle.ekIsaretleri): every device sees it, nothing
//   is kept elsewhere.
// - The id carries the content's checksum: new content = a new addition. A mark of the same Drive file with
//   another checksum → 'guncellendi' (the band says the addition changed).

export type EkDurumu = 'goster' | 'guncellendi' | 'gizli' | 'yazilamaz';

const ONEK = 'ozet-ek-';
// what follows "ozet-ek-<id>-": an md5 (32 hex) or a modifiedTime (ISO). Checked so that an id that starts with
// another id ("abc" / "abc-x") never matches.
const SURUM = /^(?:[0-9a-f]{32}|\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/i;

// The adding's fixed islemId (the same on every device and every try): md5, else modifiedTime
export const ekIslemId = (f: Pick<DriveFile, 'id' | 'md5Checksum' | 'modifiedTime'>): string =>
  `${ONEK}${f.id}-${f.md5Checksum || f.modifiedTime}`;

// The summary has the pages of an earlier content of this file
function eskiSurumVar(isaretler: ReadonlySet<string>, f: DriveFile): boolean {
  const onek = `${ONEK}${f.id}-`;
  for (const x of isaretler) if (x.startsWith(onek) && SURUM.test(x.slice(onek.length))) return true;
  return false;
}

export interface BantGirdisi {
  ekler: readonly DriveFile[];          // konuKesfi.ozetEkleri / ekleriAl
  ozetVarMi: boolean;                   // a summary Defter may write to (konuKesfi.gercekOzet)
  yazmaVar: boolean;                    // the Drive library with a write context (driveLocation())
  ornek: boolean;                       // sample library
  // the target summary's marks (ekIsaretleri); 'yazilamaz': encrypted / signed (PdfYazilamaz); null: not read yet
  isaretler: ReadonlySet<string> | 'yazilamaz' | null;
  sonraDenilenler: ReadonlySet<string>; // islemIds the user said "Sonra" to (this session)
}

export interface EkKarari { file: DriveFile; islemId: string; durum: EkDurumu }

// One decision per addition, in the given order. Sample library / no writing / no summary (K3: the addition is
// shown as the summary) / marks not read yet → all hidden.
export function bantKarari(g: BantGirdisi): EkKarari[] {
  return g.ekler.map(file => {
    const islemId = ekIslemId(file);
    return { file, islemId, durum: ekDurumu(g, file, islemId) };
  });
}

function ekDurumu(g: BantGirdisi, file: DriveFile, islemId: string): EkDurumu {
  const { isaretler } = g;
  if (g.ornek || !g.yazmaVar || !g.ozetVarMi || isaretler === null || g.sonraDenilenler.has(islemId)) return 'gizli';
  if (isaretler === 'yazilamaz') return 'yazilamaz';
  if (isaretler.has(islemId)) return 'gizli';
  return eskiSurumVar(isaretler, file) ? 'guncellendi' : 'goster';
}

// K1: pdf-lib (reading the marks) only for a topic with an addition and a summary to check, in the Drive library
// with a write context, and only after the summary's first page is drawn (never slows the opening).
export interface PdfLibGirdisi { ekVar: boolean; ozetVarMi: boolean; drive: boolean; ozetIlkSayfaCizildi: boolean }

export const pdfLibYuklensinMi = (g: PdfLibGirdisi): boolean => g.ekVar && g.ozetVarMi && g.drive && g.ozetIlkSayfaCizildi;
