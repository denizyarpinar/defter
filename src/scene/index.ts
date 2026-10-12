import { Raycaster, Vector2, type Group } from 'three';
import type { RoomLook, SampleShelf } from '../model/sampleData';
import { buildCase } from './bookcase';
import { CameraRig, type View } from './camera';
import { requestRender } from './frame';
import { buildLights, makeEnv, setLighting, useLegacyLightFalloff } from './lights';
import { makeMaterials, setEnvMap } from './materials';
import { buildRoom, setClock } from './room';
import { createStage, resizeStage, startLoop } from './renderer';

export type { View } from './camera';

export interface RoomScene {
  readonly view: View;
  setView(v: View): void;
  setNight(night: boolean, instant?: boolean): void;
  updateClock(): void;
  resize(): void;
}

export interface RoomSceneOptions {
  shelves: SampleShelf[];
  room: RoomLook;
  night: boolean;
  onViewChange: (v: View) => void;
}

export function createRoomScene(host: HTMLElement, opts: RoomSceneOptions): RoomScene {
  useLegacyLightFalloff();
  const stage = createStage(host);
  const { renderer, scene, camera } = stage;
  const env = makeEnv(renderer);
  scene.environment = env;
  setEnvMap(env);

  makeMaterials(opts.room);
  const refs = buildRoom(scene);
  const lights = buildLights(scene, refs);
  const caseGroup: Group = buildCase(scene, opts.shelves);
  setLighting(lights, renderer, refs, opts.night, true);
  setClock(refs, new Date());

  const rig = new CameraRig(camera, () => opts.shelves.length);
  const setView = (v: View, instant = false) => {
    rig.setView(v, instant);
    opts.onViewChange(v);
  };

  // ---- pointer: tap the bookcase to zoom in, tap empty space to go back ----
  const ray = new Raycaster(), ndc = new Vector2();
  const hitsCase = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(caseGroup, true).some(h => h.object.userData.case);
  };
  let press: { pid: number; hit: boolean } | null = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    press = { pid: e.pointerId, hit: hitsCase(e) };
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  cv.addEventListener('pointermove', e => {
    if (press || e.pointerType !== 'mouse') return;
    cv.style.cursor = hitsCase(e) ? 'pointer' : 'default';
  });
  cv.addEventListener('pointerup', e => {
    if (!press || press.pid !== e.pointerId) return;
    const p = press; press = null;
    if (rig.view === 'room') { if (p.hit) setView('shelf'); return; }
    if (rig.view === 'shelf' && !p.hit) setView('room');
  });
  cv.addEventListener('pointercancel', () => { press = null; });

  rig.intro();
  opts.onViewChange('room');
  startLoop(stage);

  return {
    get view() { return rig.view; },
    setView: v => setView(v),
    setNight: (night, instant = false) => setLighting(lights, renderer, refs, night, instant),
    updateClock: () => { setClock(refs, new Date()); requestRender(); },
    resize: () => { resizeStage(stage); rig.setView(rig.view, true); }
  };
}
