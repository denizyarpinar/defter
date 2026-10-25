import { dokunmaIptal } from './dokunmaIz';

// iPad: the browser must never zoom the page itself (task 3.7). Our own zoom (reader) works with
// pointer events and CSS; a browser zoom pushed the bars off screen, stayed after a reload and
// shrank the room. iOS often ignores user-scalable=no / maximum-scale=1, so:
//  - two or more fingers moving: the touch is cancelled (the pointer events we use still arrive)
//  - Safari gesture events: cancelled
//  - the second tap of a double tap on a surface (not a button): cancelled
// If the page is zoomed anyway (visualViewport.scale > 1), fingers are free again so it can be
// pinched back, a reset is tried, and a small bar says what to do.

export const DOUBLE_TAP_MS = 300;
const ZOOMED = 1.01;

export const isPageZoomed = (scale: number | undefined) => (scale ?? 1) > ZOOMED;

// Controls whose clicks must not be cancelled (a fast second tap on them is a normal tap).
const CONTROLS = 'button, a, input, select, textarea, label, [data-st], [data-u], [role="tab"]';

// Should this touch event be cancelled so the browser can't zoom?
// sinceLastEnd: ms since the previous touchend (Infinity: none).
export function blockTouch(kind: 'move' | 'end', touches: number, scale: number | undefined, sinceLastEnd: number, onControl: boolean): boolean {
  if (isPageZoomed(scale)) return false;   // already zoomed: let the fingers zoom back out
  if (kind === 'move') return touches >= 2;
  return !onControl && sinceLastEnd < DOUBLE_TAP_MS;
}

export interface ViewportLike { scale: number; width: number; offsetLeft: number; offsetTop: number }

// The bar sits at the top of what is on screen and looks normal-sized while the page is zoomed.
export function barTransform(v: ViewportLike): { width: number; transform: string } {
  return { width: v.width * v.scale, transform: `translate(${v.offsetLeft}px, ${v.offsetTop}px) scale(${1 / v.scale})` };
}

const vv = () => window.visualViewport;

// Re-applying the viewport tag makes Safari go back to scale 1 in many cases (not always).
function resetZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.content;
  meta.content = content.replace(/,?\s*minimum-scale=[\d.]+/, '') + ',minimum-scale=1';
  requestAnimationFrame(() => { meta.content = content; });
}

export function installPageZoomGuard(onViewportChange: () => void): void {
  let lastEnd = -Infinity;
  const opts = { passive: false } as const;

  document.addEventListener('touchmove', e => {
    if (blockTouch('move', e.touches.length, vv()?.scale, Infinity, false)) { dokunmaIptal('sayfaZoom', e); e.preventDefault(); }
  }, opts);
  document.addEventListener('touchend', e => {
    const now = performance.now();
    const onControl = !!(e.target as Element | null)?.closest?.(CONTROLS);
    if (e.touches.length === 0 && blockTouch('end', 1, vv()?.scale, now - lastEnd, onControl)) { dokunmaIptal('sayfaZoom', e); e.preventDefault(); }
    if (e.touches.length === 0) lastEnd = now;
  }, opts);
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, e => { if (!isPageZoomed(vv()?.scale)) { dokunmaIptal('sayfaZoom', e); e.preventDefault(); } }, opts);
  }

  // ---- recovery ----
  const bar = document.createElement('div');
  bar.id = 'sayfaZoom';
  bar.hidden = true;
  bar.innerHTML = '<span>Sayfa yakınlaşmış.</span><button type="button">Sıfırla</button>'
    + '<small>Olmazsa iki parmakla uzaklaştır ya da iPad\'i yan çevir.</small>';
  bar.querySelector('button')!.addEventListener('click', resetZoom);
  document.body.append(bar);

  let tried = false;
  const check = () => {
    const v = vv();
    const zoomed = !!v && isPageZoomed(v.scale);
    if (zoomed && !tried) { tried = true; resetZoom(); }   // once on its own; the button tries again
    if (!zoomed) tried = false;
    bar.hidden = !zoomed;
    if (zoomed && v) {
      const t = barTransform(v);
      bar.style.width = t.width + 'px';
      bar.style.transform = t.transform;
    }
  };
  let t: number | undefined;
  const changed = () => {
    check();
    clearTimeout(t);
    t = window.setTimeout(onViewportChange, 150);
  };
  vv()?.addEventListener('resize', changed);
  vv()?.addEventListener('scroll', check);
  addEventListener('pageshow', changed);
  // a zoom that survived the reload: Safari applies it a moment after load
  check();
  setTimeout(check, 500);
}
