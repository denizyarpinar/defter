import { Color, DoubleSide, MeshStandardMaterial, type MeshStandardMaterialParameters, type Texture } from 'three';
import type { RoomLook } from '../model/sampleData';
import { clothNoise, floorTex, pagesTex, plasterTex, woodTex } from './textures';

// Materials that take the environment reflection; their envMapIntensity follows day/evening.
export const ENV_MATS: MeshStandardMaterial[] = [];

let envMap: Texture | null = null;
export function setEnvMap(t: Texture): void {
  envMap = t;
}

// The env map is set on each material: with only scene.environment, new three.js versions
// ignores material.envMapIntensity, and the prototype dims it in the evening.
export function std(o: MeshStandardMaterialParameters): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ envMap, ...o });
  ENV_MATS.push(m);
  return m;
}

export type Materials = ReturnType<typeof createMaterials>;
export let M: Materials;

function createMaterials(room: RoomLook) {
  return {
    wall: std({ color: new Color(room.wall), map: plasterTex(), roughness: .95 }),
    white: std({ color: 0xf3efe8, roughness: .6 }),
    frame: std({ color: 0xf7f4ef, roughness: .45 }),
    floor: std({ color: 0xd6ae86, map: floorTex(room.floor[0], room.floor[1]), roughness: .55, metalness: 0 }),
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

export function makeMaterials(room: RoomLook): void {
  M = createMaterials(room);
}
