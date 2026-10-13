import { Color, DoubleSide, MeshStandardMaterial, type Material, type MeshStandardMaterialParameters, type Object3D, type Texture } from 'three';
import type { FloorKey, Room } from '../model/types';
import { clothNoise, floorTex, pagesTex, plasterTex, woodTex } from './textures';

// Materials that take the environment reflection; their envMapIntensity follows day/evening.
export const ENV_MATS: MeshStandardMaterial[] = [];
let envIntensity = 0.55;
export function setEnvIntensity(v: number): void {
  envIntensity = v;
  for (const m of ENV_MATS) m.envMapIntensity = v;
}

let envMap: Texture | null = null;
export function setEnvMap(t: Texture): void {
  envMap = t;
}

// The env map is set on each material: with only scene.environment, new three.js versions
// ignores material.envMapIntensity, and the prototype dims it in the evening.
export function std(o: MeshStandardMaterialParameters): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ envMap, envMapIntensity: envIntensity, ...o });
  ENV_MATS.push(m);
  return m;
}

// Materials/textures made for one object (a book, a plate) are "owned" and freed with it.
const ownedMats = new WeakSet<Material>(), ownedTex = new WeakSet<Texture>();
export function own<T extends Material>(m: T, ...maps: Texture[]): T {
  ownedMats.add(m);
  for (const t of maps) ownedTex.add(t);
  return m;
}

// Remove a group from the scene and free its GPU memory (shared materials stay).
export function disposeGroup(g: Object3D): void {
  g.traverse(o => {
    const mesh = o as Partial<{ isMesh: boolean; geometry: { dispose(): void }; material: Material | Material[] }>;
    if (!mesh.isMesh) return;
    mesh.geometry!.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material!];
    for (const m of mats) {
      if (!ownedMats.has(m)) continue;
      const sm = m as MeshStandardMaterial;
      for (const t of [sm.map, sm.bumpMap]) if (t && ownedTex.has(t)) t.dispose();
      m.dispose();
      const i = ENV_MATS.indexOf(sm); if (i >= 0) ENV_MATS.splice(i, 1);
    }
  });
  g.removeFromParent();
}

export const FLOOR_COLORS: Record<FloorKey, [string, string]> = {
  mese: ['#d9a46a', '#c48d55'], ceviz: ['#9a6a45', '#7f5536'], acik: ['#e6cfae', '#d6b98f']
};

export type Materials = ReturnType<typeof createMaterials>;
export let M: Materials;

function createMaterials(room: Room) {
  return {
    wall: std({ color: new Color(room.duvar), map: plasterTex(), roughness: .95 }),
    white: std({ color: 0xf3efe8, roughness: .6 }),
    frame: std({ color: 0xf7f4ef, roughness: .45 }),
    floor: std({ color: 0xd6ae86, map: floorTex(...FLOOR_COLORS[room.zemin]), roughness: .55, metalness: 0 }),
    slab: std({ color: 0xb5895f, map: woodTex('oak'), roughness: .7 }),
    walnutH: std({ map: woodTex('walnut'), roughness: .55 }),
    walnutV: std({ map: woodTex('walnut', true), roughness: .55 }),
    walnutBack: std({ color: 0x6d5a52, map: woodTex('walnut', true), roughness: .8 }),
    oak: std({ map: woodTex('oak'), roughness: .5 }),
    oakV: std({ map: woodTex('oak', true), roughness: .5 }),
    black: std({ color: 0x1f1d1b, roughness: .45, metalness: .4 }),
    alu: std({ color: 0xc9ccd0, roughness: .32, metalness: .75 }),
    fabric: std({ color: 0x30343a, map: clothNoise(9), roughness: .95 }),
    ceramic: std({ color: 0xf1ede6, roughness: .28 }),
    darkCeramic: std({ color: 0x2b2724, roughness: .35 }),
    soil: std({ color: 0x3a2a1e, roughness: 1 }),
    leafA: std({ color: 0x3f6e3a, roughness: .5, side: DoubleSide }),
    leafB: std({ color: 0x568a4b, roughness: .5, side: DoubleSide }),
    snake: std({ color: 0x40653a, roughness: .45, side: DoubleSide }),
    pages: std({ color: 0xf2ead8, map: pagesTex(), roughness: .9 }),
    brass: std({ color: 0xc9a35a, roughness: .3, metalness: .85 }),
    glass: new MeshStandardMaterial({ color: 0xdfeaf2, roughness: .05, metalness: 0, transparent: true, opacity: .14, depthWrite: false }),
    bulb: new MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffc77a, emissiveIntensity: 0 }),
    mug: std({ color: 0xb5523b, roughness: .35 })
  };
}

export function makeMaterials(room: Room): void {
  M = createMaterials(room);
  floorCache[room.zemin] = M.floor.map!;
}

// Wall colour and floor planks from kitaplik.json → oda.
const floorCache: Partial<Record<FloorKey, Texture>> = {};
export const floorTexture = (key: FloorKey): Texture => floorCache[key] ??= floorTex(...FLOOR_COLORS[key]);
export function applyRoom(room: Room): void {
  M.wall.color.set(room.duvar);
  M.floor.map = floorTexture(room.zemin);
  M.floor.needsUpdate = true;
}
