// Task 6.5-2a: folding letters for search and name matching, the same in both languages.
// I, İ, ı and i are one letter (a Turkish and an English keyboard give either; "INFO" finds "info").

// One character → one character: Turkish lower case, then ı → i (I → ı → i, İ → i).
// A character whose lower case would be longer stays as it is, so indexes never move.
export function harfKatla(ch: string): string {
  const k = ch.toLocaleLowerCase('tr');
  const l = k === 'ı' ? 'i' : k;
  return [...l].length === 1 ? l : ch;
}

// Character by character: the result has the same length (UTF-16) as s. For text whose indexes count
// (search highlights, excerpts).
export function katlaUzunlukKoru(s: string): string {
  let out = '';
  for (const ch of s) {
    const k = harfKatla(ch);
    out += k.length === ch.length ? k : ch;
  }
  return out;
}

// For comparing names, where the length doesn't count: also the combining dot above (i̇) goes.
export const katla = (s: string): string =>
  katlaUzunlukKoru(s.normalize('NFC')).normalize('NFD').replace(/̇/g, '').normalize('NFC');
