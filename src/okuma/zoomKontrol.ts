import { Debouncer } from './cizimKuyrugu';
import {
  TAP_ZOOM, clampPan, clampZoom, isDoubleTap, isZoomed, zoomAround, type Pt
} from './yakinlastirma';

// Reader zoom (task 3.4): two-finger pinch, trackpad / Ctrl + wheel, double tap; 100–400 %.
// Book mode: the spread (#oZoom) is scaled with CSS and moved with one finger (prototype #zoom).
// PDF mode: while the fingers move the pages are only scaled with CSS; when they lift, the host
// lays the pages out wider (width × zoom) and the browser's scroll pans.
// After every gesture the host draws the visible pages sharp again (settled).

export interface ZoomHost {
  mode(): 'kitap' | 'pdf';
  hasPages(): boolean;
  pdfZoom(z: number, clientX: number, clientY: number): void;   // PDF mode: lay out at zoom z, keep the point
  settled(): void;                                              // gesture over: draw sharp / free the sharp ones
  tap(clientX: number, clientY: number): boolean;               // book mode, one tap at 100 %; true = page turned
  swipe(dir: 1 | -1): void;                                     // book mode at 100 %
}

// Safari's own pinch events (iPad, Mac trackpad)
type GestureLike = UIEvent & { scale: number; clientX: number; clientY: number };
const hasGestures = typeof window !== 'undefined' && 'ongesturestart' in window;

const SETTLE_MS = 250;
const WHEEL_COMMIT_MS = 160;

export class ZoomController {
  z = 1;
  private pan: Pt = { x: 0, y: 0 };
  private pts = new Map<number, Pt>();            // touch points on the page area
  private pinch: { d: number; mx: number; my: number } | null = null;
  private pinched = false;                        // this touch had two fingers: no tap / swipe at the end
  private down: { id: number; x: number; y: number; t: number } | null = null;
  private drag: { id: number; x: number; y: number; px: number; py: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private preview: { z0: number; z: number; ox: number; oy: number } | null = null;   // PDF: CSS-only zoom
  private gesture: number | null = null;          // zoom at gesturestart
  // sharp redraw once the gesture is over and things are quiet; wheel zoom applied when the wheel stops
  private settle = new Debouncer(SETTLE_MS, () => { if (this.busy) this.settle.poke(); else this.host.settled(); });
  private wheel = new Debouncer(WHEEL_COMMIT_MS, () => { this.commitPreview(); this.settleSoon(); });

  constructor(
    private root: HTMLElement,      // #okuyucu
    private kitap: HTMLElement,     // book area
    private zoomEl: HTMLElement,    // scaled in book mode
    private scroller: HTMLElement,  // PDF list
    private pages: HTMLElement,     // PDF pages holder (CSS preview)
    private host: ZoomHost,
  ) {
    for (const el of [kitap, scroller]) {
      el.addEventListener('pointerdown', e => this.onDown(e));
      el.addEventListener('pointermove', e => this.onMove(e));
      el.addEventListener('pointerup', e => this.onUp(e, true));
      el.addEventListener('pointercancel', e => this.onUp(e, false));
    }
    // the browser's own zoom (Ctrl + wheel, trackpad pinch) becomes ours inside the reader
    root.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    // Safari: no page zoom in the reader
    root.addEventListener('gesturestart', e => this.onGesture(e as GestureLike, 'start'));
    root.addEventListener('gesturechange', e => this.onGesture(e as GestureLike, 'change'));
    root.addEventListener('gestureend', e => this.onGesture(e as GestureLike, 'end'));
  }

  get zoomed(): boolean { return isZoomed(this.z); }

  // Back to 100 % at once (new page, other mode, rotation). The host lays the pages out itself.
  reset(): void {
    this.wheel.cancel();
    this.settle.cancel();
    this.preview = null;
    this.pages.style.transform = '';
    this.z = 1;
    this.pan = { x: 0, y: 0 };
    this.pinch = null; this.drag = null; this.gesture = null;
    this.applyBook(false);
  }

  // The list was scrolled / a page got drawn while zoomed → draw sharp when things are calm.
  settleLater(): void {
    if (this.zoomed) this.settleSoon();
  }

  // ---- pointers ----

  private onDown(e: PointerEvent): void {
    if (!this.host.hasPages() || (e.target as HTMLElement).closest('a, button, select')) return;
    const pdf = this.host.mode() === 'pdf';
    if (e.pointerType === 'touch') this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2 && !(pdf && hasGestures)) {
      const [a, b] = [...this.pts.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.pinched = true;
      this.down = null; this.drag = null;
      if (pdf) this.startPreview(this.pinch.mx, this.pinch.my);
      return;
    }
    if (this.pts.size >= 2) { this.pinched = true; this.down = null; return; }
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (!pdf && this.zoomed) {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      this.kitap.setPointerCapture?.(e.pointerId);
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const f = d / Math.max(1, this.pinch.d);
      if (this.host.mode() === 'pdf') this.setPreview(this.preview ? this.preview.z * f : this.z * f);
      else {
        this.pan.x += mx - this.pinch.mx; this.pan.y += my - this.pinch.my;   // two fingers also move
        this.zoomBookAt(this.z * f, mx, my, false);
      }
      this.pinch = { d, mx, my };
      return;
    }
    if (this.drag && this.drag.id === e.pointerId) {
      this.pan = { x: this.drag.px + e.clientX - this.drag.x, y: this.drag.py + e.clientY - this.drag.y };
      this.applyBook(false);
    }
  }

  private onUp(e: PointerEvent, up: boolean): void {
    this.pts.delete(e.pointerId);
    if (this.pinch && this.pts.size < 2) {
      this.pinch = null;
      this.commitPreview();
      this.settleSoon();
    }
    if (this.drag?.id === e.pointerId) { this.drag = null; this.settleSoon(); }
    const d = this.down;
    if (d?.id === e.pointerId) this.down = null;
    const wasPinch = this.pinched;
    if (!this.pts.size) this.pinched = false;
    if (!up || !d || d.id !== e.pointerId || wasPinch) return;

    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const book = this.host.mode() === 'kitap';
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && performance.now() - d.t < 500) this.onTap(e.clientX, e.clientY);
    else if (book && !this.zoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) this.host.swipe(dx < 0 ? 1 : -1);
  }

  private onTap(x: number, y: number): void {
    const now = performance.now();
    if (isDoubleTap(this.lastTap, now, x, y)) {
      this.lastTap = { t: 0, x: 0, y: 0 };
      this.zoomTo(this.zoomed ? 1 : TAP_ZOOM, x, y, true);
      return;
    }
    this.lastTap = { t: now, x, y };
    // a turned page is not the first tap of a double tap
    if (this.host.mode() === 'kitap' && !this.zoomed && this.host.tap(x, y)) this.lastTap.t = 0;
  }

  // ---- wheel and Safari gestures ----

  private onWheel(e: WheelEvent): void {
    if (!this.host.hasPages()) { if (e.ctrlKey) e.preventDefault(); return; }
    const k = e.deltaMode === 1 ? 16 : 1;   // lines → px (Firefox)
    if (e.ctrlKey) {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * k * 0.01);
      if (this.host.mode() === 'pdf') {
        if (!this.preview) this.startPreview(e.clientX, e.clientY);
        this.setPreview(this.preview!.z * f);
        this.wheel.poke();
      } else this.zoomBookAt(this.z * f, e.clientX, e.clientY, false);
      return;
    }
    // book mode zoomed: the wheel / two-finger trackpad moves the page
    if (this.host.mode() === 'kitap' && this.zoomed && this.kitap.contains(e.target as Node)) {
      e.preventDefault();
      this.pan = { x: this.pan.x - e.deltaX * k, y: this.pan.y - e.deltaY * k };
      this.applyBook(false);
    }
  }

  private onGesture(e: GestureLike, phase: 'start' | 'change' | 'end'): void {
    e.preventDefault();
    if (!this.host.hasPages()) return;
    const pdf = this.host.mode() === 'pdf';
    // book mode on iPad: the pointer pinch above does it (touch-action: none); this is the Mac trackpad
    if (!pdf && this.pts.size >= 2) return;
    if (phase === 'start') {
      this.gesture = this.z;
      if (pdf) this.startPreview(e.clientX, e.clientY);
      return;
    }
    if (this.gesture === null) return;
    if (phase === 'change') {
      if (pdf) this.setPreview(this.gesture * e.scale);
      else this.zoomBookAt(this.gesture * e.scale, e.clientX, e.clientY, false);
      return;
    }
    this.gesture = null;
    if (pdf) this.commitPreview();
    this.settleSoon();
  }

  // ---- applying ----

  private zoomTo(z: number, x: number, y: number, anim: boolean): void {
    if (this.host.mode() === 'pdf') {
      this.z = clampZoom(z);
      this.root.classList.toggle('zoomed', this.zoomed);
      this.host.pdfZoom(this.z, x, y);
      this.settleSoon();
    } else this.zoomBookAt(z, x, y, anim);
  }

  private zoomBookAt(z: number, cx: number, cy: number, anim: boolean): void {
    const r = this.kitap.getBoundingClientRect();
    const z1 = clampZoom(z);
    this.pan = zoomAround(this.z, z1, this.pan, { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) });
    this.z = z1;
    this.applyBook(anim);
  }

  private applyBook(anim: boolean): void {
    if (!this.zoomed) { this.z = 1; this.pan = { x: 0, y: 0 }; }
    this.pan = clampPan(this.pan, this.z,
      { w: this.zoomEl.offsetWidth, h: this.zoomEl.offsetHeight },
      { w: this.kitap.clientWidth, h: this.kitap.clientHeight });
    this.zoomEl.classList.toggle('anim', anim);
    this.zoomEl.style.transform = this.zoomed ? `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.z})` : '';
    this.root.classList.toggle('zoomed', this.zoomed);
    if (this.host.mode() === 'kitap') this.settleSoon();
  }

  // PDF mode: scale the pages with CSS around the finger until the gesture ends.
  private startPreview(cx: number, cy: number): void {
    if (this.preview) return;
    const r = this.scroller.getBoundingClientRect();
    const ox = this.scroller.scrollLeft + cx - r.left, oy = this.scroller.scrollTop + cy - r.top;
    this.preview = { z0: this.z, z: this.z, ox: cx, oy: cy };
    this.pages.style.transformOrigin = `${ox}px ${oy}px`;
  }

  private setPreview(z: number): void {
    if (!this.preview) return;
    this.preview.z = clampZoom(z);
    this.pages.style.transform = `scale(${this.preview.z / this.preview.z0})`;
  }

  private commitPreview(): void {
    const p = this.preview;
    if (!p) return;
    this.preview = null;
    this.pages.style.transform = '';
    if (Math.abs(p.z - this.z) < 0.001) return;
    this.z = isZoomed(p.z) ? p.z : 1;
    this.root.classList.toggle('zoomed', this.zoomed);
    this.host.pdfZoom(this.z, p.ox, p.oy);
  }

  // fingers still on the page (pinch, pan) or a Safari gesture going on: not yet
  private get busy(): boolean {
    return !!this.pinch || !!this.drag || this.gesture !== null;
  }

  private settleSoon(): void {
    this.settle.poke();
  }
}
