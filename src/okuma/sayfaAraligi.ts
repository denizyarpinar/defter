// "sayfalar" field of a source → page numbers (1-based), see CLAUDE.md → Faz 3 → PDF.
// "3", "3-7", "1-2,5,9-11"; empty → the whole PDF. Invalid parts are skipped,
// parts outside the PDF are cut to its length. Order is kept, repeats are dropped.

export function parsePageRange(value: string | number | undefined | null, pageCount: number): number[] {
  const all = () => Array.from({ length: Math.max(0, pageCount) }, (_, i) => i + 1);
  if (value === undefined || value === null) return all();
  const text = String(value).trim();
  if (!text) return all();

  const out: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => { if (n >= 1 && n <= pageCount && !seen.has(n)) { seen.add(n); out.push(n); } };

  for (const raw of text.split(',')) {
    const part = raw.trim();
    const single = /^(\d+)$/.exec(part);
    if (single) { add(Number(single[1])); continue; }
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (!range) continue;   // letters, "1-2-3", "-3", empty part …
    const from = Number(range[1]), to = Number(range[2]);
    if (from < 1 || from > to) continue;   // "0-3", reversed "7-3"
    for (let n = from; n <= Math.min(to, pageCount); n++) add(n);
  }
  return out;
}
