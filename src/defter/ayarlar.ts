import { MAX_PIXELS } from '../okuma/sanalListe';

// Faz 5: notebook photos → PDF pages. Temporary defaults (CLAUDE.md, "Geçici varsayılanlar"):
// Deniz checks them in the tests, so they live here and nowhere else.

export const MAX_KENAR = 2000;      // longest edge of a prepared photo, px (never enlarged)
export const JPEG_KALITE = 0.85;    // canvas.toBlob quality

// iPad Safari: one canvas at most 16 MP (same limit as the reader's canvases)
export const MAX_CANVAS_PIKSEL = MAX_PIXELS;
