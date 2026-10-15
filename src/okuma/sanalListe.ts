// Virtual list maths for the reader (no DOM, so it can be tested).
// Pages are stacked top to bottom; only the visible ones ±2 get a canvas (see CLAUDE.md → Faz 3).

export const GAP = 18;          // px between pages (prototype #pdfView)
export const PAD_TOP = 8;
export const PAD_BOTTOM = 40;
export const MAX_DPR = 2;
export const MAX_PIXELS = 16_000_000;   // iPad Safari: one canvas at most 16 MP

export interface Layout {
  tops: number[];      // y of each page inside the scroll content
  heights: number[];
  total: number;       // height of the scroll content
}

// ratios: height / width of each page
export function layoutPages(ratios: number[], width: number): Layout {
  const tops: number[] = [], heights: number[] = [];
  let y = PAD_TOP;
  for (const r of ratios) {
    const h = Math.round(width * r);
    tops.push(y); heights.push(h);
    y += h + GAP;
  }
  return { tops, heights, total: (ratios.length ? y - GAP : y) + PAD_BOTTOM };
}

// Index of the last page whose top is ≤ y (0 if none).
export function pageAt(l: Layout, y: number): number {
  let lo = 0, hi = l.tops.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (l.tops[mid] <= y) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// Pages to draw: those overlapping [scrollTop, scrollTop + viewH], plus `extra` on each side.
export function visibleRange(l: Layout, scrollTop: number, viewH: number, extra = 2): [first: number, last: number] {
  const n = l.tops.length;
  if (!n) return [0, -1];
  const first = pageAt(l, scrollTop);
  const top = l.tops[first] + l.heights[first] < scrollTop ? first + 1 : first;   // first is in the gap above
  const last = pageAt(l, scrollTop + viewH);
  return [Math.max(0, Math.min(top, last) - extra), Math.min(n - 1, last + extra)];
}

// The page the reader is "on": the one crossing the top third of the screen.
export function currentPage(l: Layout, scrollTop: number, viewH: number): number {
  return pageAt(l, scrollTop + viewH / 3);
}

// Canvas pixel size for a page shown at cssW × cssH: devicePixelRatio ≤ 2 and ≤ maxPx
// (16 MP; less on a touch device or when the canvas budget is short, see canvasButcesi.ts).
export function canvasSize(cssW: number, cssH: number, dpr: number, maxPx = MAX_PIXELS): { w: number; h: number; scale: number } {
  let scale = Math.min(Math.max(dpr || 1, 1), MAX_DPR);
  const px = cssW * cssH * scale * scale;
  if (px > maxPx) scale *= Math.sqrt(maxPx / px);
  return { w: Math.floor(cssW * scale), h: Math.floor(cssH * scale), scale };
}
