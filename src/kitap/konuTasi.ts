import { t } from '../dil';
import { uniteAnahtarlari, uniteKlasoru } from './icindekiler';

export const KONU_TASI = false;
export const konuTasiAcik = (search = typeof location === 'undefined' ? '' : location.search) =>
  KONU_TASI || new URLSearchParams(search).get('konuTasi') === '1';

interface Konu { baslik: unknown; klasor: unknown }
interface Unite { baslik: unknown; klasor?: unknown; konular: Konu[] }
export interface TasiTutucu { uniteler?: unknown; kurdele?: unknown }
export const yolCevir = (yol: string, eski: string, yeni: string): string => yol === eski ? yeni : yol;

// Mutates only the topic's position/path and the book ribbon; keeps the same topic object.
export function kitaptaTasi(b: TasiTutucu, eski: string, hedef: string, sira: number, yeni: string): boolean {
  const us = b.uniteler;
  if (!Array.isArray(us) || !us.every(u => u && typeof u === 'object' && Array.isArray(u.konular))) throw new Error(t('tasi.uyusmuyor'));
  const uniteler = us as Unite[];
  const keys = uniteAnahtarlari(uniteler);
  const wanted = keys.indexOf(hedef.startsWith('k:') || hedef.startsWith('b:') ? hedef : 'k:' + hedef);
  const hi = wanted >= 0 ? wanted : keys.indexOf('k:' + yeni.split('/')[0]);
  if (hi < 0 || !Number.isInteger(sira) || sira < 0) throw new Error(t('tasi.uyusmuyor'));
  const yol = yeni.split('/');
  if (yol.length !== 2 || yol.some(p => !p || p === '.' || p === '..') || yol[1] !== eski.split('/')[1]
    || (uniteKlasoru(uniteler[hi].klasor, uniteler[hi].konular.map(k => k.klasor)) || yol[0]) !== yol[0]) throw new Error(t('tasi.uyusmuyor'));
  const bulunan = uniteler.flatMap(u => u.konular.filter(k => k.klasor === eski).map(k => ({ u, k })));
  const hedeftekiler = uniteler.flatMap(u => u.konular.filter(k => k.klasor === yeni).map(k => ({ u, k })));
  if (!bulunan.length && hedeftekiler.length === 1 && hedeftekiler[0].u === uniteler[hi]) return false;
  if (bulunan.length !== 1 || hedeftekiler.length || eski === yeni || bulunan[0].u === uniteler[hi]) throw new Error(t('tasi.uyusmuyor'));
  const { u, k } = bulunan[0];
  if (!u.klasor) u.klasor = uniteKlasoru(u.klasor, u.konular.map(k => k.klasor));
  u.konular.splice(u.konular.indexOf(k), 1);
  k.klasor = yeni;
  if (!uniteler[hi].klasor) uniteler[hi].klasor = yol[0];
  uniteler[hi].konular.splice(Math.min(sira, uniteler[hi].konular.length), 0, k);
  if (b.kurdele && typeof b.kurdele === 'object' && 'konu' in b.kurdele && b.kurdele.konu === eski) b.kurdele.konu = yeni;
  return true;
}

// How many topics of a raw kitap.json point to this path (recovery: "already moved?")
export function jsondaYolSayisi(latest: unknown, yol: string): number {
  const us = latest && typeof latest === 'object' && 'uniteler' in latest ? latest.uniteler : null;
  if (!Array.isArray(us)) return 0;
  return us.reduce((n: number, u) => n + (u && typeof u === 'object' && Array.isArray(u.konular)
    ? u.konular.filter((k: unknown) => !!k && typeof k === 'object' && (k as Konu).klasor === yol).length : 0), 0);
}

export function jsondaTasi(latest: unknown, eski: string, hedef: string, sira: number, yeni: string) {
  if (!latest || typeof latest !== 'object' || !('surum' in latest) || typeof latest.surum !== 'number' || latest.surum < 2) throw new Error(t('tasi.uyusmuyor'));
  const json = structuredClone(latest) as TasiTutucu;
  return { json, degisti: kitaptaTasi(json, eski, hedef, sira, yeni) };
}
