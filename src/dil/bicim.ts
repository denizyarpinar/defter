import { dil } from './index';

// Task 6.5-1: numbers, sizes and dates in the chosen language (Intl). Used from the next steps on.

const yerel = () => dil() === 'tr' ? 'tr-TR' : 'en-GB';

export const sayi = (n: number, basamak = 0): string =>
  new Intl.NumberFormat(yerel(), { maximumFractionDigits: basamak }).format(n);

// bytes → "850 KB" / "3,4 MB" (tr) / "3.4 MB" (en)
export function boyut(bayt: number): string {
  if (bayt < 1024 * 1024) return `${sayi(Math.max(1, Math.round(bayt / 1024)))} KB`;
  return `${sayi(bayt / (1024 * 1024), 1)} MB`;
}

export const tarih = (d: Date): string =>
  new Intl.DateTimeFormat(yerel(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d);

// whole days ago: "bugün" / "dün" / "3 gün önce" (tr), "today" / "yesterday" / "3 days ago" (en)
export const gunOnce = (gun: number): string =>
  new Intl.RelativeTimeFormat(yerel(), { numeric: 'auto' }).format(-Math.max(0, Math.round(gun)), 'day');
