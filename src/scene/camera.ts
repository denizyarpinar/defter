import { Vector3, type PerspectiveCamera } from 'three';
import { caseHeight } from './bookcase';
import { requestRender } from './frame';
import { tween } from './tween';
import { BD, BW, BX, DESK_SPOT, PILE_X, U } from './units';

export type View = 'room' | 'shelf' | 'desk';

interface ViewTarget { tgt: Vector3; pos: Vector3 }

export interface Framing {
  shelfCount: number;
  pile: boolean;        // "Yeni gelenler" pile next to the bookcase is in the picture
}

// Camera position for each view; fits the target area to the current screen size.
export function viewParams(camera: PerspectiveCamera, v: View, fr: Framing): ViewTarget {
  const aspect = innerWidth / innerHeight, vf = camera.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const useV = (innerHeight - 130) / innerHeight;
  const fit = (halfW: number, halfH: number) => Math.max(halfH / Math.tan(vf * useV / 2), halfW / Math.tan(hf / 2));
  if (v === 'room') {
    const tgt = new Vector3(5.1, 1.55, 4.2), dir = new Vector3(1, 0.86, 1.08).normalize();
    return { tgt, pos: tgt.clone().addScaledVector(dir, fit(aspect < 0.8 ? 7.4 : 6.5, 5.6)) };
  }
  if (v === 'shelf') {
    // plan x range to show: the bookcase, plus the pile on its left when there is one
    const left = fr.pile ? PILE_X - 47 : BX - 30, right = BX + BW + 30;
    const bh = caseHeight(fr.shelfCount) * U, tgt = new Vector3((left + right) / 2 * U, bh / 2, BD * U);
    const d = fit((right - left) * U / 2, bh * 0.56);
    return { tgt, pos: tgt.clone().add(new Vector3(0, d * 0.1, d)) };
  }
  const tgt = DESK_SPOT.clone().add(new Vector3(0, 0.02, 0)), dir = new Vector3(1, 1.5, 0.12).normalize();
  return { tgt, pos: tgt.clone().addScaledVector(dir, fit(0.65, 0.55)) };
}

export class CameraRig {
  view: View = 'room';
  private readonly target = new Vector3();
  private readonly camera: PerspectiveCamera;
  private readonly framing: () => Framing;

  constructor(camera: PerspectiveCamera, framing: () => Framing) {
    this.camera = camera;
    this.framing = framing;
  }

  // Move the camera to a view; instant = jump without animation.
  setView(v: View, instant = false, dur = 1150): void {
    this.view = v;
    const p = viewParams(this.camera, v, this.framing());
    if (instant) {
      this.camera.position.copy(p.pos); this.target.copy(p.tgt); this.camera.lookAt(this.target);
      requestRender();
      return;
    }
    const fp = this.camera.position.clone(), ft = this.target.clone();
    tween(dur, k => {
      this.camera.position.lerpVectors(fp, p.pos, k);
      this.target.lerpVectors(ft, p.tgt, k);
      this.camera.lookAt(this.target);
    }, undefined, 'cam');
  }

  // Opening shot: start a bit off to the side, then glide into the room view.
  intro(): void {
    const p = viewParams(this.camera, 'room', this.framing());
    this.target.copy(p.tgt);
    this.camera.position.copy(p.pos).add(new Vector3(1.2, 0.6, -1.4));
    this.camera.lookAt(this.target);
    this.setView('room', false, 1400);
  }
}
