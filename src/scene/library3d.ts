import { Euler, Plane, Quaternion, Vector3, type Group, type Ray, type Raycaster, type Scene } from 'three';
import { moveBook, newArrivals, shelfBooks, shelfOf } from '../model/library';
import type { Book, Library } from '../model/types';
import { bookScale, buildCase, caseHeight, decorate, shelfBottom, shelfPitch } from './bookcase';
import { BOOK_DEPTH, bookDims, makeBook } from './books';
import { requestRender } from './frame';
import { disposeGroup } from './materials';
import { tween } from './tween';
import { BASE, BD, BW, BX, DESK_SPOT, P, PILE_X, PILE_Y, U } from './units';

export interface LibraryData {
  library: Library;
  books: Map<string, Book>;
}

interface Home {
  pos: Vector3;
  quat: Quaternion;
  shelf: number;        // -1 = "Yeni gelenler" pile
  x: number;            // left edge (plan units), for ordering on a shelf
  t: number;            // thickness (plan units, scaled)
  s: number;            // book scale: < 1 on close-set shelves (6 shelves), 1 in the pile
}

// Dragged books move on this plane, just in front of the shelves.
const DRAG_Z = (BD - 31) * U + 0.35;

function animTo(g: Group, toPos: Vector3, toQ: Quaternion, dur: number, arc = 0, done?: () => void, toS = g.scale.x): void {
  const fp = g.position.clone(), fq = g.quaternion.clone(), fs = g.scale.x;
  tween(dur, k => {
    g.position.lerpVectors(fp, toPos, k);
    if (arc) g.position.y += Math.sin(Math.PI * k) * arc;
    g.quaternion.slerpQuaternions(fq, toQ, k);
    g.scale.setScalar(fs + (toS - fs) * k);
  }, done, 'b:' + g.userData.bookId);
}

// Stable small random number per book (pile jitter).
function jitter(id: string, salt: number): number {
  let h = salt;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000 - .5;
}

export class Library3D {
  caseGroup: Group | null = null;
  readonly groups = new Map<string, Group>();
  private home = new Map<string, Home>();
  private away = new Set<string>();
  private decorKey = '';
  private drag: { id: string; off: Vector3; plane: Plane } | null = null;
  private readonly scene: Scene;
  private readonly data: LibraryData;

  constructor(scene: Scene, data: LibraryData) {
    this.scene = scene;
    this.data = data;
  }

  get hasPile(): boolean {
    return newArrivals(this.data.library, this.data.books).length > 0;
  }

  // ---- building ----

  buildCase(): void {
    if (this.caseGroup) disposeGroup(this.caseGroup);
    const lib = this.data.library;
    const shelves = decorate(lib.raflar.map(s => s.ad), i => shelfBooks(lib, this.data.books, i).length === 0);
    this.decorKey = shelves.map(s => s.decor ?? '-').join();
    this.caseGroup = buildCase(this.scene, shelves);
    requestRender();
  }

  buildBooks(): void {
    for (const [id, g] of this.groups) { disposeGroup(g); this.groups.delete(id); }
    this.away.clear();
    for (const id of this.data.books.keys()) if (!this.groups.has(id)) this.addBook(id);
    this.layout(true);
  }

  private addBook(id: string): Group {
    const g = makeBook(this.data.books.get(id)!);
    this.scene.add(g);
    this.groups.set(id, g);
    return g;
  }

  // Rebuild one book (cover colour/style changed, or dust after opening), keeping its place.
  refreshBook(id: string): void {
    const old = this.groups.get(id); if (!old) return;
    const p = old.position.clone(), q = old.quaternion.clone(), s = old.scale.x;
    disposeGroup(old);
    const g = this.addBook(id);
    g.position.copy(p); g.quaternion.copy(q); g.scale.setScalar(s);
    requestRender();
  }

  // Shelf names / count changed.
  rebuildAll(): void {
    this.buildCase();
    this.layout(true);
  }

  // ---- layout ----

  layout(instant = false): void {
    const { library, books } = this.data;
    this.home.clear();
    const s = bookScale(library.raflar.length);
    library.raflar.forEach((_, idx) => {
      const z = shelfBottom(idx, library.raflar.length);
      let x = BX + 14 + 9;
      for (const id of shelfBooks(library, books, idx)) {
        const d = bookDims(books.get(id)!), t = d.t * s, h = d.h * s;
        this.home.set(id, { pos: P(x + t / 2, BD - 4 - BOOK_DEPTH / 2 * s, z + h / 2 + 0.2), quat: new Quaternion(), shelf: idx, x, t, s });
        x += t + 1.2;
      }
    });
    // pile: books lie flat, thickness up, spine to the front
    let zTop = 0;
    for (const id of newArrivals(library, books)) {
      const { t } = bookDims(books.get(id)!);
      const pos = P(PILE_X + jitter(id, 1) * 8, PILE_Y + jitter(id, 2) * 6, zTop + t / 2);
      const quat = new Quaternion().setFromEuler(new Euler(0, jitter(id, 3) * .24, Math.PI / 2, 'YXZ'));
      this.home.set(id, { pos, quat, shelf: -1, x: 0, t, s: 1 });
      zTop += t;
    }
    for (const [id, hm] of this.home) {
      const g = this.groups.get(id);
      if (!g || this.away.has(id) || this.drag?.id === id) continue;
      if (instant) { g.position.copy(hm.pos); g.quaternion.copy(hm.quat); g.scale.setScalar(hm.s); }
      else animTo(g, hm.pos, hm.quat, 450, 0, undefined, hm.s);
    }
    // decorations follow which shelves are empty
    const lib = this.data.library;
    const key = decorate(lib.raflar.map(s => s.ad), i => shelfBooks(lib, books, i).length === 0).map(s => s.decor ?? '-').join();
    if (key !== this.decorKey) this.buildCase();
    requestRender();
  }

  // ---- picking ----

  pick(ray: Raycaster): { book?: string; case?: boolean } | null {
    const objs = [...(this.caseGroup ? [this.caseGroup] : []), ...[...this.groups].filter(([id]) => !this.away.has(id)).map(([, g]) => g)];
    for (const h of ray.intersectObjects(objs, true)) {
      if (h.object.userData.bookId) return { book: h.object.userData.bookId as string };
      if (h.object.userData.case) return { case: true };
    }
    return null;
  }

  // ---- drag & drop (shelf view) ----

  startDrag(id: string, r: Ray): void {
    const g = this.groups.get(id); if (!g) return;
    const plane = new Plane(new Vector3(0, 0, 1), -DRAG_Z);
    const pt = new Vector3();
    if (!r.intersectPlane(plane, pt)) return;
    // stop its running animation and stand it up (pile books lie flat)
    const fq = g.quaternion.clone(), upright = new Quaternion();
    tween(150, k => g.quaternion.slerpQuaternions(fq, upright, k), undefined, 'b:' + id);
    this.drag = { id, plane, off: new Vector3(g.position.x - pt.x, g.position.y - pt.y, 0) };
  }

  moveDrag(r: Ray): void {
    if (!this.drag) return;
    const pt = new Vector3();
    if (!r.intersectPlane(this.drag.plane, pt)) return;
    this.groups.get(this.drag.id)!.position.set(pt.x + this.drag.off.x, Math.max(0.3, pt.y + this.drag.off.y), DRAG_Z);
    requestRender();
  }

  cancelDrag(): void {
    this.drag = null;
    this.layout();
  }

  // Drop: null = dropped outside (nothing changed); otherwise where it went.
  endDrag(): { title: string; shelf: string; changedShelf: boolean } | null {
    if (!this.drag) return null;
    const id = this.drag.id; this.drag = null;
    const { library, books } = this.data;
    const g = this.groups.get(id)!;
    const n = library.raflar.length;
    const xc = g.position.x / U, zc = g.position.y / U;
    const inside = xc > BX - 20 && xc < BX + BW + 20 && zc > BASE - 20 && zc < caseHeight(n) + 10;
    if (!inside) { this.layout(); return null; }   // dropped outside the bookcase: back to where it was
    const fromShelf = shelfOf(library, id);
    const target = n - 1 - Math.max(0, Math.min(n - 1, Math.floor((zc - BASE) / shelfPitch(n))));
    let at = 0;
    for (const other of shelfBooks(library, books, target)) {
      const hm = this.home.get(other);
      if (other !== id && hm && hm.x + hm.t / 2 < xc) at++;
    }
    moveBook(library, books, id, target, at);
    this.layout();
    return { title: books.get(id)!.baslik, shelf: library.raflar[target].ad, changedShelf: fromShelf !== target };
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  // ---- open / close: the book flies to the desk and back ----

  flyToDesk(id: string, onDesk: () => void, startDeskView: () => void): void {
    const g = this.groups.get(id), hm = this.home.get(id); if (!g || !hm) return;
    this.away.add(id);
    const out = hm.pos.clone().add(new Vector3(0, 0.03, 0.55));
    animTo(g, out, hm.quat, 380, 0, () => {
      const { t } = g.userData.dims as { t: number };
      const q = new Quaternion().setFromEuler(new Euler(0, 0.1, Math.PI / 2, 'YXZ'));
      startDeskView();
      animTo(g, DESK_SPOT.clone().add(new Vector3(0, t * U / 2 + 0.002, 0)), q, 1150, 0.5, undefined, 1);   // full size on the desk
      setTimeout(onDesk, 1180);
    });
  }

  flyHome(id: string, done: () => void): void {
    const g = this.groups.get(id); if (!g) { done(); return; }
    this.layout();   // fresh home (the shelves may have changed meanwhile)
    const hm = this.home.get(id)!;
    const out = hm.pos.clone().add(new Vector3(0, 0.03, 0.55));
    animTo(g, out, hm.quat, 1100, 0.5, () => {
      animTo(g, hm.pos, hm.quat, 380, 0, () => { this.away.delete(id); done(); });
    }, hm.s);   // back to its shelf size on the way
  }
}
