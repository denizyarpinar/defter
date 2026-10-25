import { roundPressure, type Stroke } from './cizgi';
import { curveToSvg, strokeCurve } from './cizgiSekli';
import { InputRouter } from './girdi';
import { kalemOlcer } from './kalemOlcum';
import { EventOrder, minStep, pushLastPoint, pushPoint, roundPt, screenToViewport, toPdf, type PenViewport } from './koordinat';
import { eraserRadius, type Pt } from './silgi';
import { dokunmaIptal } from '../ui/dokunmaIz';

// Pen mode (task 4.6): live drawing on the reader's pages. The stroke being drawn is an SVG
// <path> over its page (no canvas: the canvas budget is not touched), updated once per frame.
// When the pen lifts, the stroke goes to the host (model + the page's layer drawn again).
// Which input draws: girdi.ts. Where on the page: koordinat.ts.
// Task 4.7: with the eraser, the same input erases instead (silgi.ts): every move from the last
// point to the new one goes to the host. A grey circle shows the eraser (also on hover for pen / mouse).
// Task 4.7b: the eraser follows the pointer onto the next page (book: the other side; PDF: below / above).
// A pen stroke stays on the page it started on.
// Task 4.7c: the live path is the stroke's final shape (cizgiSekli.ts: the pen's outline, filled, its
// width from the Apple Pencil's pressure; the highlighter's smoothed line), so nothing changes when
// the pen lifts. Predicted points (getPredictedEvents, where the browser has it) are only drawn.
// Task 6.H2: kalemOlcer (kalemOlcum.ts; development and ?olcum=1, otherwise null) records each stroke's
// events for diagnosis. It only watches: nothing here draws differently with it.
// Task 6.H2b: points closer than 1 screen px are dropped (at most 0.5 pt: minStep), an event older than
// the last one taken is dropped (EventOrder: the iPad sent some moves twice), the pen's up point ends the
// stroke. A pen's flat pressure (a stylus without a sensor) is saved too: it is drawn at a constant width (cizgiSekli.ts).

const SVG = 'http://www.w3.org/2000/svg';

// An area gets the pen's listeners once: a second PenInput on it would take every move twice (6.H2b)
const bound = new WeakSet<HTMLElement>();

// A page that can be drawn on now (its file's strokes are loaded, its viewport known)
export interface PenPage {
  index: number;
  viewport: PenViewport;
}

export type PenTool = Stroke['arac'] | 'silgi';

export interface PenHost {
  pageAt(box: HTMLElement): PenPage | null;
  pageAtPoint(cx: number, cy: number): { box: HTMLElement; page: PenPage } | null;   // a page that can be drawn on, under the point
  tool(): PenTool;
  style(): Pick<Stroke, 'arac' | 'renk' | 'kalinlik' | 'opaklik'>;
  add(page: PenPage, s: Stroke): void;
  erase(page: PenPage, from: Pt, to: Pt, r: number): void;   // PDF pt; r: the eraser's radius in pt
  eraseEnd(): void;                // the drag ended: one operation
  eraseCancel(): void;             // the drag was cancelled: what it erased comes back
  penSeen(): void;                 // the first Apple Pencil: fingers stop drawing
  fingerPan(): boolean;            // two fingers should scroll the list (PDF mode, fingers draw)
  scroller: HTMLElement;
}

interface Live {
  id: number;
  pen: boolean;
  box: HTMLElement;
  page: PenPage;
  style: ReturnType<PenHost['style']>;
  svg: SVGSVGElement;
  path: SVGPathElement;
  pdf: number[];            // PDF user space
  basinc: number[] | null;  // Apple Pencil only (mouse / finger pressure isn't real: simulated when drawn)
  step: number;             // pt: closer points are dropped (1 screen px at this zoom, at most 0.5 pt)
  order: EventOrder;        // events older than the last one taken are dropped
  lastMove: PointerEvent | null;   // ?olcum=1: the same event object again?
  predicted: number[];      // PDF user space, drawn but not kept
  predTimer: number;        // clears the predicted points when the pen stops
  raf: number;
}

// An eraser drag
interface Rub {
  id: number;
  pen: boolean;
  box: HTMLElement;      // the page it is on now
  page: PenPage;
  last: Pt;              // PDF pt on that page
  lastScreen: Pt;        // client px
}

// The eraser's grey circle, on one page at a time
interface Cursor { box: HTMLElement; svg: SVGSVGElement; circle: SVGCircleElement }

// crypto.randomUUID needs a secure page (https / localhost); the iPad on the dev server's LAN address isn't one
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const num = (v: number) => String(Math.round(v * 100) / 100);

export class PenInput {
  active = false;
  private router = new InputRouter();
  private live: Live | null = null;
  private rub: Rub | null = null;
  private cursor: Cursor | null = null;
  private ignored = new Set<number>();               // palm touches while the pen draws
  private fingers = new Map<number, { x: number; y: number }>();

  constructor(areas: HTMLElement[], private host: PenHost) {
    for (const a of areas) {
      if (bound.has(a)) { console.warn('Kalem dinleyicileri bu alana zaten bağlı; ikinci kez bağlanmadı.', a); continue; }
      bound.add(a);
      // capture: before the zoom controller (it asks owns / ignores)
      a.addEventListener('pointerdown', e => this.down(e), true);
      a.addEventListener('pointermove', e => this.move(e), true);
      a.addEventListener('pointerup', e => this.up(e, true), true);
      a.addEventListener('pointercancel', e => this.up(e, false), true);
      a.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && !this.rub) this.hideCursor(); });
      // iPad: the Pencil must not scroll the list; neither must the hand while the pen draws.
      // Fingers keep their touch-action (pan); pointer events still come.
      const block = (e: TouchEvent) => {
        if (!this.active) return;
        const stylus = [...e.changedTouches].some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
        if (stylus && e.type === 'touchstart') kalemOlcer?.touchstart(e.cancelable);
        if (stylus || this.live?.pen || this.rub?.pen) { dokunmaIptal('kalemModu', e); e.preventDefault(); }
      };
      a.addEventListener('touchstart', block, { passive: false });
      a.addEventListener('touchmove', block, { passive: false });
    }
  }

  get penSeen(): boolean { return this.router.penSeen; }
  isDrawing(): boolean { return !!this.live || !!this.rub; }
  owns(id: number): boolean { return this.live?.id === id || this.rub?.id === id; }
  ignores(id: number): boolean { return this.ignored.has(id); }

  // Pen mode off, page changed under the stroke, undo, …: the stroke being drawn is dropped,
  // an eraser drag is undone (what it erased comes back).
  cancel(): void {
    const r = this.rub;
    if (r) {
      this.rub = null;
      this.hideCursor();
      try { r.box.releasePointerCapture(r.id); } catch { /* already released */ }
      this.host.eraseCancel();
    }
    const l = this.live;
    if (!l) return;
    this.live = null;
    kalemOlcer?.bitir(null, null, l.pdf);
    cancelAnimationFrame(l.raf);
    l.svg.remove();
    try { l.box.releasePointerCapture(l.id); } catch { /* already released */ }
  }

  // The tool changed or the pen went off: no circle left on a page
  hideCursor(): void {
    this.cursor?.svg.remove();
    this.cursor?.box.classList.remove('silgi-imlecli');
    this.cursor = null;
  }

  private down(e: PointerEvent): void {
    const seen = this.router.penSeen;
    const d = this.router.down(e.pointerType, e.pointerId, e.button, !!this.live?.pen || !!this.rub?.pen);
    if (!seen && this.router.penSeen) this.host.penSeen();
    if (e.pointerType === 'touch') this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.active) return;
    if (d.cancel) { if (this.live) kalemOlcer?.neden('iptal-ikinci-parmak'); this.cancel(); }
    const olc = e.pointerType !== 'touch' ? kalemOlcer : null;   // why a pen / mouse down drew nothing
    if (d.route === 'yoksay') { this.ignored.add(e.pointerId); if (this.live) kalemOlcer?.avuc(); else olc?.reddet(e, 'rota-yoksay'); return; }
    if (d.route !== 'ciz') { olc?.reddet(e, `rota-${d.route}`); return; }
    if (this.live || this.rub) { olc?.reddet(e, `cizim-suruyor (id ${(this.live ?? this.rub)!.id})`); return; }
    const target = e.target as HTMLElement;
    if (target.closest('a, button, select')) { olc?.reddet(e, 'dugme'); return; }
    const box = target.closest<HTMLElement>('.o-page');
    const page = box && this.host.pageAt(box);
    if (!box || !page) { olc?.reddet(e, box ? 'sayfa-hazir-degil' : 'sayfa-yok'); return; }   // not a PDF page, or its file is still loading / failed
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }

    if (this.host.tool() === 'silgi') {
      const p = this.pdfPoint(e.clientX, e.clientY, box, page);
      this.rub = { id: e.pointerId, pen: e.pointerType === 'pen', box, page, last: p, lastScreen: [e.clientX, e.clientY] };
      this.showCursor(e, box, page);
      this.host.erase(page, p, p, this.radius(box, page));
      return;
    }

    const style = this.host.style();
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', `o-cizim canli${style.arac === 'fosforlu' ? ' fosforlu' : ''}`);
    svg.setAttribute('viewBox', `0 0 ${num(page.viewport.width)} ${num(page.viewport.height)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    // as the layer draws it (cizimKatmani.ts): pen filled, highlighter stroked
    const attrs: Record<string, string> = style.arac === 'kalem'
      ? { fill: style.renk }
      : { fill: 'none', stroke: style.renk, 'stroke-width': num(style.kalinlik), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: num(style.opaklik) };
    for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v);
    svg.append(path);
    box.append(svg);
    const pen = e.pointerType === 'pen';
    this.live = {
      id: e.pointerId, pen, box, page, style, svg, path, pdf: [], basinc: pen && style.arac === 'kalem' ? [] : null,
      step: minStep(box.getBoundingClientRect().width, page.viewport.width), order: new EventOrder(), lastMove: null,
      predicted: [], predTimer: 0, raf: 0
    };
    kalemOlcer?.basla(e, style.arac, style.kalinlik);
    this.addPoint(e);
    this.paint();
  }

  private move(e: PointerEvent): void {
    const prev = this.fingers.get(e.pointerId);
    if (prev) {
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // fingers draw (no pen seen), PDF mode: two fingers move the list (touch-action is none there)
      if (this.active && !this.live && this.fingers.size === 2 && this.host.fingerPan()) {
        this.host.scroller.scrollBy((prev.x - e.clientX) / 2, (prev.y - e.clientY) / 2);
      }
    }
    const r = this.rub;
    if (r) {
      if (r.id !== e.pointerId) return;
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) this.rubTo(r, ev.clientX, ev.clientY);
      this.showCursor(e, r.box, r.page);
      return;
    }
    if (this.active && !this.live && e.pointerType !== 'touch') this.hover(e);
    const l = this.live;
    if (!l || l.id !== e.pointerId) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (kalemOlcer) {
      const hedef = e.currentTarget instanceof HTMLElement ? e.currentTarget.id || e.currentTarget.className : '?';
      kalemOlcer.kimlik(e === l.lastMove, hedef, e.isTrusted);
    }
    l.lastMove = e;
    let changed = false;
    for (const ev of evs.length ? evs : [e]) changed = this.addPoint(ev) || changed;
    // where the pen is about to be (Chrome / Edge; not in Safari): drawn ahead, replaced on every move
    const pred = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
    kalemOlcer?.hareket(e, evs, pred.length);
    if (pred.length || l.predicted.length) {
      l.predicted = [];
      for (const ev of pred) l.predicted.push(...this.toPdfPoint(ev, l));
      changed = true;
      // the pen stopped (no new move): the guess would stay ahead of it as a tail, so it goes
      clearTimeout(l.predTimer);
      if (l.predicted.length) l.predTimer = window.setTimeout(() => { if (this.live === l) { l.predicted = []; this.paint(); } }, 50);
    }
    if (changed && !l.raf) l.raf = requestAnimationFrame(() => { l.raf = 0; if (this.live === l) this.paint(); });
  }

  private up(e: PointerEvent, ok: boolean): void {
    this.router.up(e.pointerId);
    this.fingers.delete(e.pointerId);
    this.ignored.delete(e.pointerId);
    const r = this.rub;
    if (r && r.id === e.pointerId) {
      if (!ok) { this.cancel(); return; }
      this.rub = null;
      if (e.pointerType === 'touch') this.hideCursor();   // a finger doesn't hover
      this.host.eraseEnd();
      return;
    }
    const l = this.live;
    if (!l || l.id !== e.pointerId) return;
    if (!ok) { kalemOlcer?.bitir(e, 'x', l.pdf); this.cancel(); return; }
    // the stroke ends where the pen lifted (its pressure: the last one; the up's own is 0)
    if (l.order.accept(e.timeStamp, e.clientX, e.clientY)) {
      const [x, y] = this.toPdfPoint(e, l);
      pushLastPoint(l.pdf, l.basinc, roundPt(x), roundPt(y), l.step);
    } else kalemOlcer?.cift();
    kalemOlcer?.bitir(e, 'u', l.pdf);
    this.live = null;
    cancelAnimationFrame(l.raf);
    l.svg.remove();
    // a single tap is a dot: one point
    const s: Stroke = { id: newId(), ...l.style, noktalar: l.pdf };
    // a flat pressure is kept as well: it marks a pen without a sensor (constant width, cizgiSekli.ts)
    if (l.basinc) s.basinc = l.basinc;
    this.host.add(l.page, s);
  }

  // The eraser moves to (cx, cy). Over another page: the old page is erased up to its edge, the new
  // one from its edge on (the last point pulled onto it), so a fast move misses nothing at the border.
  // Between pages (the gap): it stays on the old page, at its edge.
  private rubTo(r: Rub, cx: number, cy: number): void {
    const hit = this.host.pageAtPoint(cx, cy);
    if (hit && hit.box !== r.box) {
      this.host.erase(r.page, r.last, this.pdfPoint(cx, cy, r.box, r.page), this.radius(r.box, r.page));
      r.box = hit.box; r.page = hit.page;
      r.last = this.pdfPoint(r.lastScreen[0], r.lastScreen[1], r.box, r.page);
    }
    const p = this.pdfPoint(cx, cy, r.box, r.page);
    this.host.erase(r.page, r.last, p, this.radius(r.box, r.page));
    r.last = p;
    r.lastScreen = [cx, cy];
  }

  // A point outside the page is pulled to its edge (screenToViewport)
  private pdfPoint(cx: number, cy: number, box: HTMLElement, page: PenPage): Pt {
    const [vx, vy] = screenToViewport(cx, cy, box.getBoundingClientRect(), page.viewport);
    return toPdf(page.viewport, vx, vy);
  }

  // ERASER_PX on the screen, in pt (the viewport at scale 1 is in pt; the box has the zoom in it)
  private radius(box: HTMLElement, page: PenPage): number {
    return eraserRadius(box.getBoundingClientRect().width, page.viewport.width);
  }

  // Pen / mouse over a page with the eraser: the circle follows
  private hover(e: PointerEvent): void {
    if (this.host.tool() !== 'silgi') { this.hideCursor(); return; }
    const box = (e.target as HTMLElement).closest<HTMLElement>('.o-page');
    const page = box && this.host.pageAt(box);
    if (!box || !page) { this.hideCursor(); return; }
    this.showCursor(e, box, page);
  }

  private showCursor(e: PointerEvent, box: HTMLElement, page: PenPage): void {
    const vp = page.viewport, rect = box.getBoundingClientRect();
    let c = this.cursor;
    if (c && (c.box !== box || !c.svg.isConnected)) { this.hideCursor(); c = null; }
    if (!c) {
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'o-cizim canli o-silgi');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const circle = document.createElementNS(SVG, 'circle');
      svg.append(circle);
      box.append(svg);
      box.classList.add('silgi-imlecli');   // the circle is the cursor here (CSS cursor: none)
      c = this.cursor = { box, svg, circle };
    }
    c.svg.setAttribute('viewBox', `0 0 ${num(vp.width)} ${num(vp.height)}`);
    const [vx, vy] = screenToViewport(e.clientX, e.clientY, rect, vp);
    c.circle.setAttribute('cx', num(vx));
    c.circle.setAttribute('cy', num(vy));
    c.circle.setAttribute('r', num(eraserRadius(rect.width, vp.width)));
  }

  private toPdfPoint(e: PointerEvent, l: Live): [number, number] {
    const [vx, vy] = screenToViewport(e.clientX, e.clientY, l.box.getBoundingClientRect(), l.page.viewport);
    return toPdf(l.page.viewport, vx, vy);
  }

  private addPoint(e: PointerEvent): boolean {
    const l = this.live!;
    if (!l.order.accept(e.timeStamp, e.clientX, e.clientY)) { kalemOlcer?.cift(); return false; }
    const [x, y] = this.toPdfPoint(e, l);
    if (!pushPoint(l.pdf, roundPt(x), roundPt(y), l.step)) return false;
    l.basinc?.push(roundPressure(e.pressure));   // rounded now: the live stroke is the saved one
    return true;
  }

  // The stroke's shape so far, drawn as if finished (the same shape once the pen lifts), plus the predicted points
  private paint(): void {
    const l = this.live!;
    const noktalar = l.predicted.length ? l.pdf.concat(l.predicted) : l.pdf;
    let basinc = l.basinc ?? undefined;
    if (basinc && l.predicted.length) basinc = basinc.concat(Array(l.predicted.length / 2).fill(basinc[basinc.length - 1]));
    const curve = strokeCurve({ arac: l.style.arac, noktalar, basinc, kalinlik: l.style.kalinlik });
    l.path.setAttribute('d', curveToSvg(curve, (x, y) => l.page.viewport.convertToViewportPoint(x, y)));
  }
}
