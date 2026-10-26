// Paper lines, one place for both papers (task 6.S-4): the clean handwriting canvas (temizSayfa.ts) and the blank
// note pages in the PDF (defter/bosSayfa.ts). Only a little darker than the paper, so they never compete with the ink.

export const KAGIT_CIZGI_KOYULUK = 16;   // grid / rule: paper minus this (per channel, 0–255)
export const KAGIT_CIZGI_PT = 0.35;      // the PDF's vector lines (≈ 1 device px on the iPad at page width)
