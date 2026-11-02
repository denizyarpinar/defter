import { t } from '../dil';
import { driveFetch, FOLDER_MIME, ok, qv } from '../drive/drive';

// Task 6.6-3c: the reader can't find a topic's folder by its kitap.json path (another tab with an old kitap.json,
// or a recovery dropped with "Vazgeç": the folder already in its new unit). Konu-NN is unique in a book and keeps
// its name when moved (D31), so it is looked for by name: first in kitap.json read again, then in the book's unit
// folders (one query). Reads only; the kitap.json fix goes through the move queue (ui/konuTasiAkisi.ts).

export const KONU_ARA = true;
// ?konuAra=0 turns the search off completely
export const konuAraAcik = (search = typeof location === 'undefined' ? '' : location.search) =>
  KONU_ARA && new URLSearchParams(search).get('konuAra') !== '0';

// "Unite-01-Logik/Konu-03-Beweis" → "Konu-03-Beweis"; anything else (not unit/topic, not a Konu-NN name) → null
export function konuAdi(yol: string): string | null {
  const p = yol.split('/');
  if (p.length !== 2 || !p[0].trim() || p.some(x => x === '.' || x === '..')) return null;
  return /^Konu-\d+(-|$)/.test(p[1]) ? p[1] : null;
}

// The one topic path in a raw kitap.json whose folder is this name (none or more than one: null)
export function jsondaYolBul(json: unknown, ad: string): string | null {
  const us = json && typeof json === 'object' && 'uniteler' in json ? (json as { uniteler: unknown }).uniteler : null;
  if (!Array.isArray(us)) return null;
  const yollar: string[] = [];
  for (const u of us) {
    if (!u || typeof u !== 'object' || !Array.isArray((u as { konular?: unknown }).konular)) continue;
    for (const k of (u as { konular: unknown[] }).konular) {
      const y = k && typeof k === 'object' ? (k as { klasor?: unknown }).klasor : null;
      if (typeof y === 'string' && y.split('/').length === 2 && y.split('/')[1] === ad) yollar.push(y);
    }
  }
  return yollar.length === 1 ? yollar[0] : null;
}

export interface BulunanKlasor { id: string; name: string; parents?: string[] }
export type KonuAraDrive = (ad: string, ebeveynIdleri: readonly string[]) => Promise<BulunanKlasor[]>;

// Folders with exactly this name under one of these parents, not in the trash
export function konuAraSorgusu(ad: string, ebeveynIdleri: readonly string[]): string {
  const ic = ebeveynIdleri.map(id => `'${qv(id)}' in parents`).join(' or ');
  return `name = '${qv(ad)}' and (${ic}) and mimeType = '${FOLDER_MIME}' and trashed = false`;
}

// Exactly one folder with this name and one parent (none or more: null, as today "not found")
export function tekEslesme(list: readonly BulunanKlasor[], ad: string): BulunanKlasor | null {
  const x = list.filter(f => f.name === ad);
  return x.length === 1 && x[0].parents?.length === 1 ? x[0] : null;
}

const GRUP = 40;   // parents in one query
export const driveKonuAra: KonuAraDrive = async (ad, ebeveynIdleri) => {
  const out: BulunanKlasor[] = [];
  for (let i = 0; i < ebeveynIdleri.length; i += GRUP) {
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q: konuAraSorgusu(ad, ebeveynIdleri.slice(i, i + GRUP)), fields: 'nextPageToken,files(id,name,parents)', pageSize: '10' });
      if (pageToken) params.set('pageToken', pageToken);
      const j = await (await ok(await driveFetch('files?' + params), t('okuyucu.konuAraniyor'))).json() as { files?: BulunanKlasor[]; nextPageToken?: string };
      for (const f of j.files ?? []) {
        if (f.name !== ad) continue;
        out.push(f);
        if (out.length === 2) return out;   // already ambiguous; no more pages or parent groups needed
      }
      pageToken = j.nextPageToken ?? '';
    } while (pageToken);
  }
  return out;
};

// The reader's opening (Okuyucu.openTopic): the topic's materials by its path; not found → the context is asked
// AT MOST ONCE where the folder is now. A new path: the remembered "not found" goes first, then the new path is
// read. A failing search (network): as today (not found), and the "not found" is not remembered.
export async function konuKesfet<M>(klasor: string, o: {
  kesfet(klasor: string): Promise<M | null>;
  bul?(klasor: string): Promise<string | null>;
  unut(klasor: string): void;
}): Promise<{ m: M | null; klasor: string }> {
  const m = await o.kesfet(klasor);
  if (m || !o.bul || !klasor.trim()) return { m, klasor };
  let yeni: string | null;
  try { yeni = await o.bul(klasor); }
  catch (e) { o.unut(klasor); console.warn('Konu başka ünitede aranamadı.', e); return { m: null, klasor }; }   // dil-kontrol: yoksay
  if (!yeni || yeni === klasor) return { m, klasor };
  o.unut(klasor);
  return { m: await o.kesfet(yeni), klasor: yeni };
}
