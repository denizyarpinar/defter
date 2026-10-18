import { MAX_PIXELS } from '../okuma/sanalListe';

// Faz 5: notebook photos → PDF pages. Temporary defaults (CLAUDE.md, "Geçici varsayılanlar"):
// Deniz checks them in the tests, so they live here and nowhere else.

export const MAX_KENAR = 2000;      // longest edge of a prepared photo, px (never enlarged)
export const JPEG_KALITE = 0.85;    // canvas.toBlob quality

// iPad Safari: one canvas at most 16 MP (same limit as the reader's canvases)
export const MAX_CANVAS_PIKSEL = MAX_PIXELS;

// Task 5.8c: the page is cropped out of the photo and straightened by default (method B,
// src/defter/kirp/). Below KIRP_MIN_GUVEN (dortgenPuani, 0–1) the whole photo is used instead.
export const KIRP_VARSAYILAN = true;
export const KIRP_MIN_GUVEN = 0.5;

// Task 6.2c: filter E ("Renk düzelt") on notebook photos by default; each thumbnail can turn it off.
// Its constants (E_GOLGE_GUC, E_KAZANC_MAX, E_KONTRAST) stay in filtre/filtreler.ts with the test page.
export const RENK_DUZELT_VARSAYILAN = true;

// Task 5.4: a photo's page in the PDF. A4 (pt); landscape photo → landscape A4, otherwise portrait.
// The photo is fitted inside the margin (aspect kept) and centred.
export const SAYFA_DUZENI = { genislik: 595.28, yukseklik: 841.89, kenar: 24 } as const;

// Task 5.10b: "Dosya ekle" takes files up to this size (MB = 1 000 000 bytes, as the iPad Files app
// shows it). Adding a PDF happens in memory with pdf-lib (≈ 3–4× the file), so 50 MB stays safe on iPad.
export const MAX_DOSYA_MB = 50;
