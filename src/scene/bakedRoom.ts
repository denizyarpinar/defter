import { Box3, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture, Vector3, type Material, type MeshStandardMaterial, type Scene } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Room } from '../model/types';
import { M, floorTexture } from './materials';
import { CLOCK_POS, addClockHands, type RoomRefs } from './room';
import { canvas, createSky, tex } from './textures';
import { requestRender } from './frame';
import { tween } from './tween';
import { DESK_SPOT, U } from './units';

// Faz 2.4: the room baked in Blender (public/models/oda.glb + two lightmaps, see blender/bake.py).
// Baked parts become MeshBasicMaterial: colour × lightmap only, so the live lights (which now
// light just the bookcase and books) don't add to the light that is already in the lightmap.

const BASE = `${import.meta.env.BASE_URL}models/`;

interface LightmapInfo {
  carpan: { gunduz: number; aksam: number };
  gunduz: string;
  aksam: string;
  // 1024 px versions for touch devices (blender/mobil.py)
  mobil?: { glb: string; gunduz: string; aksam: string };
}

// three.js divides lightMap by π (Lambert); Blender's check render is colour × lightmap × scale.
const LIGHTMAP_INTENSITY = Math.PI;

export interface BakedRoom {
  refs: RoomRefs;
  applyRoom(room: Room): void;
}

// Throws on any error or when `signal` aborts (timeout); nothing is added to the scene then.
export async function loadBakedRoom(scene: Scene, room: Room, signal: AbortSignal): Promise<BakedRoom> {
  const get = async (file: string) => {
    const r = await fetch(BASE + file, { signal });
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return r;
  };
  const info = await (await get('lightmap.json')).json() as LightmapInfo;
  // iPad and phones (same rule as styles.css) get the 1024 px textures and lightmaps
  const files = matchMedia('(pointer: coarse)').matches && info.mobil
    ? info.mobil
    : { glb: 'oda.glb', gunduz: info.gunduz, aksam: info.aksam };
  const [glbBuf, lmDay, lmNight] = await Promise.all([
    get(files.glb).then(r => r.arrayBuffer()),
    get(files.gunduz).then(r => r.blob()).then(lightmapTexture),
    get(files.aksam).then(r => r.blob()).then(lightmapTexture)
  ]);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glbBuf, BASE);
  signal.throwIfAborted();   // too late: the old room is already on screen

  const R = gltf.scene.getObjectByName('Oda') as Group | undefined ?? gltf.scene;
  R.name = 'Oda';

  // shared by every baked material: one value switches the whole room
  const uniforms = {
    uLightMapAksam: { value: lmNight },
    uCarpanGunduz: { value: info.carpan.gunduz },
    uCarpanAksam: { value: info.carpan.aksam },
    uKarisim: { value: 0 },
    uKoyulas: { value: 1 }
  };
  const baked = new Map<Material, MeshBasicMaterial>();
  const bakedMat = (src: MeshStandardMaterial): MeshBasicMaterial => {
    let m = baked.get(src);
    if (m) return m;
    m = new MeshBasicMaterial({
      name: src.name, color: src.color, map: src.map, side: src.side,
      transparent: src.transparent, opacity: src.opacity, depthWrite: src.depthWrite, alphaTest: src.alphaTest,
      lightMap: lmDay, lightMapIntensity: LIGHTMAP_INTENSITY
    });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <lightmap_pars_fragment>', `#include <lightmap_pars_fragment>
uniform sampler2D uLightMapAksam;
uniform float uCarpanGunduz, uCarpanAksam, uKarisim, uKoyulas;`)
        .replace('vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );', `vec4 lightMapTexel = mix(
			texture2D( lightMap, vLightMapUv ) * uCarpanGunduz,
			texture2D( uLightMapAksam, vLightMapUv ) * uCarpanAksam, uKarisim ) * uKoyulas;`);
    };
    m.customProgramCacheKey = () => 'defter-lightmap';
    baked.set(src, m);
    return m;
  };

  const sky = createSky();
  const walls = new Set<MeshBasicMaterial>(), floors = new Set<MeshBasicMaterial>();
  let bulbPos: Vector3 | null = null;
  const clockHands: Mesh[] = [];
  R.updateMatrixWorld(true);
  const box = new Box3(), c = new Vector3();

  R.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (o.name === 'Gokyuzu') {
      mesh.material = new MeshBasicMaterial({ map: sky.texture, toneMapped: false });
      return;
    }
    if (o.name === 'Ampul') { mesh.material = M.bulb; bulbPos = o.getWorldPosition(new Vector3()); return; }
    if (o.name === 'Cam') { mesh.material = M.glass; return; }
    const m = bakedMat(mesh.material as MeshStandardMaterial);
    mesh.material = m;
    mesh.castShadow = true;   // the sun through the window still throws shadows on the bookcase
    // wall and floor are recognised by their texture repeat (see textures.ts plasterTex / floorTex)
    const rep = m.map?.repeat;
    if (rep && near(rep.x, 4) && near(rep.y, 3)) walls.add(m);
    if (rep && near(rep.x, 2.2) && near(rep.y, 2.2)) floors.add(m);
    // the clock hands were baked at export time: hide them, live hands are added below
    box.setFromObject(mesh).getCenter(c);
    if (box.min.z > CLOCK_POS.z + 0.027 && Math.hypot(c.x - CLOCK_POS.x, c.y - CLOCK_POS.y) < 0.3) clockHands.push(mesh);
  });
  if (!walls.size || !floors.size || !bulbPos) throw new Error('oda.glb: duvar, zemin ya da ampul bulunamadı');   // dil-kontrol: yoksay
  if (clockHands.length !== 2) console.warn(`Defter: oda.glb'de saat ibresi ${clockHands.length} bulundu (2 bekleniyordu).`);
  for (const h of clockHands) h.visible = false;
  const cg = new Group(); cg.position.copy(CLOCK_POS); R.add(cg);
  const hands = addClockHands(cg);

  const desk = deskShadow(R);

  const applyRoom = (r: Room) => {
    for (const m of walls) m.color.set(r.duvar);
    for (const m of floors) { m.map = floorTexture(r.zemin); m.needsUpdate = true; }
  };
  applyRoom(room);
  scene.add(R);

  return {
    refs: {
      group: R, contact: null, sky, ...hands, lampHead: bulbPos,
      lightmapBlend: (mix, dim) => { uniforms.uKarisim.value = mix; uniforms.uKoyulas.value = dim; },
      deskShadow: desk
    },
    applyRoom
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

// The desk is baked (MeshBasic, no live shadows), so the open book gets a soft fake contact shadow.
// Same yaw as the book on the desk (library3d.ts flyToDesk); fades in when it lands, out when it leaves.
const DESK_SHADOW_FADE_MS = 300;
function deskShadow(R: Group): (on: boolean, w?: number, d?: number) => void {
  const mat = new MeshBasicMaterial({
    map: tex(canvas(256, 256, (g, w, h) => {
      // soft rectangle: dark under the book, fading out past its edges
      const r = (x: number, y: number) => Math.max(Math.abs(x - w / 2) / (w / 2), Math.abs(y - h / 2) / (h / 2));
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = Math.min(1, Math.max(0, (1 - r(x + .5, y + .5)) / 0.35));
        img.data.set([40, 25, 10, Math.round(255 * 0.5 * k * k * (3 - 2 * k))], (y * w + x) * 4);
      }
      g.putImageData(img, 0, 0);
    })),
    transparent: true, depthWrite: false, opacity: 0
  });
  const m = new Mesh(new PlaneGeometry(1, 1), mat);
  m.name = 'MasaGolgesi';
  m.rotation.set(-Math.PI / 2, 0, 0.1);   // flat on the desk, turned like the book
  m.position.copy(DESK_SPOT).add(new Vector3(0, 0.001, 0));
  m.visible = false;
  R.add(m);
  return (on, w, d) => {
    if (on && w && d) m.scale.set(w * U * 1.18, d * U * 1.22, 1);
    const from = mat.opacity, to = on ? 1 : 0;
    m.visible = true;
    tween(DESK_SHADOW_FADE_MS, k => { mat.opacity = from + (to - from) * k; }, () => { m.visible = on; requestRender(); }, 'deskShadow');
  };
}

// Lightmap PNG (sRGB-encoded light, 0–1) on the second UV set; glTF UVs need flipY = false.
async function lightmapTexture(blob: Blob): Promise<Texture> {
  const img = new Image();
  img.src = URL.createObjectURL(blob);   // kept: two small files, and Safari may decode again on upload
  await img.decode();
  const t = new Texture(img);
  t.flipY = false;
  t.channel = 1;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
