import { paginateContents, type ContentsPage, type MeasuredUnit } from './icindekilerSayfalama';

const number = (value: string) => Number.parseFloat(value) || 0;
const height = (element: Element) => element.getBoundingClientRect().height;

// Both probes use the very same markup, width and CSS as the displayed pages.
// They must be attached (visibility:hidden, never display:none), after document.fonts.ready.
export function measureContents(first: HTMLElement, next: HTMLElement): ContentsPage[] {
  const headings = [...first.querySelectorAll<HTMLElement>('h3.unit')];
  if (!headings.length) return [[]];
  const continued = [...next.querySelectorAll<HTMLElement>('h3.unit')];
  const firstMargin = number(getComputedStyle(headings[0]).marginTop);
  const nextMargin = number(getComputedStyle(continued[0]).marginTop);

  // In the real page a non-first unit follows an ol, so its top margin may differ.
  const inner = first.querySelector<HTMLElement>('.in')!;
  const spacer = document.createElement('ol');
  const probe = headings[0].cloneNode(true) as HTMLElement;
  inner.append(spacer, probe);
  const normalMargin = number(getComputedStyle(probe).marginTop);
  spacer.remove();
  probe.remove();

  const units: MeasuredUnit[] = headings.map((heading, unit) => {
    const list = heading.nextElementSibling!;
    const bottomMargin = number(getComputedStyle(heading).marginBottom);
    return {
      unit,
      heading: height(heading) + bottomMargin + normalMargin,
      firstHeading: height(heading) + bottomMargin + firstMargin,
      nextHeading: height(heading) + bottomMargin + nextMargin,
      continuedHeading: height(continued[unit]) + bottomMargin + nextMargin,
      rows: [...list.children].map(height),
      gap: number(getComputedStyle(list).rowGap)
    };
  });

  const capacity = (page: HTMLElement) => {
    const inside = page.querySelector<HTMLElement>('.in')!;
    const heading = page.querySelector<HTMLElement>('h3.unit')!;
    const top = heading.getBoundingClientRect().top - number(getComputedStyle(heading).marginTop);
    const bottom = Math.min(
      inside.getBoundingClientRect().bottom - number(getComputedStyle(inside).paddingBottom),
      page.querySelector('.folio')!.getBoundingClientRect().top - 1
    );
    // Reserve the footer even when the list already overflows. Its auto margin is not content.
    const legend = page.querySelector('.legend');
    return bottom - top - (legend ? height(legend) : 0) - 0.5; // fractional layout rounding
  };
  return paginateContents(units, { first: capacity(first), next: capacity(next) });
}
