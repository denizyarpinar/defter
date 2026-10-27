// Numbers for the ?fps=1 box (task 3.7): the reader's canvases and how slow page drawing is.
// Cheap enough to collect always; shown only with ?fps=1.

const WINDOW_MS = 5000;   // "en yavaş çizim" looks at the last 5 seconds

let canvases = 0;
let pixels = 0;
let renders: { t: number; ms: number }[] = [];

export function setCanvasStats(count: number, px: number): void {
  canvases = count;
  pixels = px;
}

export function noteRender(ms: number, now = performance.now()): void {
  renders.push({ t: now, ms });
  renders = renders.filter(r => now - r.t <= WINDOW_MS);
}

export function slowestRender(now = performance.now()): number | null {
  const recent = renders.filter(r => now - r.t <= WINDOW_MS);
  return recent.length ? Math.max(...recent.map(r => r.ms)) : null;
}

// "canvas 6 · 18.4 MP · en yavaş çizim 142 ms"
export function canvasLine(now = performance.now()): string {
  const slow = slowestRender(now);
  return `canvas ${canvases} · ${(pixels / 1e6).toFixed(1)} MP · en yavaş çizim ${slow === null ? '–' : Math.round(slow) + ' ms'}`;   // dil-kontrol: yoksay
}
