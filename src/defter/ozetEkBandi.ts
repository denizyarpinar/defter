import type { DriveFile } from '../drive/drive';
import { gercekOzet, type TopicMaterials, ozetEkMi } from '../okuma/konuKesfi';
import { dosyaAdiHazirla } from './konuyaDosyaEkle';

export const EK_AYRI = true;
export const ekAyriAcik = (search = typeof location === 'undefined' ? '' : location.search): boolean =>
  EK_AYRI && new URLSearchParams(search).get('ekAyri') !== '0';

// Task 6.EK-1: the pure part of the "Yeni ek var · Ekle" band (UI: 6.EK-2). Another tool puts ozet-ek*.pdf into the
// topic folder (konuKesfi.ozetEkleri); "Ekle" puts its pages at the end of the summary (6.S-3's way: konuyaDosyaEkle
// { ozetSonu }, /DefterEkId = ekIslemId). The addition itself is never written to.
// - "Added?" comes from /DefterEkId marks or the created summary's appProperties.defterIslem.
//   Every device sees it; no separate record is created.
// - The id carries the content's checksum: new content = a new addition. A mark of the same Drive file with
//   another checksum → 'guncellendi' (the band says the addition changed).

export type EkDurumu = 'goster' | 'guncellendi' | 'gizli' | 'yazilamaz' | 'ozetYok';

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
  ayri?: boolean;                     // caller opts into EK-3; omitted preserves the legacy pure API
  dosyalar?: readonly DriveFile[];      // root and Ozetler listings
  ekler: readonly DriveFile[];          // konuKesfi.ozetEkleri / ekleriAl
  ozetVarMi: boolean;                   // a summary Defter may write to (konuKesfi.gercekOzet)
  yazmaVar: boolean;                    // the Drive library with a write context (driveLocation())
  ornek: boolean;                       // sample library
  // the target summary's marks (ekIsaretleri); 'yazilamaz': encrypted / signed (PdfYazilamaz); null: not read yet
  isaretler: ReadonlySet<string> | 'yazilamaz' | null;
  sonraDenilenler: ReadonlySet<string>; // islemIds the user said "Sonra" to (this session)
}

export interface EkKarari { file: DriveFile; islemId: string; durum: EkDurumu }

// One decision per addition, in the given order. EK-3 permits creating the first writable summary;
// the legacy API keeps the no-summary case hidden.
export function bantKarari(g: BantGirdisi): EkKarari[] {
  return g.ekler.map(file => {
    const islemId = ekIslemId(file);
    return { file, islemId, durum: ekDurumu(g, file, islemId) };
  });
}

function ekDurumu(g: BantGirdisi, file: DriveFile, islemId: string): EkDurumu {
  const { isaretler } = g;
  if (g.ornek || !g.yazmaVar || g.sonraDenilenler.has(islemId)) return 'gizli';
  const marks = new Set(isaretler && isaretler !== 'yazilamaz' ? isaretler : []);
  if (g.ayri) for (const f of g.dosyalar ?? []) {
    if (f.appProperties?.defterIslem) marks.add(f.appProperties.defterIslem);
  }
  if (marks.has(islemId)) return 'gizli';
  if (!g.ozetVarMi) return g.ayri ? 'ozetYok' : 'gizli';
  if (isaretler === null) return 'gizli';
  if (isaretler === 'yazilamaz') return 'yazilamaz';
  return eskiSurumVar(marks, file) ? 'guncellendi' : 'goster';
}

// K1: pdf-lib (reading the marks) only for a topic with an addition and a summary to check, in the Drive library
// with a write context, and only after the summary's first page is drawn (never slows the opening).
export interface PdfLibGirdisi { ekVar: boolean; ozetVarMi: boolean; drive: boolean; ozetIlkSayfaCizildi: boolean }

export const pdfLibYuklensinMi = (g: PdfLibGirdisi): boolean => g.ekVar && g.ozetVarMi && g.drive && g.ozetIlkSayfaCizildi;

// Task 6.EK-2: the band shows one addition at a time, the first (by name) not hidden; added → the next one
export const siradakiEk = (kararlar: readonly EkKarari[]): EkKarari | null => kararlar.find(k => k.durum !== 'gizli') ?? null;

// Task 6.EK-2: a file shown in the reader that is an addition (K3: no summary, the addition is in the Özet tab) is read
// only: no pen, no blank page, no paste, no page deleted. Reading, search and handwriting reading stay.
export const ekSaltOkunur = (ad: string | undefined): boolean => !!ad && ozetEkMi(ad);


// Strip the addition prefix and optional sequence number, then reserve a unique safe PDF name.
export function ekOzetAdi(ad: string, mevcut: readonly string[]): string {
  const stem = ad.trim().replace(/\.pdf$/i, '').replace(/^ozet-ek[-_]?/i, '').replace(/^\d+(?:[-_]+|$)/, '');
  let name = dosyaAdiHazirla(stem || `ozet-${mevcut.length + 2}`);
  // These prefixes are reserved by the existing new-summary writer.
  if (/^(ozet-ek|_cozum)/i.test(name) || /_cozum\.pdf$/i.test(name)) name = `ozet-${mevcut.length + 2}.pdf`;
  const used = new Set(mevcut.map(x => x.toLowerCase()));
  const base = name.slice(0, -4);
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.pdf`;
  return name;
}

// EK-3b: the selected real summary, or the read-only addition when no summary exists.
export function ekBantDosyasi(m: TopicMaterials, index: number, ayri: boolean): DriveFile | null {
  const file = m.ozet[index]?.file;
  if (!file) return null;
  if (!ayri) return index === 0 && /^(ozet|brifing|sorular)\.pdf$/i.test(file.name) ? file : null;
  return gercekOzet(m).some(x => x.file.id === file.id) || ekSaltOkunur(file.name) ? file : null;
}
