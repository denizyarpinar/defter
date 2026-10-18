import { Raycaster, Vector2, type Scene } from 'three';
import type { Room } from '../model/types';
import { CameraRig, type View } from './camera';
import { frame, requestRender } from './frame';
import { Library3D, type LibraryData } from './library3d';
import { buildLights, currentNightK, makeEnv, setLighting, useLegacyLightFalloff } from './lights';
import { loadBakedRoom, type BakedRoom } from './bakedRoom';
import { applyRoom, makeMaterials, setEnvMap } from './materials';
import { buildRoom, setClock, type RoomRefs } from './room';
import { createStage, resizeStage, startLoop } from './renderer';

export type { View } from './camera';
export type { LibraryData } from './library3d';

export interface RoomScene {
  readonly view: View;
  readonly night: boolean;          // evening light is on (or fading in)
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
  setLocked(on: boolean): void;     // task 5.1: signing in / loading: books can't be opened or moved
  openBook(id: string): boolean;    // task 6.3e (library search): as a tap on the book; false: can't now
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

// Baked room (Faz 2.4) gets this long; then the old procedural room is shown instead.
const BAKED_TIMEOUT_MS = 15_000;
// Day ↔ evening in the baked room: lightmap mix, sky and bulb together.
const BAKED_TRANSITION_MS = 1500;
// The book's flight to the desk takes 1150 ms; its contact shadow (300 ms fade) starts this much later.
const DESK_SHADOW_DELAY_MS = 850;

// New baked room, or the old procedural one: forced with ?oda=eski (and ?export=oda, which exports
// the old room for Blender), or as a fallback when oda.glb fails or takes longer than 15 s.
async function chooseRoom(scene: Scene, room: Room, onToast: (msg: string) => void): Promise<{ refs: RoomRefs; baked: BakedRoom | null }> {
  const q = new URLSearchParams(location.search);
  if (q.get('oda') !== 'eski' && q.get('export') !== 'oda') {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error('zaman aşımı (15 sn)')), BAKED_TIMEOUT_MS);
    try {
      const baked = await Promise.race([
        loadBakedRoom(scene, room, ctl.signal),
        new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(ctl.signal.reason)))
      ]);
      return { refs: baked.refs, baked };
    } catch (e) {
      console.warn('Defter: yeni oda yüklenemedi, eski oda açılıyor.', e);
      ctl.abort();
      onToast('Yeni oda yüklenemedi, eski oda gösteriliyor. Sayfayı yenileyince tekrar denenir.');
    } finally {
      clearTimeout(timer);
    }
  }
  return { refs: buildRoom(scene), baked: null };
}

export async function createRoomScene(host: HTMLElement, opts: RoomSceneOptions): Promise<RoomScene> {
  useLegacyLightFalloff();
  const stage = createStage(host);
  const { renderer, scene, camera } = stage;
  const env = makeEnv(renderer);
  scene.environment = env;
  setEnvMap(env);

  makeMaterials(opts.data.library.oda);
  const { refs, baked } = await chooseRoom(scene, opts.data.library.oda, opts.onToast);
  const transitionMs = baked ? BAKED_TRANSITION_MS : undefined;
  const lights = buildLights(scene, refs);
  const lib3d = new Library3D(scene, opts.data);
  lib3d.buildCase();
  lib3d.buildBooks();
  let night = opts.night;
  setLighting(lights, renderer, refs, night, true);
  setClock(refs, new Date());

  const rig = new CameraRig(camera, () => ({ shelfCount: opts.data.library.raflar.length, pile: lib3d.hasPile }));
  const setView = (v: View, instant = false, dur?: number) => {
    rig.setView(v, instant, dur);
    opts.onViewChange(v);
  };

  let openId: string | null = null;
  let locked = false;

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
      setRay(e); const hit = lib3d.pick(ray);
      cv.style.cursor = hit && (!locked || rig.view === 'room') ? 'pointer' : 'default';
      return;
    }
    if (press.pid !== e.pointerId) return;
    const id = press.hit?.book;
    if (!press.drag && !locked && rig.view === 'shelf' && id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
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
      if (p.hit?.book) { if (!locked) openBook(p.hit.book); }
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
    // the library may be replaced while the book flies (reload: openId = null); then stop quietly
    lib3d.flyToDesk(id, () => { if (openId === id) opts.onBookOnDesk(id); }, () => {
      if (openId !== id) return;
      setView('desk', false, 1150);
      // the reader covers the desk once the book lands, so the shadow fades in while it comes down
      const dims = lib3d.groups.get(id)?.userData.dims as { h: number; d: number } | undefined;
      setTimeout(() => { if (openId === id) refs.deskShadow?.(true, dims?.h, dims?.d); }, DESK_SHADOW_DELAY_MS);
    });
  }

  rig.intro();
  opts.onViewChange('room');
  startLoop(stage);

  return {
    get view() { return rig.view; },
    get night() { return night; },
    setView: v => setView(v),
    setNight: (n, instant = false) => { night = n; setLighting(lights, renderer, refs, n, instant, transitionMs); },
    updateClock: () => { setClock(refs, new Date()); requestRender(); },
    resize: () => { resizeStage(stage); rig.setView(rig.view, true); },
    applyRoom: room => { applyRoom(room); baked?.applyRoom(room); requestRender(); },
    shelvesChanged: () => { lib3d.rebuildAll(); if (rig.view === 'shelf') rig.setView('shelf', true); },
    refreshBook: id => lib3d.refreshBook(id),
    closeBook: () => {
      const id = openId; if (!id) return;
      refs.deskShadow?.(false);
      setView('shelf', false, 1100);
      lib3d.flyHome(id, () => {
        openId = null;
        lib3d.refreshBook(id);   // dust may be gone now
        opts.onBookClosed(id);
      });
    },
    setPaused: p => { frame.paused = p; if (!p) requestRender(); },
    openBook: id => {
      if (locked || openId || press?.drag || !lib3d.groups.has(id)) return false;
      openBook(id);
      return true;
    },
    setLocked: on => {
      locked = on;
      if (on && press?.drag) { lib3d.cancelDrag(); press = null; }
      if (on) cv.style.cursor = 'default';
    },
    exportRoom: async () => {
      if (!import.meta.env.DEV || baked) return;   // removed from the production build; old room only
      const { exportRoom } = await import('./exportRoom');
      await exportRoom(refs, currentNightK());
      requestRender();
    },
    reload: () => {
      openId = null;
      refs.deskShadow?.(false);
      applyRoom(opts.data.library.oda);
      baked?.applyRoom(opts.data.library.oda);
      lib3d.buildCase();
      lib3d.buildBooks();
      if (rig.view !== 'room') setView('shelf', true);
    }
  };
}
