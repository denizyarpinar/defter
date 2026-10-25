// Task 6.S-1a: diagnosis only. The places that cancel a touch say so here just before preventDefault, so the
// touch log (?olcum=1, dokunmaOlcum.ts) can tell who cancelled. Without ?olcum=1 nobody listens: one null check.

export type IptalKaynagi = 'okuyucuKaydirma' | 'sayfaZoom' | 'kalemModu';

let dinleyici: ((kaynak: IptalKaynagi, e: Event) => void) | null = null;

export function dokunmaIptalDinle(fn: ((kaynak: IptalKaynagi, e: Event) => void) | null): void { dinleyici = fn; }

export function dokunmaIptal(kaynak: IptalKaynagi, e: Event): void { dinleyici?.(kaynak, e); }
