import { FLIP_MS, KITAP_KAGIT_PAYI, fitPage, isSingle, keepRange, pageStep, slotSize, spreadStart } from './kitapDuzen';

// Reader, book mode (task 3.3): two pages side by side with a spine shadow, one page on a portrait screen.
// Pages turn with CSS 3D (prototype flipTo). Every page is one "sheet" element that lives in one
// place at a time (a slot or a face of the turning leaf), so nothing is drawn twice.
// Sheets of the visible pages ±2 exist (drawn, maybe not on screen); the others are released.

export interface BookHost {
  count(): number;
  ratio(i: number): number;
  kind(i: number): string;
  mount(i: number, box: HTMLElement, w: number, h: number): void;   // draw page i into box (w × h CSS px)
  release(i: number): void;
  changed(): void;                                                  // idx moved
}

interface Sheet { el: HTMLElement; page: HTMLElement }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function div(cls: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  parent?.append(e);
  return e;
}

export class BookView {
  idx = 0;
  single = false;
  private busy = false;
  private timer: number | undefined;
  private slotW = 0;
  private slotH = 0;
  private sheets = new Map<number, Sheet>();
  private left: HTMLElement | null = null;
  private right: HTMLElement | null = null;
  // task 4.5b: sheets on the turning leaf have their pen layer hidden until two frames after the
  // turn (Safari keeps a composited layer one frame too long after it moves)
  private hidden = new Set<HTMLElement>();
  private revealGen = 0;
  private alan: { w: number; h: number } | null = null;   // task 6.S-2: the area's size at the last layout

  constructor(private area: HTMLElement, private spread: HTMLElement, private host: BookHost) {}

  // Show the book from page `start` (the spread that contains it).
  show(start: number, color: string): void {
    this.spread.style.setProperty('--bookc', color);
    this.idx = start;
    this.layout();
  }

  // The area's size the book was laid out for (null: not laid out).
  get olcu(): { w: number; h: number } | null { return this.alan; }

  // Measure again (first show, rotation): new slot size, one or two pages, everything drawn again.
  layout(): void {
    this.stop();
    this.releaseSheets();
    this.alan = { w: this.area.clientWidth, h: this.area.clientHeight };
    this.single = isSingle(this.alan.w, this.alan.h);
    const s = slotSize(this.alan.w, this.alan.h, this.single);
    this.slotW = s.w; this.slotH = s.h;
    this.spread.style.width = (this.single ? s.w : s.w * 2) + 'px';
    this.spread.style.height = s.h + 'px';
    this.spread.classList.toggle('single', this.single);
    this.left = this.slot(0);
    this.right = this.single ? null : this.slot(s.w);
    this.spread.replaceChildren(...[this.left, this.right].filter(Boolean) as HTMLElement[]);
    const n = this.host.count();
    this.idx = spreadStart(Math.max(0, Math.min(this.idx, n - 1)), this.single);
    this.ensure();
    this.place();
    this.host.changed();
  }

  clear(): void {
    this.stop();
    this.releaseSheets();
    this.spread.replaceChildren();
    this.left = this.right = null;
    this.idx = 0;
    this.alan = null;
  }

  // The image's real shape is known now: fit its box again.
  refit(i: number): void {
    const s = this.sheets.get(i);
    if (s) this.fit(i, s.page);
  }

  // Jump to the spread of page i without turning (page slider, contents; task 3.4).
  goTo(i: number): void {
    if (!this.left) return;
    this.stop();
    this.spread.querySelectorAll('.o-leaf, .o-turn').forEach(e => e.remove());
    const n = this.host.count();
    this.idx = spreadStart(Math.max(0, Math.min(i, n - 1)), this.single);
    this.ensure();
    this.place();
    this.host.changed();
  }

  // Turn one spread forward (1) or back (−1).
  flip(dir: 1 | -1): void {
    if (this.busy || !this.left) return;
    const n = this.host.count();
    const cur = this.idx, target = cur + dir * pageStep(this.single);
    if (target < 0 || target > n - 1) return;
    this.idx = target;
    this.ensure();
    this.host.changed();
    if (reducedMotion()) { this.place(); return; }
    this.busy = true;
    this.revealGen++;   // a reveal still waiting from the last turn waits for this one

    if (this.single) {
      // the old page swings away on top of the new one (prototype single-turn)
      const turn = div('o-slot o-turn', this.spread);
      turn.style.width = this.slotW + 'px'; turn.style.left = '0';
      turn.append(this.hide(this.sheetOrEnd(cur)));
      this.left.replaceChildren(this.sheetOrEnd(target));
      requestAnimationFrame(() => turn.classList.add(dir > 0 ? 'out-l' : 'out-r'));
      this.timer = window.setTimeout(() => { turn.remove(); this.busy = false; this.reveal(); }, FLIP_MS + 20);
      return;
    }

    // two pages: a leaf turns over the spine; its front is the page leaving, its back the page arriving
    const leaf = div(`o-leaf ${dir > 0 ? 'fw' : 'bw'}`, this.spread);
    leaf.style.width = this.slotW + 'px';
    leaf.style.left = (dir > 0 ? this.slotW : 0) + 'px';
    div('o-lf front', leaf).append(this.hide(this.sheetOrEnd(dir > 0 ? cur + 1 : cur)));
    div('o-lf back', leaf).append(this.hide(this.sheetOrEnd(dir > 0 ? target : target + 1)));
    if (dir > 0) this.right!.replaceChildren(this.sheetOrEnd(target + 1));
    else this.left.replaceChildren(this.sheetOrEnd(target));
    requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('go')));
    this.timer = window.setTimeout(() => {
      this.place();
      leaf.remove();
      this.busy = false;
      this.reveal();
    }, FLIP_MS + 20);
  }

  // ---- inside ----

  private stop(): void {
    clearTimeout(this.timer);
    this.busy = false;
    if (this.hidden.size) this.reveal();
  }

  private hide(el: HTMLElement): HTMLElement {
    el.classList.add('turning');
    this.hidden.add(el);
    return el;
  }

  // Show the hidden pen layers again, two frames after the pages are in their new places.
  private reveal(): void {
    const g = ++this.revealGen;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (g !== this.revealGen) return;
      for (const el of this.hidden) el.classList.remove('turning');
      this.hidden.clear();
    }));
  }

  private slot(left: number): HTMLElement {
    const s = div('o-slot');
    s.style.width = this.slotW + 'px';
    s.style.left = left + 'px';
    return s;
  }

  // The sheets of the current spread into the slots.
  private place(): void {
    this.left?.replaceChildren(this.sheetOrEnd(this.idx));
    this.right?.replaceChildren(this.sheetOrEnd(this.idx + 1));
  }

  // Sheets for visible ±2; the ones further away are released (their canvas memory freed).
  private ensure(): void {
    const [a, b] = keepRange(this.idx, this.single, this.host.count());
    for (const [i, s] of this.sheets) {
      if (i < a || i > b) { this.host.release(i); s.el.remove(); this.sheets.delete(i); }
    }
    for (let i = a; i <= b; i++) if (!this.sheets.has(i)) this.make(i);
  }

  private make(i: number): void {
    const el = div(`o-sheet ${this.single ? '' : i % 2 ? 'rightp' : 'leftp'}`);
    const page = div('o-page', el);
    page.dataset.kind = this.host.kind(i);
    const f = this.fit(i, page);
    this.sheets.set(i, { el, page });
    this.host.mount(i, page, f.w, f.h);
  }

  private fit(i: number, page: HTMLElement): { w: number; h: number } {
    const f = fitPage(this.host.ratio(i), this.slotW, this.slotH, KITAP_KAGIT_PAYI);   // task 6.S-2b: paper around
    page.style.left = f.x + 'px'; page.style.top = f.y + 'px';
    page.style.width = f.w + 'px'; page.style.height = f.h + 'px';
    return f;
  }

  private sheetOrEnd(i: number): HTMLElement {
    const s = this.sheets.get(i);
    if (s) return s.el;
    const end = div(`o-sheet o-end ${i % 2 ? 'rightp' : 'leftp'}`);
    if (i >= this.host.count()) div('o-endtext', end).textContent = 'Son sayfa';
    return end;
  }

  private releaseSheets(): void {
    for (const [i, s] of this.sheets) { this.host.release(i); s.el.remove(); }
    this.sheets.clear();
  }
}
