import { Raycaster, Vector2 } from 'three';
import type { Room } from '../model/types';
import { CameraRig, type View } from './camera';
import { frame, requestRender } from './frame';
import { Library3D, type LibraryData } from './library3d';
import { buildLights, currentNightK, makeEnv, setLighting, useLegacyLightFalloff } from './lights';
import { applyRoom, makeMaterials, setEnvMap } from './materials';
import { buildRoom, setClock } from './room';
import { createStage, resizeStage, startLoop } from './renderer';

export type { View } from './camera';
export type { LibraryData } from './library3d';

export interface RoomScene {
  readonly view: View;
  setView(v: View): void;
  setNight(night: boolean, instant?: boolean): void;
  updateClock(): void;
  resize(): void;
  applyRoom(room: Room): void;
  shelvesChanged(): void;           // shelf names or count changed
  refreshBook(id: string): void;    // cover changed
  closeBook(): void;                // reader closed: fly the book back
  setPaused(p: boolean): void;      // reader covers the scene
  reload(): void;                   // data was replaced (e.g. Drive library loaded)
  exportRoom(): Promise<void>;      // dev: download the room as oda-kaynak.glb
}

export interface RoomSceneOptions {
  data: LibraryData;
  night: boolean;
  onViewChange: (v: View) => void;
  onBookOpening: (id: string) => void;   // tapped, flying to the desk
  onBookOnDesk: (id: string) => void;    // landed: show the reader
  onBookClosed: (id: string) => void;    // back on its shelf
  onLibraryChanged: () => void;          // books moved by drag & drop
  onToast: (msg: string) => void;
}

export function createRoomScene(host: HTMLElement, opts: RoomSceneOptions): RoomScene {
  useLegacyLightFalloff();
  const stage = createStage(host);
  const { renderer, scene, camera } = stage;
  const env = makeEnv(renderer);
  scene.environment = env;
  setEnvMap(env);

  makeMaterials(opts.data.library.oda);
  const refs = buildRoom(scene);
  const lights = buildLights(scene, refs);
  const lib3d = new Library3D(scene, opts.data);
  lib3d.buildCase();
  lib3d.buildBooks();
  setLighting(lights, renderer, refs, opts.night, true);
  setClock(refs, new Date());

  const rig = new CameraRig(camera, () => ({ shelfCount: opts.data.library.raflar.length, pile: lib3d.hasPile }));
  const setView = (v: View, instant = false, dur?: number) => {
    rig.setView(v, instant, dur);
    opts.onViewChange(v);
  };

  let openId: string | null = null;

  // ---- pointer: tap to zoom / open, drag to move books ----
  const ray = new Raycaster(), ndc = new Vector2();
  const setRay = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  let press: { x: number; y: number; pid: number; hit: ReturnType<Library3D['pick']>; drag: boolean } | null = null;
  const cv = renderer.domElement;

  cv.addEventListener('pointerdown', e => {
    if (openId || e.button > 0) return;
    setRay(e);
    press = { x: e.clientX, y: e.clientY, pid: e.pointerId, hit: lib3d.pick(ray), drag: false };
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });

  cv.addEventListener('pointermove', e => {
    if (!press) {
      if (openId || e.pointerType !== 'mouse') return;
      setRay(e); cv.style.cursor = lib3d.pick(ray) ? 'pointer' : 'default';
      return;
    }
    if (press.pid !== e.pointerId) return;
    const id = press.hit?.book;
    if (!press.drag && rig.view === 'shelf' && id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
      press.drag = true;
      setRay(e); lib3d.startDrag(id, ray.ray);
    }
    if (press.drag) { setRay(e); lib3d.moveDrag(ray.ray); }
  });

  cv.addEventListener('pointerup', e => {
    if (!press || press.pid !== e.pointerId) return;
    const p = press; press = null;
    if (p.drag) {
      const pileBefore = lib3d.hasPile;
      const moved = lib3d.endDrag();
      if (moved) {
        if (moved.changedShelf) opts.onToast(`“${moved.title}” → ${moved.shelf} rafına taşındı`);
        opts.onLibraryChanged();
      }
      if (pileBefore !== lib3d.hasPile) setView('shelf');   // pile appeared/disappeared: refit
      return;
    }
    if (rig.view === 'room') { if (p.hit) setView('shelf'); return; }
    if (rig.view === 'shelf') {
      if (p.hit?.book) openBook(p.hit.book);
      else if (!p.hit) setView('room');
    }
  });

  cv.addEventListener('pointercancel', () => {
    if (press?.drag) lib3d.cancelDrag();
    press = null;
  });

  function openBook(id: string): void {
    openId = id;
    opts.onBookOpening(id);
    lib3d.flyToDesk(id, () => opts.onBookOnDesk(id), () => setView('desk', false, 1150));
  }

  rig.intro();
  opts.onViewChange('room');
  startLoop(stage);

  return {
    get view() { return rig.view; },
    setView: v => setView(v),
    setNight: (night, instant = false) => setLighting(lights, renderer, refs, night, instant),
    updateClock: () => { setClock(refs, new Date()); requestRender(); },
    resize: () => { resizeStage(stage); rig.setView(rig.view, true); },
    applyRoom: room => { applyRoom(room); requestRender(); },
    shelvesChanged: () => { lib3d.rebuildAll(); if (rig.view === 'shelf') rig.setView('shelf', true); },
    refreshBook: id => lib3d.refreshBook(id),
    closeBook: () => {
      const id = openId; if (!id) return;
      setView('shelf', false, 1100);
      lib3d.flyHome(id, () => {
        openId = null;
        lib3d.refreshBook(id);   // dust may be gone now
        opts.onBookClosed(id);
      });
    },
    setPaused: p => { frame.paused = p; if (!p) requestRender(); },
    exportRoom: async () => {
      if (!import.meta.env.DEV) return;   // removed from the production build
      const { exportRoom } = await import('./exportRoom');
      await exportRoom(refs, currentNightK());
      requestRender();
    },
    reload: () => {
      openId = null;
      applyRoom(opts.data.library.oda);
      lib3d.buildCase();
      lib3d.buildBooks();
      if (rig.view !== 'room') setView('shelf', true);
    }
  };
}
