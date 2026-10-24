// Literal transcription comparison. No spelling correction or language inference.
export function words(text: string): string[] {
  return text.normalize('NFC').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}
export function score(reference: string, actual: string): { total: number; correct: number; wrong: number; missing: number; extra: number; unknown?: number } {
  // An explicitly uncertain reference word consumes at most one output word and
  // never counts as correct/wrong/missing. It cannot hide an arbitrary output span.
  const a = (reference.normalize('NFC').match(/\[belirsiz\]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map(w => w === '[belirsiz]' ? null : w), b = words(actual);
  const unknown = a.filter(w => w === null).length;
  type Cell = { cost: number; correct: number; wrong: number; missing: number; extra: number };
  let row: Cell[] = b.map((_, j) => ({ cost: j + 1, correct: 0, wrong: 0, missing: 0, extra: j + 1 }));
  row.unshift({ cost: 0, correct: 0, wrong: 0, missing: 0, extra: 0 });
  for (let i = 0; i < a.length; i++) {
    const known = a.slice(0, i + 1).filter(w => w !== null).length;
    const next: Cell[] = [{ cost: known, correct: 0, wrong: 0, missing: known, extra: 0 }];
    for (let j = 0; j < b.length; j++) {
      const uncertain = a[i] === null, same = a[i] === b[j]; const d = row[j], up = row[j + 1], left = next[j];
      const candidates: Cell[] = [
        { ...d, cost: d.cost + (same || uncertain ? 0 : 1), correct: d.correct + +same, wrong: d.wrong + +( !same && !uncertain) },
        { ...up, cost: up.cost + +!uncertain, missing: up.missing + +!uncertain },
        { ...left, cost: left.cost + 1, extra: left.extra + 1 }
      ];
      next.push(candidates.sort((x, y) => x.cost - y.cost || y.correct - x.correct)[0]);
    }
    row = next;
  }
  const { cost: _, ...result } = row[b.length];
  return { total: a.length - unknown, ...(unknown ? { unknown } : {}), ...result };
}

// For incomplete handwriting references: count only verified target words, in order.
// This is target-word recall, NOT whole-page accuracy or word error rate. Unknown
// spans are omitted from the reference; spelling is never corrected.
export function scoreKnownTargets(reference: string, actual: string): { total: number; found: number; missed: number; metric: string } {
  const a = words(reference.toLocaleLowerCase('tr')), b = words(actual.toLocaleLowerCase('tr'));
  let row = Array<number>(b.length + 1).fill(0);
  for (const target of a) {
    const next = [0];
    for (let j = 0; j < b.length; j++) next.push(target === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
    row = next;
  }
  return { total: a.length, found: row[b.length], missed: a.length - row[b.length], metric: 'Yalnız doğrulanmış hedef kelimeler; tüm sayfa doğruluğu değil' };
}
