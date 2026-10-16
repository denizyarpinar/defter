import type { Stroke } from './cizgi';
import { InputRouter } from './girdi';
import { pushPoint, screenToViewport, toPdf, type PenViewport } from './koordinat';

// Pen mode (task 4.6): live drawing on the reader's pages. The stroke being drawn is an SVG
// <path> over its page (no canvas: the canvas budget is not touched), updated once per frame.
// When the pen lifts, the stroke goes to the host (model + the page's layer drawn again).
// Which input draws: girdi.ts. Where on the page: koordinat.ts.

const SVG = 'http://www.w3.org/2000/svg';

// A page that can be drawn on now (its file's strokes are loaded, its viewport known)
export interface PenPage {
  index: number;
  viewport: PenViewport;
}

export interface PenHost {
  pageAt(box: HTMLElement): PenPage | null;
  style(): Pick<Stroke, 'arac' | 'renk' | 'kalinlik' | 'opaklik'>;
  add(page: PenPage, s: Stroke): void;
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
  pdf: number[];     // PDF user space
  view: number[];    // viewBox units (what the path draws)
  raf: number;
}

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
  private ignored = new Set<number>();               // palm touches while the pen draws
  private fingers = new Map<number, { x: number; y: number }>();

  constructor(areas: HTMLElement[], private host: PenHost) {
    for (const a of areas) {
      // capture: before the zoom controller (it asks owns / ignores)
      a.addEventListener('pointerdown', e => this.down(e), true);
      a.addEventListener('pointermove', e => this.move(e), true);
      a.addEventListener('pointerup', e => this.up(e, true), true);
      a.addEventListener('pointercancel', e => this.up(e, false), true);
      // iPad: the Pencil must not scroll the list; neither must the hand while the pen draws.
      // Fingers keep their touch-action (pan); pointer events still come.
      const block = (e: TouchEvent) => {
        if (!this.active) return;
        const stylus = [...e.changedTouches].some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
        if (stylus || this.live?.pen) e.preventDefault();
      };
      a.addEventListener('touchstart', block, { passive: false });
      a.addEventListener('touchmove', block, { passive: false });
    }
  }

  get penSeen(): boolean { return this.router.penSeen; }
  isDrawing(): boolean { return !!this.live; }
  owns(id: number): boolean { return this.live?.id === id; }
  ignores(id: number): boolean { return this.ignored.has(id); }

  // Pen mode off, page changed under the stroke, …: the stroke being drawn is dropped.
  cancel(): void {
    const l = this.live;
    if (!l) return;
    this.live = null;
    cancelAnimationFrame(l.raf);
    l.svg.remove();
    try { l.box.releasePointerCapture(l.id); } catch { /* already released */ }
  }

  private down(e: PointerEvent): void {
    const seen = this.router.penSeen;
    const d = this.router.down(e.pointerType, e.pointerId, e.button, !!this.live?.pen);
    if (!seen && this.router.penSeen) this.host.penSeen();
    if (e.pointerType === 'touch') this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.active) return;
    if (d.cancel) this.cancel();
    if (d.route === 'yoksay') { this.ignored.add(e.pointerId); return; }
    if (d.route !== 'ciz' || this.live) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, select')) return;
    const box = target.closest<HTMLElement>('.o-page');
    const page = box && this.host.pageAt(box);
    if (!box || !page) return;   // not a PDF page, or its file is still loading / failed
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }

    const style = this.host.style();
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', `o-cizim canli${style.arac === 'fosforlu' ? ' fosforlu' : ''}`);
    svg.setAttribute('viewBox', `0 0 ${num(page.viewport.width)} ${num(page.viewport.height)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    for (const [k, v] of Object.entries({
      fill: 'none', stroke: style.renk, 'stroke-width': num(style.kalinlik), 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    })) path.setAttribute(k, v);
    if (style.opaklik < 1) path.setAttribute('opacity', num(style.opaklik));
    svg.append(path);
    box.append(svg);
    this.live = { id: e.pointerId, pen: e.pointerType === 'pen', box, page, style, svg, path, pdf: [], view: [], raf: 0 };
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
    const l = this.live;
    if (!l || l.id !== e.pointerId) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    let added = false;
    for (const ev of evs.length ? evs : [e]) added = this.addPoint(ev) || added;
    if (added && !l.raf) l.raf = requestAnimationFrame(() => { l.raf = 0; if (this.live === l) this.paint(); });
  }

  private up(e: PointerEvent, ok: boolean): void {
    this.router.up(e.pointerId);
    this.fingers.delete(e.pointerId);
    this.ignored.delete(e.pointerId);
    const l = this.live;
    if (!l || l.id !== e.pointerId) return;
    if (!ok) { this.cancel(); return; }
    this.live = null;
    cancelAnimationFrame(l.raf);
    l.svg.remove();
    // a single tap is a dot: one point
    this.host.add(l.page, { id: newId(), ...l.style, noktalar: l.pdf });
  }

  private addPoint(e: PointerEvent): boolean {
    const l = this.live!;
    const [vx, vy] = screenToViewport(e.clientX, e.clientY, l.box.getBoundingClientRect(), l.page.viewport);
    const [x, y] = toPdf(l.page.viewport, vx, vy);
    if (!pushPoint(l.pdf, x, y)) return false;
    l.view.push(vx, vy);
    return true;
  }

  private paint(): void {
    const l = this.live!, v = l.view;
    // one point: a zero-length line, drawn as a round dot by the round cap
    let d = `M${num(v[0])} ${num(v[1])}` + (v.length === 2 ? `L${num(v[0])} ${num(v[1])}` : '');
    for (let i = 2; i < v.length; i += 2) d += `L${num(v[i])} ${num(v[i + 1])}`;
    l.path.setAttribute('d', d);
  }
}
