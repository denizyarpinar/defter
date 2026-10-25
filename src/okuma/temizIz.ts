// Task 6.4e-2: the clean view's last measurement for the ?olcum=1 box (ui/olcum.ts), e.g.
// "açılış → temiz 412 ms · eşleşme 380 ms · 3/8". Kept apart so the box does not load the reader.

let son = '–';

export const temizIzi = (): string => son;

export function temizIzYaz(s: string): void { son = s; }
