// Shared "something changed, draw again" flag. The loop skips frames while it is false.
// paused: the reader covers the scene, so don't draw it (unless something animates).
export const frame = { dirty: true, paused: false };

export function requestRender(): void {
  frame.dirty = true;
}
