// Pen mode (task 4.6): which input draws and which one moves / zooms the page. No DOM here, so it can be tested.
// - Apple Pencil ('pen') always draws. Once a pen was seen (remembered by the host), a finger never draws
//   again (palm rejection): fingers scroll and zoom; while the pen draws, they are ignored altogether.
// - No pen seen yet: mouse and one finger draw. A second finger always means zoom / scroll and
//   cancels the stroke being drawn.

export type Route = 'ciz' | 'gezin' | 'yoksay';

export const AVUC_ILK_PX = 100;
export const AVUC_MAKS_PX = 120;
export const KALEM_SONRASI_MS = 300;

export interface Decision {
  route: Route;
  cancel: boolean;   // the stroke being drawn must be dropped
}

export class InputRouter {
  private touches = new Set<number>();
  private ignored = new Set<number>();
  private pens = new Set<number>();
  private lastPenUp = -Infinity;

  constructor(public penSeen = false, private rememberPen: () => void = () => {}) {}

  penCooling(time: number): boolean { return time - this.lastPenUp < KALEM_SONRASI_MS; }

  ignoreTouch(width: number, time: number, initial: boolean): boolean {
    return this.penSeen && (width >= (initial ? AVUC_ILK_PX : AVUC_MAKS_PX)
      || (initial && this.penCooling(time)));
  }

  move(id: number, width: number): Route | null {
    if (!this.touches.has(id)) return null;
    if (this.penSeen && width >= AVUC_MAKS_PX) this.ignored.add(id);
    return this.ignored.has(id) ? 'yoksay' : this.penSeen ? 'gezin' : null;
  }

  ignores(id: number): boolean { return this.ignored.has(id); }

  // penDrawing: a pen stroke is going on (a touch now is the hand resting on the screen)
  down(type: string, id: number, button = 0, penDrawing = false, width = 0, time = Infinity, active = true): Decision {
    if (type === 'pen') {
      if (!this.penSeen) this.rememberPen();
      this.penSeen = true;
      this.pens.add(id);
      return { route: 'ciz', cancel: false };
    }
    if (type === 'touch') {
      this.touches.add(id);
      this.ignored.delete(id);
      if (active && (penDrawing || this.ignoreTouch(width, time, true))) {
        this.ignored.add(id);
        return { route: 'yoksay', cancel: false };
      }
      if (this.penSeen) return { route: penDrawing ? 'yoksay' : 'gezin', cancel: false };
      if (this.touches.size >= 2) return { route: 'gezin', cancel: true };
      return { route: 'ciz', cancel: false };
    }
    if (type === 'mouse') return { route: button === 0 ? 'ciz' : 'yoksay', cancel: false };
    return { route: 'yoksay', cancel: false };
  }

  up(id: number, time?: number): void {
    if (this.pens.delete(id) && time != null) this.lastPenUp = time;
    this.touches.delete(id);
    this.ignored.delete(id);
  }

  get touchCount(): number {
    return this.touches.size;
  }

  clearTouches(): void {
    this.touches.clear();
    this.ignored.clear();
  }
}
