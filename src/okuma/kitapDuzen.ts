// Book mode maths for the reader (no DOM, so it can be tested).
// Two pages side by side (one when the screen is portrait); only the visible ones ±2 are drawn.

export const PAGE_AR = 1.4142;   // A4: the shape of a page slot
export const FLIP_MS = 400;

// Portrait screen (iPad upright, phone): one page.
export const isSingle = (w: number, h: number) => h > w;

// Size of one page slot in an area of areaW × areaH (prototype geometry()).
export function slotSize(areaW: number, areaH: number, single: boolean): { w: number; h: number } {
  const avH = areaH - 34;
  const w = single ? Math.min(areaW - 40, avH / PAGE_AR) : Math.min((areaW - 60) / 2, avH / PAGE_AR);
  const pw = Math.max(140, Math.floor(w));
  return { w: pw, h: Math.round(pw * PAGE_AR) };
}

// A page of the given ratio (height / width) fitted into the slot, centred, nothing cut off.
export function fitPage(ratio: number, slotW: number, slotH: number): { x: number; y: number; w: number; h: number } {
  let w = slotW, h = Math.round(slotW * ratio);
  if (h > slotH) { h = slotH; w = Math.round(slotH / ratio); }
  return { x: Math.round((slotW - w) / 2), y: Math.round((slotH - h) / 2), w, h };
}

// Two pages: the left page is always an even index (0–1, 2–3, …).
export const spreadStart = (i: number, single: boolean) => single ? i : i - (i % 2);

export const pageStep = (single: boolean) => single ? 1 : 2;

// The pages on screen at idx.
export function visiblePages(idx: number, single: boolean, n: number): number[] {
  return (single ? [idx] : [idx, idx + 1]).filter(i => i >= 0 && i < n);
}

// Pages to draw: the visible ones plus `extra` on each side.
export function keepRange(idx: number, single: boolean, n: number, extra = 2): [first: number, last: number] {
  if (!n) return [0, -1];
  return [Math.max(0, idx - extra), Math.min(n - 1, idx + (single ? 0 : 1) + extra)];
}

// Task 6.S-2: the area's size changed (the page slider shown, the pen bar, rotation): measure the book again.
// Not before the first layout (null), not while the area is hidden (0), and less than 1 px is no change.
export function yenidenDuzenGerekir(eski: { w: number; h: number } | null, yeni: { w: number; h: number }): boolean {
  if (!eski || yeni.w <= 0 || yeni.h <= 0) return false;
  return Math.abs(yeni.w - eski.w) >= 1 || Math.abs(yeni.h - eski.h) >= 1;
}
