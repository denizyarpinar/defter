// Task 6.K4a: the book wizard's list, one line each. Pure, tested.
// - "# Ünite adı" starts a unit; the lines under it are its topics. Empty lines don't count.
// - A topic line loses a leading "- ", "* ", "• ", "1." or "1)" (a unit line keeps "1.": "# 1. Woche" means something).
// - Topics before the first "#" go into a unit "Genel" (a warning).
// - Limits: 30 units, 50 topics in a unit, 80 characters a name (over: a warning that keeps "Oluştur" closed).
//   The same topic twice in a unit and a unit without topics: a warning only.
// listeYaz writes a tree back (topics with "- ", so any topic name comes back the same): ayristir(yaz(x)) = x.

export interface ListeUnite { ad: string; konular: string[] }

export type UyariTuru = 'genel' | 'cokUnite' | 'cokKonu' | 'uzunAd' | 'ayniKonu' | 'konusuzUnite' | 'bosListe';

// satir: 1-based line of the text (0: the whole list); engel: "Oluştur" stays closed
export interface ListeUyari { satir: number; tur: UyariTuru; engel: boolean }

export interface ListeSonucu {
  uniteler: ListeUnite[];
  uyarilar: ListeUyari[];
  satirlar: { unite: number[]; konu: number[][] };   // where every unit / topic is in the text (Genel: its first topic)
}

export const SINIR = { unite: 30, konu: 50, ad: 80 } as const;
export const GENEL = 'Genel';

const UNITE = /^#+\s*(.*)$/;
const ONEK = /^(?:[-*•]|\d+[.)])(?=\s|$)/;

const ayniAd = (a: string, b: string) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');

export function listeAyristir(metin: string): ListeSonucu {
  const uniteler: ListeUnite[] = [];
  const uyarilar: ListeUyari[] = [];
  const satirlar: ListeSonucu['satirlar'] = { unite: [], konu: [] };
  const uyar = (satir: number, tur: UyariTuru, engel = false) => uyarilar.push({ satir, tur, engel });
  const uzunMu = (ad: string, satir: number) => { if ([...ad].length > SINIR.ad) uyar(satir, 'uzunAd', true); };
  const yeniUnite = (ad: string, satir: number) => {
    uniteler.push({ ad, konular: [] });
    satirlar.unite.push(satir);
    satirlar.konu.push([]);
    if (uniteler.length === SINIR.unite + 1) uyar(satir, 'cokUnite', true);
  };

  metin.split(/\r\n|\r|\n/).forEach((ham, i) => {
    const satir = i + 1;
    const s = ham.trim();
    if (!s) return;
    const u = UNITE.exec(s);
    if (u) {
      const ad = u[1].trim() || `Ünite ${uniteler.length + 1}`;
      yeniUnite(ad, satir);
      uzunMu(ad, satir);
      return;
    }
    const ad = s.replace(ONEK, '').trim();
    if (!ad) return;
    if (!uniteler.length) {
      yeniUnite(GENEL, satir);
      uyar(satir, 'genel');
    }
    const un = uniteler[uniteler.length - 1];
    if (un.konular.some(k => ayniAd(k, ad))) uyar(satir, 'ayniKonu');
    un.konular.push(ad);
    satirlar.konu[satirlar.konu.length - 1].push(satir);
    if (un.konular.length === SINIR.konu + 1) uyar(satir, 'cokKonu', true);
    uzunMu(ad, satir);
  });

  uniteler.forEach((u, i) => { if (!u.konular.length) uyar(satirlar.unite[i], 'konusuzUnite'); });
  if (!uniteler.length) uyar(0, 'bosListe', true);
  uyarilar.sort((a, b) => a.satir - b.satir);
  return { uniteler, uyarilar, satirlar };
}

export function listeYaz(uniteler: readonly ListeUnite[]): string {
  return uniteler.map(u => [`# ${u.ad}`, ...u.konular.map(k => `- ${k}`)].join('\n')).join('\n\n');
}

// The 1-based line of a unit (k = null) or of one of its topics in listeYaz's text
export function yazilmisSatir(uniteler: readonly ListeUnite[], u: number, k: number | null): number {
  let satir = 1;
  for (let i = 0; i < u; i++) satir += 1 + uniteler[i].konular.length + 1;   // header, topics, empty line
  return k === null ? satir : satir + 1 + k;
}

// ---- tree changes (a new tree each; the old one stays as it was) ----

const kopya = (a: readonly ListeUnite[]): ListeUnite[] => a.map(u => ({ ad: u.ad, konular: [...u.konular] }));

export interface AgacKonumu { u: number; k: number | null }   // k = null: the unit itself

export function konuEkle(a: readonly ListeUnite[], u: number, ad = 'Yeni konu'): { agac: ListeUnite[]; konum: AgacKonumu } {
  const agac = kopya(a);
  if (!agac[u]) return { agac, konum: { u, k: null } };
  agac[u].konular.push(ad);
  return { agac, konum: { u, k: agac[u].konular.length - 1 } };
}

export function uniteEkle(a: readonly ListeUnite[], ad = 'Yeni ünite'): { agac: ListeUnite[]; konum: AgacKonumu } {
  const agac = kopya(a);
  agac.push({ ad, konular: [] });
  return { agac, konum: { u: agac.length - 1, k: null } };
}

// One step up (-1) or down (+1). At a unit's edge the topic goes into the unit next to it (at its end / start).
export function konuTasi(a: readonly ListeUnite[], u: number, k: number, yon: -1 | 1): { agac: ListeUnite[]; konum: AgacKonumu } {
  const agac = kopya(a);
  const liste = agac[u]?.konular;
  if (!liste || k < 0 || k >= liste.length) return { agac, konum: { u, k } };
  const hedef = k + yon;
  if (hedef >= 0 && hedef < liste.length) {
    [liste[k], liste[hedef]] = [liste[hedef], liste[k]];
    return { agac, konum: { u, k: hedef } };
  }
  const komsu = agac[u + yon];
  if (!komsu) return { agac, konum: { u, k } };
  const [ad] = liste.splice(k, 1);
  if (yon < 0) { komsu.konular.push(ad); return { agac, konum: { u: u - 1, k: komsu.konular.length - 1 } }; }
  komsu.konular.unshift(ad);
  return { agac, konum: { u: u + 1, k: 0 } };
}

export function uniteTasi(a: readonly ListeUnite[], u: number, yon: -1 | 1): { agac: ListeUnite[]; konum: AgacKonumu } {
  const agac = kopya(a);
  const hedef = u + yon;
  if (!agac[u] || !agac[hedef]) return { agac, konum: { u, k: null } };
  [agac[u], agac[hedef]] = [agac[hedef], agac[u]];
  return { agac, konum: { u: hedef, k: null } };
}
