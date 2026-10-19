import { olcumAcik } from '../defter/sureOlcum';

// Task 6.H2: diagnosis only. On the iPad, short fast pen strokes became dots. This records, per stroke,
// what the browser sent (down / move / coalesced / up / cancel, with position, time and pressure) and
// what was kept, so the cause can be seen in numbers. On in development and with ?olcum=1; otherwise
// kalemOlcer is null and nothing is recorded. It never changes what is drawn.

export const MAX_KAYIT = 50;
export const MAX_OLAY = 300;   // per stroke: raw events, and kept points (pairs)

// d/m/c/u/x = down / move / coalesced / up / cancel; x, y: client px; t: ms from the down; p: pressure
export type OlayTuru = 'd' | 'm' | 'c' | 'u' | 'x';
export type Olay = [OlayTuru, number, number, number, number];

export type Sonuc = 'up' | 'cancel' | 'iptal-ikinci-parmak' | 'iptal-dis' | 'reddedildi';

export interface KalemKaydi {
  zaman: string;               // ISO, when it started
  pointerType: string;
  pointerId: number;
  arac: string | null;
  kalinlik: number | null;
  sonuc: Sonuc;
  neden?: string;              // reddedildi: why the down drew nothing
  sayilar: { down: number; move: number; coalesced: number; predicted: number; up: number; cancel: number };
  sureMs: number;              // down → up / cancel
  ilkMoveMs: number | null;    // down → first move (null: no move came)
  hamUzunlukPx: number;        // through every raw position (down, coalesced, up)
  upKayipPx: number | null;    // from the last raw point before the up to the up's position (the up is not kept)
  denenen: number;             // points offered to pushPoint (down + each coalesced / move)
  saklananNokta: number;
  atilanYakin: number;         // offered but closer than MIN_STEP to the last one
  uzunlukPt: number;           // the kept points' length, PDF pt
  basinc: { min: number; max: number; ilk: number; up: number | null } | null;
  nokta: boolean;              // one kept point: drawn as a round dot
  avuc: number;                // touches ignored while this stroke was drawn
  stylusTouchstart: number;    // touchstart with touchType stylus around this stroke
  cancelableDegil: number;     // … of which the browser said it can't be prevented (it decided to scroll)
  olaylar: Olay[];
  saklanan: number[];          // the kept points, PDF pt (at most MAX_OLAY pairs)
}

// What is read from a PointerEvent (tests pass plain objects)
export interface OlayGirdi { clientX: number; clientY: number; timeStamp: number; pressure: number; pointerType: string; pointerId: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function hamUzunluk(olaylar: readonly Olay[]): number {
  let s = 0;
  for (let i = 1; i < olaylar.length; i++) s += Math.hypot(olaylar[i][1] - olaylar[i - 1][1], olaylar[i][2] - olaylar[i - 1][2]);
  return r2(s);
}

export function noktaUzunlugu(xy: readonly number[]): number {
  let s = 0;
  for (let i = 2; i + 1 < xy.length; i += 2) s += Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]);
  return r2(s);
}

interface Acik {
  k: KalemKaydi;
  t0: number;
  // positions used for the length (d, c — or m when there were no coalesced — and u); kept even past MAX_OLAY
  yol: Olay[];
}

export class KalemOlcer {
  private kayit: KalemKaydi[] = [];
  private acik: Acik | null = null;
  private iptalNedeni: Sonuc | null = null;
  private bekleyenTouch: { t: number; cancelable: boolean }[] = [];   // came before the down
  private dinleyici: ((k: KalemKaydi) => void) | null = null;

  constructor(private simdi: () => number = () => performance.now()) {}

  dinle(fn: ((k: KalemKaydi) => void) | null): void { this.dinleyici = fn; }
  kayitlar(): KalemKaydi[] { return this.kayit.slice(); }
  son(): KalemKaydi | undefined { return this.kayit[this.kayit.length - 1]; }
  sifirla(): void { this.kayit = []; }

  // A stroke started (pen / highlighter; not the eraser)
  basla(e: OlayGirdi, arac: string, kalinlik: number): void {
    const k = this.yeni(e, 'up');
    k.arac = arac; k.kalinlik = kalinlik;
    k.sayilar.down = 1;
    const t0 = e.timeStamp;
    // a touchstart just before the down (WebKit may send it first) belongs to this stroke
    const yakin = this.bekleyenTouch.filter(b => this.simdi() - b.t < 200);
    k.stylusTouchstart = yakin.length;
    k.cancelableDegil = yakin.filter(b => !b.cancelable).length;
    this.bekleyenTouch = [];
    const d: Olay = ['d', r2(e.clientX), r2(e.clientY), 0, r2(e.pressure)];
    k.olaylar.push(d);
    k.denenen = 1;
    this.acik = { k, t0, yol: [d] };
  }

  // A pen / mouse down that drew nothing
  reddet(e: OlayGirdi, neden: string): void {
    const k = this.yeni(e, 'reddedildi');
    k.neden = neden;
    k.sayilar.down = 1;
    k.olaylar.push(['d', r2(e.clientX), r2(e.clientY), 0, r2(e.pressure)]);
    this.ekle(k);
  }

  // A move of the stroke's pointer; coalesced: what getCoalescedEvents gave (may be empty)
  hareket(e: OlayGirdi, coalesced: readonly OlayGirdi[], predicted: number): void {
    const a = this.acik;
    if (!a || e.pointerId !== a.k.pointerId) return;
    const k = a.k;
    if (k.sayilar.move === 0) k.ilkMoveMs = r2(e.timeStamp - a.t0);
    k.sayilar.move++;
    k.sayilar.coalesced += coalesced.length;
    k.sayilar.predicted += predicted;
    this.olay(a, 'm', e, !coalesced.length);
    for (const c of coalesced) this.olay(a, 'c', c, true);
    k.denenen += coalesced.length || 1;
  }

  avuc(): void { if (this.acik) this.acik.k.avuc++; }

  touchstart(cancelable: boolean): void {
    if (this.acik) {
      this.acik.k.stylusTouchstart++;
      if (!cancelable) this.acik.k.cancelableDegil++;
    } else {
      this.bekleyenTouch.push({ t: this.simdi(), cancelable });
    }
  }

  // The next end without a pointer event (cancel()) has this reason
  neden(s: Sonuc): void { this.iptalNedeni = s; }

  // The stroke ended. e: the up / cancel event (null: cancelled from inside, no event). pdf: kept points.
  bitir(e: OlayGirdi | null, tur: 'u' | 'x' | null, pdf: readonly number[]): void {
    const a = this.acik;
    if (!a) return;
    this.acik = null;
    const k = a.k;
    const onceki = a.yol[a.yol.length - 1];
    if (e && tur) {
      if (tur === 'u') k.sayilar.up = 1; else k.sayilar.cancel = 1;
      const o = this.olay(a, tur, e, true);
      if (tur === 'u') k.upKayipPx = r2(Math.hypot(o[1] - onceki[1], o[2] - onceki[2]));
      k.sureMs = o[3];
    } else {
      k.sureMs = r2(this.simdi() - a.t0);
    }
    k.sonuc = this.iptalNedeni ?? (tur === 'x' ? 'cancel' : tur === 'u' ? 'up' : 'iptal-dis');
    this.iptalNedeni = null;
    k.hamUzunlukPx = hamUzunluk(a.yol);
    k.saklananNokta = pdf.length >> 1;
    k.atilanYakin = Math.max(0, k.denenen - k.saklananNokta);
    k.uzunlukPt = noktaUzunlugu(pdf);
    k.nokta = k.saklananNokta === 1;
    k.saklanan = Array.from(pdf.slice(0, 2 * MAX_OLAY), r2);
    const p = k.olaylar.filter(o => o[0] !== 'u' && o[0] !== 'x').map(o => o[4]);
    const up = k.olaylar.find(o => o[0] === 'u');
    k.basinc = p.length ? { min: Math.min(...p), max: Math.max(...p), ilk: p[0], up: up ? up[4] : null } : null;
    this.ekle(k);
  }

  private olay(a: Acik, tur: OlayTuru, e: OlayGirdi, yol: boolean): Olay {
    const o: Olay = [tur, r2(e.clientX), r2(e.clientY), r2(e.timeStamp - a.t0), r2(e.pressure)];
    if (a.k.olaylar.length < MAX_OLAY) a.k.olaylar.push(o);
    if (yol) a.yol.push(o);
    return o;
  }

  private yeni(e: OlayGirdi, sonuc: Sonuc): KalemKaydi {
    return {
      zaman: new Date().toISOString(), pointerType: e.pointerType, pointerId: e.pointerId, arac: null, kalinlik: null, sonuc,
      sayilar: { down: 0, move: 0, coalesced: 0, predicted: 0, up: 0, cancel: 0 },
      sureMs: 0, ilkMoveMs: null, hamUzunlukPx: 0, upKayipPx: null, denenen: 0, saklananNokta: 0, atilanYakin: 0, uzunlukPt: 0,
      basinc: null, nokta: false, avuc: 0, stylusTouchstart: 0, cancelableDegil: 0, olaylar: [], saklanan: []
    };
  }

  private ekle(k: KalemKaydi): void {
    this.kayit.push(k);
    if (this.kayit.length > MAX_KAYIT) this.kayit.splice(0, this.kayit.length - MAX_KAYIT);
    try { this.dinleyici?.(k); } catch (err) { console.warn('Kalem ölçüm kutusu güncellenemedi.', err); }
  }
}

const p2 = (v: number) => v.toFixed(2).replace(/^0\./, '.');

// One line for the box
export function ozet(k: KalemKaydi | undefined): string {
  if (!k) return '–';
  if (k.sonuc === 'reddedildi') return `${k.pointerType} · REDDEDİLDİ (${k.neden ?? '?'})`;
  const s = k.sayilar;
  return [
    k.pointerType,
    `${s.move} move/${s.coalesced} coal`,
    `${Math.round(k.sureMs)} ms`,
    `ilk move ${k.ilkMoveMs == null ? '–' : Math.round(k.ilkMoveMs) + ' ms'}`,
    `${Math.round(k.hamUzunlukPx)} px`,
    `${k.saklananNokta} nokta`,
    k.basinc ? `p ${p2(k.basinc.min)}–${p2(k.basinc.max)}` : 'p –',
    k.upKayipPx != null ? `up kaybı ${Math.round(k.upKayipPx)} px` : '',
    k.sonuc !== 'up' ? k.sonuc.toUpperCase() : '',
    k.nokta ? 'NOKTA' : '',
    k.avuc ? `avuç ${k.avuc}` : '',
    k.cancelableDegil ? `touch iptal edilemez ${k.cancelableDegil}` : '',
  ].filter(Boolean).join(' · ');
}

// The last records together
export function toplam(ks: readonly KalemKaydi[]): string {
  const cizgi = ks.filter(k => k.sonuc !== 'reddedildi');
  const say = (f: (k: KalemKaydi) => boolean) => ks.filter(f).length;
  return [
    `son ${ks.length}: ${cizgi.length} çizgi`,
    `${say(k => k.nokta)} nokta`,
    `${say(k => k.sonuc !== 'reddedildi' && k.sayilar.move === 0)} move'suz`,
    `${say(k => k.sonuc === 'cancel')} cancel`,
    `${say(k => k.sonuc === 'iptal-ikinci-parmak' || k.sonuc === 'iptal-dis')} iptal`,
    `${say(k => k.sonuc === 'reddedildi')} reddedildi`,
    `${ks.reduce((n, k) => n + k.avuc, 0)} avuç`,
  ].join(' · ');
}

export function kalemOlcumJson(ks: readonly KalemKaydi[]): string {
  return '[\n' + ks.map(k => JSON.stringify(k)).join(',\n') + '\n]';
}

export function kalemOlcumAcik(search?: string): boolean {
  return import.meta.env.DEV || olcumAcik(search);
}

// null: measuring off (the build without ?olcum=1)
export const kalemOlcer: KalemOlcer | null = kalemOlcumAcik() ? new KalemOlcer() : null;

// The bar's cover (6.H1b) takes a tap while its popover is open: a pen down there draws nothing
if (kalemOlcer && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && (e.target as Element | null)?.closest?.('.o-perde')) kalemOlcer.reddet(e, 'perde');
  }, true);
}

// window.defterKalemOlcum(): the last 50 strokes as JSON (development, and ?olcum=1)
export function installKalemOlcumWindow(): void {
  if (!kalemOlcer) return;
  const o = kalemOlcer;
  (window as unknown as { defterKalemOlcum: () => string }).defterKalemOlcum = () => kalemOlcumJson(o.kayitlar());
}
