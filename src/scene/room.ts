import { BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Path, PlaneGeometry, Shape, SphereGeometry, TorusGeometry, Vector3, type Object3D, type Scene } from 'three';
import { add, boxAt, cylBetween, leafGeo } from './geometry';
import { M, std } from './materials';
import { abstractCanvas, artCanvas, canvas, clothNoise, createSky, tex, type Sky } from './textures';
import { D, H, P, U, W, mulberry } from './units';

export interface RoomRefs {
  group: Group;          // everything below; exported for Blender (?export=oda)
  contact: Mesh<PlaneGeometry, MeshBasicMaterial> | null;   // fake contact shadow (old room only)
  sky: Sky;
  hourHand: Group;
  minuteHand: Group;
  lampHead: Vector3;
  lightmapBlend?: (mix: number, dim: number) => void;   // baked room: evening lightmap share, overall brightness
  deskShadow?: (on: boolean, w?: number, d?: number) => void;   // baked room: soft shadow under the book on the desk (w × d plan units)
}

// Wall clock centre (back wall).
export const CLOCK_POS = P(160, 2.5, 440);

// Hour and minute hands (pivot groups) on a clock group; setClock() turns them.
export function addClockHands(cg: Object3D): { hourHand: Group; minuteHand: Group } {
  const hand = (len: number, wd: number) => {
    const pg = new Group();
    const m = new Mesh(new BoxGeometry(wd, len, 0.006), M.black); m.position.y = len / 2 - 0.02; pg.add(m);
    pg.position.z = 0.032; cg.add(pg);
    return pg;
  };
  return { hourHand: hand(0.16, 0.018), minuteHand: hand(0.24, 0.011) };
}

export function buildRoom(scene: Scene): RoomRefs {
  const R = new Group(); R.name = 'Oda'; scene.add(R);
  // "canli" = stays live in the app (own texture/light), not baked in Blender
  const live = (o: Object3D, name: string) => { o.name = name; o.userData.defter = 'canli'; };

  // soft contact shadow under the diorama
  const contact = new Mesh(new PlaneGeometry(14, 12), new MeshBasicMaterial({
    map: tex(canvas(256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(40,25,10,.42)'); gr.addColorStop(1, 'rgba(40,25,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    })),
    transparent: true, depthWrite: false
  }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(5.4, -0.26, 4.4); contact.name = 'TemasGolgesi'; R.add(contact);

  // floor slab + planks
  boxAt(0, 0, -24, W, D, 23.6, M.slab, R);
  const fl = new Mesh(new PlaneGeometry(W * U, D * U), M.floor);
  fl.rotation.x = -Math.PI / 2; fl.position.set(W * U / 2, 0, D * U / 2); add(fl, R, false, true);

  // back wall with a real window opening (so sunlight falls through it)
  const ws = new Shape();
  ws.moveTo(-0.2, -0.24); ws.lineTo(W * U, -0.24); ws.lineTo(W * U, H * U); ws.lineTo(-0.2, H * U); ws.lineTo(-0.2, -0.24);
  const hole = new Path();
  hole.moveTo(7.35, 1.9); hole.lineTo(9.55, 1.9); hole.lineTo(9.55, 4.8); hole.lineTo(7.35, 4.8); hole.lineTo(7.35, 1.9);
  ws.holes.push(hole);
  const bw = new Mesh(new ExtrudeGeometry(ws, { depth: 0.2, bevelEnabled: false }), M.wall);
  bw.position.z = -0.2; add(bw, R);
  // left wall
  boxAt(-20, -20, -24, 20, D + 20, H + 24, M.wall, R);
  // skirting boards
  boxAt(0, 0, 0, W, 1.6, 9, M.white, R); boxAt(0, 0, 0, 1.6, D, 9, M.white, R);

  // window frame, mullions, glass, sill, sky
  const fz = -10, ft = 7;
  boxAt(735, fz - 4, 190, 220, 8, ft, M.frame, R); boxAt(735, fz - 4, 480 - ft, 220, 8, ft, M.frame, R);
  boxAt(735, fz - 4, 190, ft, 8, 290, M.frame, R); boxAt(955 - ft, fz - 4, 190, ft, 8, 290, M.frame, R);
  boxAt(735 + 220 / 3 - 2, fz - 3, 190, 4, 6, 290, M.frame, R); boxAt(735 + 440 / 3 - 2, fz - 3, 190, 4, 6, 290, M.frame, R);
  boxAt(735, fz - 3, 330, 220, 6, 4, M.frame, R);
  const gl = new Mesh(new PlaneGeometry(2.2, 2.9), M.glass); gl.name = 'Cam'; gl.position.set(8.45, 3.35, -0.1); R.add(gl);
  boxAt(725, -2, 182, 240, 16, 8, M.frame, R, 1.5);
  const sky = createSky();
  const skyMesh = new Mesh(new PlaneGeometry(2.65, 3.4), new MeshBasicMaterial({ map: sky.texture, toneMapped: false }));
  skyMesh.position.set(8.33, 3.35, -0.3); live(skyMesh, 'Gokyuzu'); R.add(skyMesh);

  // wall clock (real time)
  const cg = new Group(); cg.position.copy(CLOCK_POS); R.add(cg);
  const rim = new Mesh(new CylinderGeometry(0.32, 0.32, 0.05, 48), M.black); rim.rotation.x = Math.PI / 2; add(rim, cg);
  const face = new Mesh(new CircleGeometry(0.29, 48), std({
    map: tex(canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#f8f5ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#2d2620';
      for (let i = 0; i < 60; i++) {
        g.save(); g.translate(w / 2, h / 2); g.rotate(i * Math.PI / 30); g.fillRect(-1, -118, 2, i % 5 ? 6 : 16); g.restore();
      }
    })),
    roughness: .4
  }));
  face.position.z = 0.026; cg.add(face);
  const { hourHand, minuteHand } = addClockHands(cg);

  // posters on left wall (facing +x)
  const poster = (yc: number, zc: number, w: number, h: number, c: HTMLCanvasElement) => {
    boxAt(0.5, yc - w / 2 - 2, zc - h / 2 - 2, 3, w + 4, h + 4, M.black, R);
    const p = new Mesh(new PlaneGeometry(w * U, h * U), std({ map: tex(c), roughness: .7 }));
    p.rotation.y = Math.PI / 2; p.position.copy(P(3.6, yc, zc)); R.add(p);
  };
  poster(480, 420, 150, 104, abstractCanvas());
  poster(330, 425, 72, 96, artCanvas());

  // floating shelf on left wall
  boxAt(0, 300, 318, 34, 230, 7, M.oak, R, 1);
  const mini: [string, number, number][] = [['#2f5d50', 10, 48], ['#e0453a', 12, 44], ['#d8c055', 9, 50], ['#7a8fa6', 14, 40]];
  let yy = 322;
  for (const [c, t, h] of mini) {
    boxAt(5, yy, 325, 25, t, h, std({ color: c, map: clothNoise(4), roughness: .8 }), R, .8);
    yy += t + 1.5;
  }
  potPlant(R, 17, 470, 325, 0.55, 'small');

  // desk
  boxAt(0, 230, 140, 150, 370, 6, M.oak, R, 1.2);
  boxAt(8, 236, 0, 134, 6, 140, M.white, R, 1);
  boxAt(8, 588, 0, 134, 6, 140, M.white, R, 1);
  boxAt(0, 470, 30, 138, 112, 108, M.white, R, 1);
  for (let i = 0; i < 3; i++) {
    boxAt(138, 474, 36 + i * 34, 3, 104, 30, M.white, R, .8);
    boxAt(141, 515, 47 + i * 34, 2, 22, 3, M.alu, R, .6);
  }
  // desk items
  boxAt(26, 486, 146, 96, 104, 3, M.alu, R, 1.2);
  boxAt(96, 262, 146, 40, 52, 2.4, std({ color: 0x24476b, map: clothNoise(2), roughness: .8 }), R, .4);
  boxAt(99, 266, 148.4, 35, 46, 2.4, std({ color: 0xd8473b, map: clothNoise(3), roughness: .8 }), R, .4);
  const mug = new Mesh(new CylinderGeometry(0.055, 0.05, 0.11, 32), M.mug);
  mug.position.copy(P(118, 560, 151)).add(new Vector3(0, 0.055, 0)); add(mug, R);
  const handle = new Mesh(new TorusGeometry(0.03, 0.009, 10, 24, Math.PI), M.mug);
  handle.rotation.z = -Math.PI / 2; handle.position.copy(mug.position).add(new Vector3(0.055, 0, 0)); add(handle, R);

  // desk lamp
  const lb = P(30, 252, 146);
  const base = new Mesh(new CylinderGeometry(0.1, 0.11, 0.03, 32), M.black);
  base.position.copy(lb).add(new Vector3(0, 0.015, 0)); add(base, R);
  const elbow = lb.clone().add(new Vector3(0.06, 0.95, 0.18)), head = lb.clone().add(new Vector3(0.5, 1.12, 0.42));
  cylBetween(lb, elbow, 0.012, M.black, R); cylBetween(elbow, head, 0.012, M.black, R);
  const shade = new Mesh(new CylinderGeometry(0.035, 0.12, 0.17, 32, 1, true), std({ color: 0x1f1d1b, roughness: .4, metalness: .5, side: DoubleSide }));
  shade.position.copy(head).add(new Vector3(0, -0.06, 0)); add(shade, R);
  const bulb = new Mesh(new SphereGeometry(0.04, 16, 12), M.bulb);
  bulb.position.copy(head).add(new Vector3(0, -0.1, 0)); live(bulb, 'Ampul'); R.add(bulb);
  const lampHead = head.clone().add(new Vector3(0, -0.1, 0));

  // chair
  boxAt(172, 388, 70, 66, 64, 8, M.fabric, R, 3);
  boxAt(234, 392, 82, 8, 56, 80, M.fabric, R, 3);
  cylBetween(P(206, 420, 16), P(206, 420, 70), 0.025, M.black, R);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, c = P(206, 420, 12), e = c.clone().add(new Vector3(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32));
    cylBetween(c, e, 0.018, M.black, R);
    const cs = new Mesh(new SphereGeometry(0.035, 12, 10), M.black); cs.position.copy(e).setY(0.035); add(cs, R);
  }

  // rug
  const rug = new Mesh(new CircleGeometry(1, 64), std({
    map: tex(canvas(512, 512, (g, w, h) => {
      g.fillStyle = '#e9dfcf'; g.fillRect(0, 0, w, h);
      const r = mulberry(8);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${r() < .5 ? 120 : 255},${r() < .5 ? 100 : 250},${r() < .5 ? 80 : 240},${0.05 + r() * 0.08})`;
        g.fillRect(r() * w, r() * h, 2, 1);
      }
      g.strokeStyle = 'rgba(150,120,90,.35)'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * .41, 0, 7); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * .37, 0, 7); g.stroke();
    })),
    color: 0xd7cdbd, roughness: 1
  }));
  rug.rotation.x = -Math.PI / 2; rug.scale.set(1.9, 1.65, 1); rug.position.copy(P(620, 525, .4)); add(rug, R, false, true);

  // plants
  potPlant(R, 923, 83, 0, 1.25, 'big');
  potPlant(R, 67, 67, 0, 1, 'snake');

  return { group: R, contact, sky, hourHand, minuteHand, lampHead };
}

export function potPlant(R: Object3D, x: number, y: number, z: number, s: number, kind: 'small' | 'big' | 'snake'): void {
  const g = new Group(); g.position.copy(P(x, y, z)); R.add(g);
  const r = mulberry(Math.round(x + y));
  const ph = kind === 'small' ? 0.12 : 0.5 * s, rt = kind === 'small' ? 0.07 : 0.3 * s;
  const pot = new Mesh(new CylinderGeometry(rt, rt * 0.78, ph, 40), kind === 'snake' ? M.darkCeramic : M.ceramic);
  pot.position.y = ph / 2; add(pot, g);
  const soil = new Mesh(new CircleGeometry(rt * 0.92, 32), M.soil);
  soil.rotation.x = -Math.PI / 2; soil.position.y = ph - 0.02; g.add(soil);
  if (kind === 'snake') {
    for (let i = 0; i < 9; i++) {
      const len = 0.9 + r() * 0.8, m = new Mesh(leafGeo(len, 0.075, 0.05, .9), M.snake);
      m.position.set((r() - .5) * 0.25, ph - 0.02, (r() - .5) * 0.25);
      m.rotation.set(-(r() - .5) * 0.35, r() * Math.PI * 2, (r() - .5) * 0.3, 'YXZ'); add(m, g);
    }
  } else {
    const n = kind === 'small' ? 7 : 26, L = kind === 'small' ? 0.16 : 0.62 * s;
    for (let i = 0; i < n; i++) {
      const stemLen = (kind === 'small' ? 0.05 : 0.5 * s) * (0.4 + r() * 0.9), yaw = r() * Math.PI * 2, tilt = 0.35 + r() * 0.9;
      const holder = new Group(); holder.position.set(0, ph - 0.02, 0); holder.rotation.set(0, yaw, 0); g.add(holder);
      const tip = new Vector3(0, Math.cos(tilt) * stemLen * 1.8, Math.sin(tilt) * stemLen);
      if (kind !== 'small') cylBetween(new Vector3(0, 0, 0), tip, 0.006, M.leafA, holder);
      const lf = new Mesh(leafGeo(L * (0.7 + r() * 0.5), L * 0.32, 0.2, .25), r() < .5 ? M.leafA : M.leafB);
      lf.position.copy(tip); lf.rotation.set(-(tilt + 0.25 + r() * 0.4), 0, (r() - .5) * 0.6); add(lf, holder);
    }
  }
}

// Clock hands show the real time.
export function setClock(refs: RoomRefs, d: Date): void {
  const m = d.getMinutes(), h = d.getHours() % 12;
  refs.hourHand.rotation.z = -(h + m / 60) * Math.PI / 6;
  refs.minuteHand.rotation.z = -m * Math.PI / 30;
}
