// Pen mode (task 4.6): which input draws and which one moves / zooms the page. No DOM here, so it can be tested.
// - Apple Pencil ('pen') always draws. Once a pen was seen (this page load), a finger never draws
//   again (palm rejection): fingers scroll and zoom; while the pen draws, they are ignored altogether.
// - No pen seen yet: mouse and one finger draw. A second finger always means zoom / scroll and
//   cancels the stroke being drawn.

export type Route = 'ciz' | 'gezin' | 'yoksay';

export interface Decision {
  route: Route;
  cancel: boolean;   // the stroke being drawn must be dropped
}

export class InputRouter {
  penSeen = false;
  private touches = new Set<number>();

  // penDrawing: a pen stroke is going on (a touch now is the hand resting on the screen)
  down(type: string, id: number, button = 0, penDrawing = false): Decision {
    if (type === 'pen') {
      this.penSeen = true;
      return { route: 'ciz', cancel: false };
    }
    if (type === 'touch') {
      this.touches.add(id);
      if (this.penSeen) return { route: penDrawing ? 'yoksay' : 'gezin', cancel: false };
      if (this.touches.size >= 2) return { route: 'gezin', cancel: true };
      return { route: 'ciz', cancel: false };
    }
    if (type === 'mouse') return { route: button === 0 ? 'ciz' : 'yoksay', cancel: false };
    return { route: 'yoksay', cancel: false };
  }

  up(id: number): void {
    this.touches.delete(id);
  }

  get touchCount(): number {
    return this.touches.size;
  }
}
