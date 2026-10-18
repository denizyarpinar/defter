// Task 6.2e-1: how long adding photos / a file takes, step by step. Only for diagnosis, only with ?olcum=1.
// Measuring off: no Olcum is made, olc(undefined, …) returns fn() itself, so the code runs as before.
// The result: one summary line + a table in the console, and the same text in a box (ui/olcum.ts, iPad).
// Pure apart from the default clock and olcumAcik's default (location).

export type Ek = Record<string, string | number | boolean | undefined>;

// hazirlik: one photo / file prepared · panel: the panel's whole preparing · cihaz: IndexedDB
// sira: waiting in a queue · istek: a Drive request without the file's bytes · aktarim: download / upload
// pdf: pdf-lib · toplam: a step around others (not added up) · diger
export type Grup = 'hazirlik' | 'panel' | 'cihaz' | 'sira' | 'istek' | 'aktarim' | 'pdf' | 'toplam' | 'diger';

export interface Adim { ad: string; ms: number; grup: Grup; ek?: Ek; hata?: boolean }

export interface OlcSecenek<T> { grup?: Grup | ((r: T) => Grup); ek?: Ek | ((r: T) => Ek) }

// Where getPdf found the bytes (filled in only when asked)
export interface PdfKaynakBilgisi { kaynak?: 'onbellek' | 'indirme' | 'ornek' }

const varsayilanSaat = () => performance.now();

export class Olcum {
  readonly adimlar: Adim[] = [];
  readonly isaretler = new Map<string, number>();   // name → ms since the start
  readonly bilgi: Ek = {};
  readonly baslangic: number;
  private bitis: number | null = null;

  constructor(readonly ad: string, private readonly simdi: () => number = varsayilanSaat, baslangic?: number) {
    this.baslangic = baslangic ?? simdi();
  }

  zaman(): number { return this.simdi(); }
  gecen(): number { return (this.bitis ?? this.simdi()) - this.baslangic; }

  adim(ad: string, ms: number, grup: Grup = 'diger', ek?: Ek): void {
    this.adimlar.push({ ad, ms, grup, ...(ek && { ek }) });
  }

  // The time of fn; written on an error too (and the error thrown on as it is)
  async olc<T>(ad: string, fn: () => T | Promise<T>, s: OlcSecenek<T> = {}): Promise<T> {
    const t0 = this.simdi();
    let r: T;
    try {
      r = await fn();
    } catch (e) {
      this.adimlar.push({ ad, ms: this.simdi() - t0, grup: typeof s.grup === 'string' ? s.grup : 'diger', hata: true });
      throw e;
    }
    const grup = typeof s.grup === 'function' ? s.grup(r) : s.grup ?? 'diger';
    const ek = typeof s.ek === 'function' ? s.ek(r) : s.ek;
    this.adim(ad, this.simdi() - t0, grup, ek);
    return r;
  }

  isaret(ad: string): void { this.isaretler.set(ad, this.simdi() - this.baslangic); }

  bitir(): void { if (this.bitis === null) this.bitis = this.simdi(); }

  toplamGrup(g: Grup): { ms: number; adet: number } {
    let ms = 0, adet = 0;
    for (const a of this.adimlar) if (a.grup === g) { ms += a.ms; adet++; }
    return { ms, adet };
  }

  ozetSatiri(): string {
    const parca = [`[ölçüm] ${this.ad}`];
    for (const [k, v] of Object.entries(this.bilgi)) if (v !== undefined) parca.push(`${k} ${v}`);
    const toast = this.isaretler.get('toast');
    if (toast !== undefined) parca.push(`Ekle→toast ${sure(toast)}`);
    parca.push(`toplam ${sure(this.gecen())}`);
    const g = (grup: Grup, etiket: string, adetli = false) => {
      const t = this.toplamGrup(grup);
      if (t.adet) parca.push(`${etiket} ${sure(t.ms)}${adetli ? ` (${t.adet})` : ''}`);
    };
    g('panel', 'panelde hazırlık');
    g('hazirlik', 'hazırlama', true);
    g('cihaz', 'cihaz');
    g('sira', 'sıra');
    g('istek', 'Drive istekleri', true);
    g('aktarim', 'aktarım', true);
    g('pdf', 'pdf-lib');
    const hatali = this.adimlar.filter(a => a.hata).length;
    if (hatali) parca.push(`hatalı adım ${hatali}`);
    return parca.join(' · ');
  }

  tablo(): { adım: string; ms: number; grup: Grup; ayrıntı: string }[] {
    return this.adimlar.map(a => ({ adım: a.ad, ms: Math.round(a.ms), grup: a.grup, ayrıntı: ekYazi(a) }));
  }
}

function ekYazi(a: Adim): string {
  const p = Object.entries(a.ek ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} ${v}`);
  if (a.hata) p.push('HATA');
  return p.join(' · ');
}

// The summary and the table, line by line for a narrow screen (the box on the screen, "Kopyala"):
// the summary's parts one per line, then each step with its details on the next line
export function ekranMetni(o: Olcum): string {
  const [baslik, ...parca] = o.ozetSatiri().split(' · ');
  const satir = o.tablo().flatMap(r => [`${r.adım} — ${sure(r.ms)} (${r.grup})`, ...(r.ayrıntı ? [`    ${r.ayrıntı}`] : [])]);
  return [baslik, ...parca.map(p => `  ${p}`), '', ...satir].join('\n');
}

// Measuring off (o undefined): fn() itself, the same promise
export function olc<T>(o: Olcum | undefined, ad: string, fn: () => Promise<T>, s?: OlcSecenek<T>): Promise<T> {
  return o ? o.olc(ad, fn, s) : fn();
}

const AKTARIM = new Set(['uploadMedia', 'uploadResumable', 'yukleMultipart', 'yukleResumable']);

// Every method of a Drive object, timed. Uploads: grup 'aktarim', the size and the kind. Only async methods.
export function zamanliDrive<T extends object>(drive: T, o: Olcum): T {
  return new Proxy(drive, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r) as unknown;
      if (typeof v !== 'function' || typeof k !== 'string') return v;
      return (...a: unknown[]) => {
        const aktarim = AKTARIM.has(k);
        const bytes = a.find((x): x is Uint8Array => x instanceof Uint8Array);
        return o.olc(`drive ${k}`, () => (v as (...x: unknown[]) => unknown).apply(t, a), {
          grup: aktarim ? 'aktarim' : 'istek',
          ek: aktarim && bytes ? { boyut: mb(bytes.byteLength), tur: /resumable/i.test(k) ? 'resumable' : k === 'uploadMedia' ? 'media' : 'multipart' } : undefined,
        });
      };
    }
  });
}

// ---- the measurements going on (key: islemId) ----

const aktif = new Map<string, Olcum>();
let dinleyici: ((o: Olcum) => void) | null = null;

export function olcumBaslat(anahtar: string, ad: string, baslangic?: number, simdi?: () => number): Olcum {
  const o = new Olcum(ad, simdi, baslangic);
  aktif.set(anahtar, o);
  return o;
}

export function olcumAl(anahtar: string): Olcum | undefined { return aktif.get(anahtar); }

// The end: console line + table, then the box (olcumDinle). Unknown key: nothing.
export function olcumBitir(anahtar: string, cikti: Pick<Console, 'log' | 'table'> = console): Olcum | undefined {
  const o = aktif.get(anahtar);
  if (!o) return undefined;
  aktif.delete(anahtar);
  o.bitir();
  cikti.log(o.ozetSatiri());
  cikti.table(o.tablo());
  try { dinleyici?.(o); } catch (e) { console.warn('Ölçüm kutusu güncellenemedi.', e); }
  return o;
}

export function olcumDinle(fn: ((o: Olcum) => void) | null): void { dinleyici = fn; }

// ---- photos / images prepared in a panel before "Ekle" (taken by the next measurement) ----

const MAX_HAZIRLIK = 50;
let hazirlik: Adim[] = [];

export function hazirlikEkle(a: Adim): void {
  hazirlik.push(a);
  if (hazirlik.length > MAX_HAZIRLIK) hazirlik = hazirlik.slice(-MAX_HAZIRLIK);
}

export function hazirlikAl(): Adim[] {
  const r = hazirlik;
  hazirlik = [];
  return r;
}

// Times the steps of one photo into z (null: no measuring, fn() itself)
export function zamanla<T>(z: Record<string, number> | null | undefined, ad: string, fn: () => T): T {
  if (!z) return fn();
  const t0 = performance.now();
  try { return fn(); } finally { z[ad] = (z[ad] ?? 0) + performance.now() - t0; }
}

export function zamanlaA<T>(z: Record<string, number> | null | undefined, ad: string, fn: () => Promise<T>): Promise<T> {
  if (!z) return fn();   // fn()'s own promise
  const t0 = performance.now();
  return fn().finally(() => { z[ad] = (z[ad] ?? 0) + performance.now() - t0; });
}

export function olcumAcik(search?: string): boolean {
  const s = search ?? (typeof location === 'undefined' ? '' : location.search);
  return new URLSearchParams(s).get('olcum') === '1';
}

// ---- formats ----

export const sure = (ms: number) => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} sn`;
export const kb = (b: number) => `${Math.round(b / 1024)} kB`;
export const mb = (b: number) => `${(b / 1048576).toFixed(2)} MB`;
