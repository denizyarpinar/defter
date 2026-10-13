import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { RoomRefs } from './room';

// Dev only (?export=oda): downloads the room as oda-kaynak.glb for Blender (Faz 2 light baking).
// Only the room group: the bookcase, books, lights and camera are not in it.
// The fake contact shadow is left out (Blender computes real shadows); the window sky is exported in its day state.
export async function exportRoom(refs: RoomRefs, nightK: number): Promise<void> {
  refs.contact.visible = false;
  refs.sky.draw(0);
  try {
    const glb = await new GLTFExporter().parseAsync(refs.group, { binary: true, onlyVisible: true });
    const url = URL.createObjectURL(new Blob([glb as ArrayBuffer], { type: 'model/gltf-binary' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oda-kaynak.glb';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } finally {
    refs.contact.visible = true;
    refs.sky.draw(nightK);
  }
}
