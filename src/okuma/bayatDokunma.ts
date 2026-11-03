// Z-1: shared rollback switch and DOM-free recovery decisions.
export const BAYAT_TEMIZLE = true;

export function staleTouchEnabled(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return BAYAT_TEMIZLE && new URLSearchParams(search).get('bayat') !== '0';
}

export function startsTouchSequence(type: string, primary: boolean): boolean {
  return type === 'touch' && primary;
}

export function staleTouchIds(points: ReadonlyMap<number, { last: number }>, now: number, active: boolean): number[] {
  if (active || points.size < 3) return [];
  return [...points].filter(([, point]) => now - point.last >= 1500).map(([id]) => id);
}

export function logStaleTouch(source: string, removed: number): void {
  if (removed && typeof location !== 'undefined' && new URLSearchParams(location.search).get('olcum') === '1') {
    console.info('zoom-bayat', { kaynak: source, silinen: removed });
  }
}

// Local listeners keep normal taps / strokes. The capture fallback only handles events
// whose path misses those areas, so it cannot consume a normal pointerup first.
export function watchTouchRecovery(areas: HTMLElement[], end: (e: PointerEvent) => void, reset: (source: string) => void): void {
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, event => {
      if (!staleTouchEnabled() || event.composedPath().some(node => areas.includes(node as HTMLElement))) return;
      end(event as PointerEvent);
    }, { capture: true, passive: true });
  }
  for (const type of ['blur', 'pagehide']) {
    window.addEventListener(type, () => { if (staleTouchEnabled()) reset(type); });
  }
  document.addEventListener('visibilitychange', () => {
    if (staleTouchEnabled() && document.hidden) reset('hidden');
  });
}
