import { BackSide, BoxGeometry, DirectionalLight, DoubleSide, HemisphereLight, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, PointLight, Scene, ShaderChunk, SpotLight, Vector3, type Texture, type WebGLRenderer } from 'three';
import { requestRender } from './frame';
import { M, setEnvIntensity } from './materials';
import type { RoomRefs } from './room';
import { tween } from './tween';
import { DESK_SPOT } from './units';

// The prototype ran three.js r128 in "legacy" light units. Since r155 lights are physical:
// direct light is no longer multiplied by π, so every intensity below is multiplied by π.
const LEGACY = Math.PI;

// r128 legacy distance falloff for point/spot lights: pow(1 - d/distance, decay).
// The modern one (1/d²) makes the desk lamp look very different, so we restore the old formula.
export function useLegacyLightFalloff(): void {
  const legacy = `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
		return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
	}
	return 1.0;
}`;
  const src = ShaderChunk.lights_pars_begin;
  const patched = src.replace(/float getDistanceAttenuation\([\s\S]*?return distanceFalloff;\s*\}/, legacy);
  if (patched === src) console.warn('Defter: ışık yaması uygulanamadı (three.js sürümü değişmiş olabilir). Lambalar prototipten farklı görünebilir.');
  ShaderChunk.lights_pars_begin = patched;
}

export interface Lights {
  hemi: HemisphereLight;
  sun: DirectionalLight;
  key: DirectionalLight;
  spot: SpotLight;
  glow: PointLight;
  room: PointLight;
}

export function buildLights(scene: Scene, refs: RoomRefs): Lights {
  const hemi = new HemisphereLight(0xfff3e2, 0x7a5c40, 0.55 * LEGACY); scene.add(hemi);

  // sun through the window
  const sun = new DirectionalLight(0xffeccc, 2.6 * LEGACY);
  const tgt = new Vector3(7.2, 0, 2.8), dir = new Vector3(-0.32, -1, 0.82).normalize();
  sun.position.copy(tgt).addScaledVector(dir, -16); sun.target.position.copy(tgt);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.castShadow = true; scene.add(sun, sun.target);

  // soft key from the open side of the diorama
  const key = new DirectionalLight(0xfff6ea, 1.0 * LEGACY);
  key.position.set(16, 14, 12); key.target.position.set(4, 0, 3);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 50 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.025;
  key.castShadow = true; scene.add(key, key.target);

  // desk lamp (evening)
  const spot = new SpotLight(0xffc27e, 0, 7, 0.95, 0.65, 2);
  spot.position.copy(refs.lampHead); spot.target.position.copy(DESK_SPOT).add(new Vector3(0.15, 0, -0.25));
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
  const glow = new PointLight(0xffae62, 0, 7, 2); glow.position.copy(refs.lampHead).add(new Vector3(0.1, 0.05, 0)); scene.add(glow);
  const room = new PointLight(0xffb978, 0, 12, 2); room.position.set(5.5, 4.2, 4.5); scene.add(room);

  return { hemi, sun, key, spot, glow, room };
}

// Day ↔ evening transition (the prototype used 800 ms; longer so the sunset is visible).
const TRANSITION_MS = 2500;

let nightK = 0;

// Day ↔ evening blend; k = 0 day, 1 evening.
export function setLighting(L: Lights, renderer: WebGLRenderer, refs: RoomRefs, night: boolean, instant: boolean): void {
  const from = nightK, to = night ? 1 : 0;
  const apply = (k: number) => {
    nightK = k;
    L.hemi.intensity = (0.3 - 0.2 * k) * LEGACY; L.hemi.color.setRGB(1 - .45 * k, .95 - .38 * k, .89 - .2 * k);
    L.sun.intensity = (1.9 * (1 - k) + 0.35 * k) * LEGACY; L.sun.color.setRGB(1 - .4 * k, .93 - .22 * k, .8 + .2 * k);
    L.key.intensity = (0.45 * (1 - k) + 0.1 * k) * LEGACY; L.key.color.setRGB(1 - .45 * k, .96 - .3 * k, .92);
    L.spot.intensity = 5 * k * LEGACY; L.glow.intensity = 1.6 * k * LEGACY; L.room.intensity = 1.1 * k * LEGACY;
    M.bulb.emissiveIntensity = 3 * k;
    setEnvIntensity(0.55 - 0.4 * k);
    renderer.toneMappingExposure = 0.86 - 0.01 * k;
    refs.contact.material.opacity = 1 - .4 * k;
    refs.sky.draw(k, to === 0);
    requestRender();
  };
  if (instant) apply(to);
  else tween(TRANSITION_MS, k => apply(from + (to - from) * k), undefined, 'light');
}

// Soft studio-like reflections for the PBR materials.
export function makeEnv(renderer: WebGLRenderer): Texture {
  const s = new Scene();
  const box = new Mesh(new BoxGeometry(30, 14, 30), new MeshBasicMaterial({ color: 0x8c8378, side: BackSide })); box.position.y = 5; s.add(box);
  const pane = (w: number, h: number, p: Vector3, c: number, ry = 0, rx = 0) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: c, side: DoubleSide }));
    m.position.copy(p); m.rotation.set(rx, ry, 0); s.add(m);
  };
  pane(12, 7, new Vector3(0, 6, -14), 0xffffff);
  pane(16, 16, new Vector3(0, 11.9, 0), 0xf3e9db, 0, Math.PI / 2);
  pane(10, 6, new Vector3(14, 5, 2), 0xe4d4bd, -Math.PI / 2);
  const pm = new PMREMGenerator(renderer);
  return pm.fromScene(s, 0.04).texture;
}
