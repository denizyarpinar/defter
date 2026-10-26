import { anahtarMi, dil, t } from './index';

// Task 6.5-1: the fixed texts in index.html, filled once at start (index.html keeps the Turkish text for no-JS).
// [data-t] → text, [data-t-title] → title, [data-t-aria] → aria-label, [data-t-ph] → placeholder.
// A button with an icon carries data-t on its inner <span>, so the svg stays. Only dictionary keys are filled:
// data-t is also the contents pages' topic number (reader.ts, Okuyucu.ts).
// [data-yasal="privacy|terms"]: the legal page's part in the chosen language (privacy.html#en|#tr).

export type YasalSayfa = 'privacy' | 'terms';

export const yasalHref = (s: YasalSayfa): string => `/${s}.html#${dil()}`;

const OZELLIKLER: [string, (e: HTMLElement, v: string) => void][] = [
  ['t', (e, v) => { e.textContent = v; }],
  ['tTitle', (e, v) => { e.title = v; }],
  ['tAria', (e, v) => { e.setAttribute('aria-label', v); }],
  ['tPh', (e, v) => { e.setAttribute('placeholder', v); }],
];

export function htmlDoldur(kok: ParentNode = document): void {
  for (const [ad, yaz] of OZELLIKLER) {
    const secici = `[data-${ad.replace(/[A-Z]/g, h => '-' + h.toLowerCase())}]`;
    kok.querySelectorAll<HTMLElement>(secici).forEach(e => { const k = e.dataset[ad]; if (anahtarMi(k)) yaz(e, t(k)); });
  }
  kok.querySelectorAll<HTMLAnchorElement>('a[data-yasal]').forEach(a => { a.href = yasalHref(a.dataset.yasal as YasalSayfa); });
  if (kok === document) {
    document.documentElement.lang = dil();
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('genel.aciklama'));
  }
}
