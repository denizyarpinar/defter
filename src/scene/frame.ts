// Shared "something changed, draw again" flag. The loop skips frames while it is false.
export const frame = { dirty: true };

export function requestRender(): void {
  frame.dirty = true;
}
