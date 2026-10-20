// Desk contents only. All sizes are measured CSS pixels, including heading margins.
export interface MeasuredUnit {
  unit: number;
  heading: number;
  firstHeading: number;
  nextHeading: number;
  continuedHeading: number;
  rows: number[];
  gap: number;
}

export interface ContentsPart {
  unit: number;
  start: number;
  end: number; // exclusive; keep the original topic indices on every page
  continued: boolean;
}

export type ContentsPage = ContentsPart[];

export function paginateContents(
  units: readonly MeasuredUnit[],
  capacity: { first: number; next: number }
): ContentsPage[] {
  const pages: ContentsPage[] = [[]];
  let used = 0;
  const newPage = () => { pages.push([]); used = 0; };
  const limit = () => pages.length === 1 ? capacity.first : capacity.next;

  for (const u of units) {
    let start = 0;
    do {
      let page = pages.at(-1)!;
      const heading = () => page.length ? u.heading
        : start > 0 ? u.continuedHeading
        : pages.length === 1 ? u.firstHeading : u.nextHeading;
      // A heading and its first topic travel together. Empty units still keep their heading.
      if (page.length && used + heading() + (u.rows[start] ?? 0) > limit()) {
        newPage();
        page = pages.at(-1)!;
      }
      used += heading();
      let end = start;
      while (end < u.rows.length) {
        const height = u.rows[end] + (end > start ? u.gap : 0);
        // Even when the first row is taller than the whole page, consume it once.
        if (end > start && used + height > limit()) break;
        used += height;
        end++;
      }
      page.push({ unit: u.unit, start, end, continued: start > 0 });
      start = end;
      if (start < u.rows.length) newPage();
    } while (start < u.rows.length);
  }
  return pages;
}
