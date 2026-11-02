// In-tab exclusion only. Persistent recovery is guarded separately by the journal.
const kimlikler = new Set<string>();
const yollar = new Set<string>();
export const tasiKilitli = (id: string): boolean => kimlikler.has(id);
export const tasiYolKilitli = (yol: string): boolean => yollar.has(yol);
export function tasiKilitle(id: string, eski: string, yeni: string, kilit: boolean): void {
  if (kilit) { kimlikler.add(id); yollar.add(eski); yollar.add(yeni); }
  else { kimlikler.delete(id); yollar.delete(eski); yollar.delete(yeni); }
}
