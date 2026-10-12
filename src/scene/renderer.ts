import { ACESFilmicToneMapping, ColorManagement, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { frame } from './frame';
import { setMaxAnisotropy } from './textures';
import { hasTweens, runTweens } from './tween';

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

export function createStage(host: HTMLElement): Stage {
  // r128 treated hex colours (0xf3efe8, '#efe6d8') as-is. Since r152 they are converted from sRGB
  // first, which changes every colour. Turning this off keeps the prototype's colours.
  ColorManagement.enabled = false;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  // PCFSoftShadowMap is removed in current three.js; PCFShadowMap is soft now.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, innerWidth / innerHeight, 0.1, 200);
  return { renderer, scene, camera };
}

// Draws only while something moves or changed (iPad battery).
export function startLoop(stage: Stage): void {
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const active = hasTweens();
    runTweens(now);
    if (!active && (!frame.dirty || frame.paused)) return;
    stage.renderer.render(stage.scene, stage.camera);
    frame.dirty = false;
  };
  requestAnimationFrame(loop);
}

export function resizeStage(stage: Stage): void {
  stage.renderer.setSize(innerWidth, innerHeight);
  stage.camera.aspect = innerWidth / innerHeight;
  stage.camera.updateProjectionMatrix();
}
