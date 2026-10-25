import type { IptalKaynagi } from './dokunmaIz';

// Task 6.S-1a: diagnosis only. On the iPad the ESR pen writes but can't press buttons. The touch log (?olcum=1)
// records every pointer / touch / click event and who cancelled it; this turns that list into one line per touch:
// "kalem (touch/stylus) | button#oKalem "Kalem" | down→up 140 ms | touchmove 23 (23 iptal: okuyucuKaydirma 23) | click: YOK".
// Pure, no DOM.

export type DokunmaTuru = 'pointerdown' | 'pointerup' | 'pointercancel' | 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel' | 'click';

export interface DokunmaOlayi {
  t: number;                    // ms from the first event logged
  tur: DokunmaTuru | 'iptal';   // iptal: a cancel of ours (kaynak), just before its preventDefault
  pointerType?: string;
  pointerId?: number;
  touchType?: string;           // touches[0].touchType: direct | stylus
  force?: number;               // touch force / pointer pressure
  kalan?: number;               // touch events: touches still down after this one
  hedef: string;                // tag#id.class
  kontrol: string | null;       // the nearest button / control
  iptal?: boolean;              // defaultPrevented once the event was over (undefined: not read yet)
  kaynak?: IptalKaynagi;        // tur iptal: who
  olayTuru?: string;            // tur iptal: the cancelled event's type
}

export interface Dokunus {
  no: number;
  cihaz: 'kalem' | 'parmak' | 'fare' | '?';
  ham: string;                  // pointerType / touchType as the browser said
  hedef: string;
  kontrol: string | null;
  sureMs: number | null;        // first down → last up / cancel
  touchmove: number;
  touchmoveIptal: number;       // touchmoves with defaultPrevented
  moveKaynak: Record<string, number>;   // touchmoves each source cancelled
  digerIptal: string[];         // "touchend iptal: sayfaZoom", "touchstart iptal: bilinmeyen"
  pointercancel: number;
  touchcancel: number;
  click: { hedef: string; kontrol: string | null } | null;
  olaylar: DokunmaOlayi[];
}

export const SON_DOKUNUS = 30;
const YENI_DOKUNUS_MS = 2000;   // a down this long after the last event starts a new touch even if an up was lost

const BASLA = new Set(['pointerdown', 'touchstart']);
const BITIR = new Set(['pointerup', 'pointercancel', 'touchend', 'touchcancel']);

function bos(no: number, o: DokunmaOlayi): Dokunus {
  return {
    no, cihaz: '?', ham: '', hedef: o.hedef, kontrol: o.kontrol, sureMs: null, touchmove: 0, touchmoveIptal: 0,
    moveKaynak: {}, digerIptal: [], pointercancel: 0, touchcancel: 0, click: null, olaylar: []
  };
}

// The events split into touches: a touch starts with a down / touchstart while nothing is down
export function dokunuslariAyir(olaylar: readonly DokunmaOlayi[]): Dokunus[] {
  const out: Dokunus[] = [];
  const pointerlar = new Set<number>();
  let dokunma = 0;
  let son: Dokunus | null = null;
  let sonT = -Infinity;
  for (const o of olaylar) {
    if (o.tur !== 'iptal' && o.tur !== 'click' && BASLA.has(o.tur)
      && (!son || (pointerlar.size === 0 && dokunma === 0) || o.t - sonT > YENI_DOKUNUS_MS)) {
      if (o.t - sonT > YENI_DOKUNUS_MS) { pointerlar.clear(); dokunma = 0; }
      son = bos(out.length + 1, o);
      out.push(son);
    }
    if (!son) continue;   // a click / up before any touch (the log started in the middle)
    son.olaylar.push(o);
    sonT = o.t;
    if (o.tur === 'pointerdown' && o.pointerId != null) pointerlar.add(o.pointerId);
    if ((o.tur === 'pointerup' || o.tur === 'pointercancel') && o.pointerId != null) pointerlar.delete(o.pointerId);
    if (o.tur.startsWith('touch') && o.kalan != null) dokunma = o.kalan;
  }
  for (const d of out) doldur(d);
  return out;
}

function doldur(d: Dokunus): void {
  const os = d.olaylar;
  const pd = os.find(o => o.tur === 'pointerdown');
  const ts = os.find(o => o.tur === 'touchstart');
  const pt = pd?.pointerType;
  const tt = ts?.touchType;
  d.ham = [pt, tt].filter(Boolean).join('/');
  d.cihaz = pt === 'pen' || tt === 'stylus' ? 'kalem' : pt === 'touch' || (!pt && ts) ? 'parmak' : pt === 'mouse' ? 'fare' : '?';
  const ilk = pd ?? ts;
  if (ilk) { d.hedef = ilk.hedef; d.kontrol = ilk.kontrol; }
  const baslangic = os.find(o => o.tur === 'pointerdown') ?? ts;
  const bitisler = os.filter(o => o.tur === 'pointerup' || o.tur === 'pointercancel');
  const bitis = bitisler[bitisler.length - 1] ?? [...os].reverse().find(o => o.tur !== 'iptal' && BITIR.has(o.tur));
  d.sureMs = baslangic && bitis ? Math.round(bitis.t - baslangic.t) : null;

  // each cancel of ours belongs to the last event of its type before it (it came while that one was dispatched)
  const kaynaklar = new Map<DokunmaOlayi, Set<string>>();
  os.forEach((o, i) => {
    if (o.tur !== 'iptal') return;
    for (let j = i - 1; j >= 0; j--) {
      if (os[j].tur === o.olayTuru) {
        const s = kaynaklar.get(os[j]) ?? new Set<string>();
        s.add(o.kaynak ?? '?');
        kaynaklar.set(os[j], s);
        return;
      }
    }
    // not one of the logged events (the gesture events): listed on its own
    d.digerIptal.push(`${o.olayTuru ?? '?'} iptal: ${o.kaynak ?? '?'}`);
  });

  for (const o of os) {
    if (o.tur === 'touchmove') {
      d.touchmove++;
      const k = kaynaklar.get(o);
      if (o.iptal || k) d.touchmoveIptal++;
      if (k) for (const s of k) d.moveKaynak[s] = (d.moveKaynak[s] ?? 0) + 1;
      else if (o.iptal) d.moveKaynak.bilinmeyen = (d.moveKaynak.bilinmeyen ?? 0) + 1;
    } else if (o.tur === 'pointercancel') d.pointercancel++;
    else if (o.tur === 'touchcancel') d.touchcancel++;
    else if (o.tur === 'click') { if (!d.click) d.click = { hedef: o.hedef, kontrol: o.kontrol }; }
    else if (o.tur !== 'iptal') {
      const k = kaynaklar.get(o);
      if (k || o.iptal) d.digerIptal.push(`${o.tur} iptal: ${k ? [...k].join(', ') : 'bilinmeyen'}`);
    }
  }
}

export function dokunusSatiri(d: Dokunus): string {
  const kaynak = Object.entries(d.moveKaynak).map(([k, n]) => `${k} ${n}`).join(', ');
  const click = !d.click ? 'click: YOK'
    : d.click.kontrol === d.kontrol ? 'click: VAR' : `click: VAR (başka: ${d.click.kontrol ?? d.click.hedef})`;
  return [
    `#${d.no} ${d.cihaz}${d.ham ? ` (${d.ham})` : ''}`,
    d.kontrol ?? `kontrol yok: ${d.hedef}`,
    `down→up ${d.sureMs == null ? '–' : d.sureMs + ' ms'}`,
    `touchmove ${d.touchmove}` + (d.touchmoveIptal ? ` (${d.touchmoveIptal} iptal: ${kaynak})` : ''),
    ...d.digerIptal,
    d.pointercancel ? `pointercancel ${d.pointercancel}` : '',
    d.touchcancel ? `touchcancel ${d.touchcancel}` : '',
    click,
  ].filter(Boolean).join(' | ');
}

// The box: the last touches, newest first
export function dokunmaSatirlari(olaylar: readonly DokunmaOlayi[], n = SON_DOKUNUS): string[] {
  return dokunuslariAyir(olaylar).slice(-n).reverse().map(dokunusSatiri);
}

// Kopyala: the lines, then each touch's raw events (one JSON line per touch)
export function dokunmaMetni(olaylar: readonly DokunmaOlayi[], n = SON_DOKUNUS): string {
  const ds = dokunuslariAyir(olaylar).slice(-n);
  return [
    ...ds.map(dokunusSatiri),
    '',
    ...ds.map(d => `#${d.no} ` + JSON.stringify(d.olaylar)),
  ].join('\n');
}
