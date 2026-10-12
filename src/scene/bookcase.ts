import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, Vector3, type Object3D, type Scene } from 'three';
import { add, boxAt, cylBetween } from './geometry';
import { M, own, std } from './materials';
import { potPlant } from './room';
import { PLATE_H, PLATE_W, canvas, noise, plateTex, tex } from './textures';
import { BASE, BD, BW, BX, P, SH, TOP, U, mulberry } from './units';

// Total bookcase height (plan units) for n shelves.
export const caseHeight = (n: number) => BASE + n * SH - 8 + TOP;
// Bottom of shelf idx (idx 0 = top shelf).
export const shelfBottom = (idx: number, n: number) => BASE + (n - 1 - idx) * SH;

export interface CaseShelf {
  name: string;
  decor: 'globe' | 'box' | null;
}

// Decorations go on empty shelves, from the bottom up: first a box with a plant, then a globe.
export function decorate(names: string[], isEmpty: (idx: number) => boolean): CaseShelf[] {
  const out: CaseShelf[] = names.map(name => ({ name, decor: null }));
  const order: ('box' | 'globe')[] = ['box', 'globe'];
  for (let i = names.length - 1; i >= 0 && order.length; i--) if (isEmpty(i)) out[i].decor = order.shift()!;
  return out;
}

// Builds the bookcase without books. Every mesh gets userData.case = true for picking.
export function buildCase(scene: Scene, shelves: CaseShelf[]): Group {
  const C = new Group(); scene.add(C);
  const n = shelves.length, h = caseHeight(n);
  const back = new Mesh(new BoxGeometry((BW - 28) * U, (h - TOP) * U, 0.02), M.walnutBack);
  back.position.copy(P(BX + BW / 2, 2, (h - TOP) / 2)); add(back, C);
  boxAt(BX, 0, 0, 14, BD, h - TOP, M.walnutV, C, 1);
  boxAt(BX + BW - 14, 0, 0, 14, BD, h - TOP, M.walnutV, C, 1);
  boxAt(BX + 10, 0, 0, BW - 20, BD, BASE, M.walnutH, C, 1);
  for (let i = 1; i < n; i++) boxAt(BX + 14, 2, BASE + i * SH - 8, BW - 28, BD - 2, 8, M.walnutH, C, .8);
  boxAt(BX - 7, -3, h - TOP, BW + 14, BD + 8, TOP, M.walnutH, C, 2);
  boxAt(BX - 3, -1, h - TOP - 4, BW + 6, BD + 4, 4, M.walnutH, C, .8);

  shelves.forEach((sh, idx) => {
    const z0 = shelfBottom(idx, n);
    // brass name plate
    const plate = plateTex(sh.name);
    const pm = own(std({ map: plate.map, bumpMap: plate.bumpMap, bumpScale: 1, roughness: .35, metalness: .55 }), plate.map, plate.bumpMap);
    const pl = new Mesh(new BoxGeometry(PLATE_W, PLATE_H, 0.008), [M.brass, M.brass, M.brass, M.brass, pm, M.brass]);
    pl.position.copy(P(BX + BW / 2, BD + 0.5, z0 - 3.5)); add(pl, C, false, true);
    if (sh.decor === 'globe') globe(C, BX + BW - 60, 36, z0);
    else if (sh.decor === 'box') {
      boxAt(BX + BW - 96, 12, z0, 66, 44, 28, M.walnutH, C, 2);
      boxAt(BX + BW - 92, 10, z0 + 10, 58, 2, 8, M.brass, C, .4);
      potPlant(C, BX + BW - 44, 36, z0 + 28, 0.4, 'small');
    }
  });

  C.traverse(o => { o.userData.case = true; });
  return C;
}

function globe(C: Object3D, x: number, y: number, z0: number): void {
  const g = new Group(); g.position.copy(P(x, y, z0)); C.add(g);
  const base = new Mesh(new CylinderGeometry(0.1, 0.12, 0.03, 32), M.walnutH); base.position.y = 0.015; add(base, g);
  cylBetween(new Vector3(0, 0.03, 0), new Vector3(0, 0.12, 0), 0.012, M.brass, g);
  const globeTex = tex(canvas(512, 256, (gg, w, h) => {
    gg.fillStyle = '#7fa1ad'; gg.fillRect(0, 0, w, h);
    const r = mulberry(14);
    gg.fillStyle = '#d8c79a';
    for (let i = 0; i < 14; i++) { gg.beginPath(); gg.ellipse(r() * w, h * (.2 + r() * .6), 20 + r() * 50, 12 + r() * 30, r() * 3, 0, 7); gg.fill(); }
    gg.strokeStyle = 'rgba(60,50,30,.25)';
    for (let x = 0; x < w; x += 32) { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x, h); gg.stroke(); }
    for (let y = 0; y < h; y += 32) { gg.beginPath(); gg.moveTo(0, y); gg.lineTo(w, y); gg.stroke(); }
    noise(gg, w, h, 14, 3);
  }));
  const sp = new Mesh(new SphereGeometry(0.2, 48, 32), own(std({ map: globeTex, roughness: .35 }), globeTex));
  sp.position.y = 0.34; sp.rotation.z = 0.41; add(sp, g);
  const arc = new Mesh(new TorusGeometry(0.225, 0.008, 8, 48, Math.PI), M.brass);
  arc.position.y = 0.34; arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.41); add(arc, g);
}
