import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import { t } from '../dil';
import type { SourceResolver } from './kaynakCoz';

// A surum 2 topic folder → its materials (see CLAUDE.md → Veri modeli (kitap.json surum 2)).
// Names are compared without case (ASCII). X_cozum.pdf is the solution of X.pdf in the same folder.
// Reads only.

export type MaterialKind = 'orijinal' | 'ozet' | 'uebungen' | 'oedevler';

export const MATERIAL_KINDS: readonly MaterialKind[] = ['orijinal', 'ozet', 'uebungen', 'oedevler'];
// 6.5-2a: the label in the chosen language (getters; only shown, never compared: the logic uses the kind)
export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  get orijinal() { return t('materyal.orijinal'); },
  get ozet() { return t('materyal.ozet'); },
  get uebungen() { return t('materyal.uebungen'); },
  get oedevler() { return t('materyal.oedevler'); }
};

export interface Material {
  file: DriveFile;
  cozum: DriveFile | null;
}

export type TopicMaterials = Record<MaterialKind, Material[]>;

const SOLUTION = '_cozum.pdf';
const key = (name: string) => name.trim().toLowerCase();
const isPdf = (f: DriveFile) => f.mimeType !== FOLDER_MIME && key(f.name).endsWith('.pdf');
const byName = (a: Material, b: Material) => a.file.name.localeCompare(b.file.name, 'de', { numeric: true, sensitivity: 'base' });

// The PDFs of one folder, each with its solution. Solutions are never items of their own.
function pairSolutions(files: DriveFile[]): Material[] {
  const pdfs = files.filter(isPdf);
  const names = new Map(pdfs.map(f => [key(f.name), f]));
  return pdfs
    .filter(f => !key(f.name).endsWith(SOLUTION))
    .map(f => ({ file: f, cozum: names.get(key(f.name).slice(0, -'.pdf'.length) + SOLUTION) ?? null }));
}

// root: the topic folder's children; uebungen / oedevler: the children of those folders ([] if missing).
export function classifyTopic(root: DriveFile[], uebungen: DriveFile[], oedevler: DriveFile[]): TopicMaterials {
  const top = pairSolutions(root);
  const named = (name: string) => top.find(m => key(m.file.name) === name);
  const one = (m: Material | undefined) => m ? [m] : [];
  const ozet = named('ozet.pdf');
  return {
    orijinal: one(named('orijinal.pdf')),
    ozet: ozet ? [ozet] : [named('brifing.pdf'), named('sorular.pdf')].filter((m): m is Material => !!m),
    uebungen: pairSolutions(uebungen).sort(byName),
    oedevler: pairSolutions(oedevler).sort(byName)
  };
}

export const emptyMaterials = (): TopicMaterials => ({ orijinal: [], ozet: [], uebungen: [], oedevler: [] });

// Kinds that have files, in tab order.
export function availableKinds(m: TopicMaterials): MaterialKind[] {
  return MATERIAL_KINDS.filter(k => m[k].length);
}

// What opens first: Özet, else Orijinal, else the first one found (null: nothing).
export function defaultKind(m: TopicMaterials): MaterialKind | null {
  if (m.ozet.length) return 'ozet';
  if (m.orijinal.length) return 'orijinal';
  return availableKinds(m)[0] ?? null;
}

// 1 listing for the topic folder + at most 2 for Uebungen / Oedevler (the path itself is cached by the resolver).
// null: the folder in kitap.json doesn't exist. An empty klasor means "no materials yet".
export async function discoverTopic(resolver: SourceResolver, klasor: string): Promise<TopicMaterials | null> {
  if (!klasor.trim()) return emptyMaterials();
  const id = await resolver.resolveFolder(klasor);
  if (!id) return null;
  const root = await listChildren(id);
  const sub = (name: string) => {
    const folder = root.find(f => f.mimeType === FOLDER_MIME && key(f.name) === name);
    return folder ? listChildren(folder.id) : Promise.resolve([]);
  };
  const [uebungen, oedevler] = await Promise.all([sub('uebungen'), sub('oedevler')]);
  return classifyTopic(root, uebungen, oedevler);
}
