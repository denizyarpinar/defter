import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Mesh, Shape, ShapeGeometry, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import { P, U } from './units';

// Box with rounded (bevelled) edges.
export function rbox(w: number, h: number, d: number, r: number): BufferGeometry {
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const s = new Shape(), x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  s.moveTo(x, y); s.lineTo(x + ww, y); s.lineTo(x + ww, y + hh); s.lineTo(x, y + hh); s.lineTo(x, y);
  const g = new ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
  return g;
}

export function add<T extends Mesh>(mesh: T, parent: Object3D, cast = true, recv = true): T {
  mesh.castShadow = cast; mesh.receiveShadow = recv;
  parent.add(mesh);
  return mesh;
}

// Box from plan coords: min corner (x,y,z) and size (sx,sy,sz); r = bevel in plan units.
export function boxAt(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: Material | Material[], parent: Object3D, r?: number): Mesh {
  const geo = r ? rbox(sx * U, sz * U, sy * U, r * U) : new BoxGeometry(sx * U, sz * U, sy * U);
  const m = new Mesh(geo, mat);
  m.position.copy(P(x + sx / 2, y + sy / 2, z + sz / 2));
  return add(m, parent);
}

export function cylBetween(a: Vector3, b: Vector3, rad: number, mat: Material, parent: Object3D): Mesh {
  const dir = new Vector3().subVectors(b, a), len = dir.length();
  const m = new Mesh(new CylinderGeometry(rad, rad, len, 16), mat);
  m.position.copy(a).addScaledVector(dir, .5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  return add(m, parent);
}

export function leafGeo(len: number, wid: number, bend: number, cup?: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * .18, wid * .9, len * .7, 0, len);
  s.bezierCurveTo(-wid * .9, len * .7, -wid, len * .18, 0, 0);
  const g = new ShapeGeometry(s, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, bend * Math.pow(y / len, 2) * len + Math.abs(x) * (cup || .35));
  }
  g.computeVertexNormals();
  return g;
}
