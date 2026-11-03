import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PenInput, type PenHost } from './kalemModu';
import { ZoomController } from '../okuma/zoomKontrol';
import { toast } from '../ui/toast';

vi.mock('./kalemOlcum', () => ({ kalemOlcer: null }));
vi.mock('../ui/toast', () => ({ toast: vi.fn() }));

// Minimal event surfaces: capture listeners run before bubble listeners, as on the actual scroller.
class Surface {
  style = { transform: '', transformOrigin: '' };
  classList = { toggle: vi.fn() };
  scrollLeft = 0;
  scrollTop = 0;
  offsetWidth = 600;
  offsetHeight = 800;
  clientWidth = 600;
  clientHeight = 800;
  setPointerCapture(): void {}
  scrollBy = vi.fn((x: number, y: number) => { this.scrollLeft += x; this.scrollTop += y; });
  private listeners = new Map<string, { capture: boolean; fn: (e: Event) => void }[]>();
  addEventListener(type: string, fn: (e: Event) => void, options?: boolean | AddEventListenerOptions): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ capture: options === true || (typeof options === 'object' && !!options.capture), fn });
    this.listeners.set(type, list);
  }
  closest(): null { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 800 }; }
  emit(type: string, props: Record<string, unknown>): Event {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: this }, currentTarget: { value: this } });
    for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of [...listeners.filter(l => l.capture), ...listeners.filter(l => !l.capture)]) listener.fn(event);
    return event;
  }
  element(): HTMLElement { return this as unknown as HTMLElement; }
}

let frames: Map<number, FrameRequestCallback>;
function flushFrames(): void { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(0); }

beforeEach(() => {
  vi.mocked(toast).mockClear();
  frames = new Map(); let id = 0;
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('window', Object.assign(new Surface(), { setTimeout: () => 1 }));
  vi.stubGlobal('document', Object.assign(new Surface(), { hidden: false }));
  vi.stubGlobal('location', { search: '' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(known: boolean, mode: 'pdf' | 'kitap' = 'pdf', storageFails = false) {
  const values = new Map<string, string>(known ? [['defter-kalem-var', '1']] : []);
  const storage = { getItem: vi.fn((key: string) => { if (storageFails) throw Error('storage'); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => { if (storageFails) throw Error('storage'); values.set(key, value); }),
    removeItem: vi.fn((key: string) => { if (storageFails) throw Error('storage'); values.delete(key); }) };
  vi.stubGlobal('localStorage', storage);
  const root = new Surface(), scroller = new Surface(), book = new Surface(), pages = new Surface();
  let pen: PenInput;
  const swipe = vi.fn(), tap = vi.fn(() => false), pdfZoom = vi.fn();
  const zoom = new ZoomController(root.element(), book.element(), new Surface().element(), scroller.element(), pages.element(), {
    mode: () => mode, hasPages: () => true, pdfZoom, settled() {}, tap,
    swipe: dir => { if (!pen.active || pen.penMode) swipe(dir); },
    penOwns: id => pen.owns(id), penIgnores: id => pen.ignores(id),
    penBlocksGestures: () => pen.blocksGestures(), fingerPan: () => pen.active && pen.penMode && mode === 'pdf',
  });
  const host: PenHost = { pageAt: () => null, pageAtPoint: () => null, tool: () => 'kalem',
    style: () => ({ arac: 'kalem', renk: '#000', kalinlik: 1, opaklik: 1 }), add() {}, erase() {}, eraseEnd() {}, eraseCancel() {},
    penSeen() {}, elModuDegisti: vi.fn(), fingerPan: () => mode === 'pdf', scroller: scroller.element() };
  pen = new PenInput([scroller.element(), book.element()], host); pen.active = true;
  const area = mode === 'pdf' ? scroller : book;
  const pointer = (type: string, id: number, x: number, y = 0, width = 63, pointerType = 'touch', time = 1000, isPrimary = false) =>
    area.emit(type, { pointerId: id, pointerType, button: 0, clientX: x, clientY: y, width, timeStamp: time, isPrimary });
  const touch = (type: string, id: number, radius: number, x = 0, remaining = 1) => {
    const contact = { identifier: id, radiusX: radius, clientX: x, clientY: 0 };
    return area.emit(type, { changedTouches: [contact], touches: Array.from({ length: remaining }, () => contact), timeStamp: 1000 });
  };
  return { pen, zoom, scroller, pages, root, pointer, touch, swipe, tap, pdfZoom, storage, host };
}

describe('E-1 PenInput', () => {
  it('remembers, restores and removes the finger preference', () => {
    const s = setup(true); s.pen.setElModu(true);
    expect(s.storage.setItem).toHaveBeenCalledWith('defter-el-modu', '1');
    const restored = new PenInput([], s.host); expect(restored.elModu).toBe(true);
    restored.setElModu(false);
    expect(s.storage.removeItem).toHaveBeenCalledWith('defter-el-modu');
    expect(s.pen.penSeen).toBe(true);
  });
  it('notifies once when Pencil ends finger mode', () => {
    const s = setup(true); s.pen.setElModu(true); vi.mocked(s.host.elModuDegisti).mockClear();
    s.pointer('pointerdown', 1, 0, 0, 1, 'pen');
    expect(s.pen.elModu).toBe(false);
    expect(s.host.elModuDegisti).toHaveBeenCalledExactlyOnceWith(false);
    expect(s.storage.removeItem).toHaveBeenCalledWith('defter-el-modu');
  });
  it('uses the old two finger pan and does not block broad touches in finger mode', () => {
    const s = setup(true); s.pen.setElModu(true);
    s.pointer('pointerdown', 1, 0, 0, 104); s.touch('touchstart', 101, 52);
    expect(s.pen.blocksGestures()).toBe(false);
    s.pointer('pointerdown', 2, 200); s.pointer('pointermove', 1, 20); s.pointer('pointermove', 2, 220);
    expect(s.scroller.scrollBy.mock.calls).toEqual([[-10, 0], [-10, 0]]);
  });
  it('ignores stored and requested finger mode under the rollback switch', () => {
    const s = setup(true); s.pen.setElModu(true);
    vi.stubGlobal('location', { search: '?elModu=0' });
    const restored = new PenInput([], s.host); restored.setElModu(true);
    expect(restored.elModu).toBe(false); expect(restored.penMode).toBe(true);
  });
  it('works in memory when storage is unavailable', () => {
    const s = setup(true, 'pdf', true);
    expect(() => s.pen.setElModu(true)).not.toThrow(); expect(s.pen.elModu).toBe(true);
    expect(() => s.pen.setElModu(false)).not.toThrow(); expect(s.pen.elModu).toBe(false);
  });
  it.each(['touch', 'pen', 'mouse'])('only cancels an ongoing finger stroke when toggled (%s)', type => {
    const s = setup(true); const svg = { remove: vi.fn() };
    const live = { id: 99, pen: type === 'pen', svg, pdf: [], raf: 0, box: { releasePointerCapture() {} } };
    const state = s.pen as unknown as { live: unknown; fingers: Map<number, { x: number; y: number }> }; state.live = live;
    if (type === 'touch') state.fingers.set(99, { x: 0, y: 0 });
    s.pen.setElModu(true);
    expect(state.live).toBe(type === 'touch' ? null : live);
  });
  it('shows the opening toast once, stays silent on manual off, and reports Pencil return', () => {
    const s = setup(true);
    s.pen.setElModu(true); s.pen.setElModu(true);
    expect(toast).toHaveBeenCalledExactlyOnceWith('Parmakla yazma açık. Kalem değince kapanır.');
    s.pen.setElModu(false); expect(toast).toHaveBeenCalledTimes(1);
    s.pen.setElModu(true); s.pointer('pointerdown', 1, 0, 0, 1, 'pen');
    expect(toast).toHaveBeenLastCalledWith('Kalem algılandı: parmak yeniden kaydırır.');
  });
  it('logs changes once per transition only with ?olcum=1', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const s = setup(true); s.pen.setElModu(true); expect(log).not.toHaveBeenCalled();
    vi.stubGlobal('location', { search: '?olcum=1' });
    s.pen.setElModu(false); s.pen.setElModu(true); s.pen.setElModu(true);
    s.pointer('pointerdown', 1, 0, 0, 1, 'pen');
    expect(log.mock.calls).toEqual([
      ['el-modu', { on: false, kaynak: 'dugme' }], ['el-modu', { on: true, kaynak: 'dugme' }],
      ['el-modu', { on: false, kaynak: 'kalem' }],
    ]);
  });
});

describe('pen and zoom event coordination', () => {
  it('removes the old point at 1500 ms without requiring a new primary touch (K4)', () => {
    const s = setup(true);
    s.pointer('pointerdown', 99, 500);
    vi.mocked(performance.now).mockReturnValue(2000);
    s.pointer('pointerdown', 1, 0); s.pointer('pointerdown', 2, 200);
    vi.mocked(performance.now).mockReturnValue(2500);
    s.pointer('pointermove', 1, 0); // only 99 is now idle for 1500 ms
    s.pointer('pointermove', 2, 240); flushFrames();
    expect(s.pages.style.transform).toBe('scale(1.2)');
  });

  it('keeps ghost contacts and the old blocked behavior with ?bayat=0', () => {
    vi.stubGlobal('location', { search: '?bayat=0' });
    const s = setup(true);
    s.pointer('pointerdown', 99, 500);
    s.pointer('pointerdown', 1, 0, 0, 63, 'touch', 1000, true);
    s.pointer('pointerdown', 2, 200);
    vi.mocked(performance.now).mockReturnValue(5000);
    s.pointer('pointermove', 2, 240); flushFrames();
    expect(s.pages.style.transform).toBe('');
    expect((s.zoom as unknown as { pts: Map<number, unknown> }).pts.size).toBe(3);
    (window as unknown as Surface).emit('blur', {});
    expect((s.zoom as unknown as { pts: Map<number, unknown> }).pts.size).toBe(3);
  });

  it('ends the waiting gesture when timeout recovery leaves only one fresh finger', () => {
    const s = setup(true);
    s.pointer('pointerdown', 98, 300); s.pointer('pointerdown', 99, 500);
    vi.mocked(performance.now).mockReturnValue(2500);
    s.pointer('pointerdown', 1, 0);
    expect([...(s.zoom as unknown as { pts: Map<number, unknown> }).pts.keys()]).toEqual([1]);
    expect((s.zoom as unknown as { busy: boolean }).busy).toBe(false);
    s.pointer('pointermove', 1, -100); flushFrames();
    expect(s.pages.style.transform).toBe('');
  });

  it.each(['blur', 'pagehide', 'visibilitychange'])('clears a stale Safari preview and palm state on %s', type => {
    const s = setup(true);
    s.root.emit('gesturestart', { scale: 1, clientX: 0, clientY: 0 });
    s.root.emit('gesturechange', { scale: 1.5 });
    s.pointer('pointerdown', 99, 500, 0, 104);
    s.touch('touchstart', 199, 52, 500);
    if (type === 'visibilitychange') {
      Object.assign(document, { hidden: true });
      (document as unknown as Surface).emit(type, {});
    } else (window as unknown as Surface).emit(type, {});
    expect(s.zoom.z).toBe(1.5);
    expect(s.pages.style.transform).toBe('');
    expect(s.pen.blocksGestures()).toBe(false);
    expect((s.zoom as unknown as { busy: boolean }).busy).toBe(false);
  });

  it('cleans a window release without triggering a tap or swipe', () => {
    const s = setup(true, 'kitap');
    s.pointer('pointerdown', 99, 100);
    (window as unknown as Surface).emit('pointerup', { pointerId: 99, pointerType: 'touch', clientX: 0, clientY: 0, timeStamp: 1000 });
    expect(s.swipe).not.toHaveBeenCalled(); expect(s.tap).not.toHaveBeenCalled();
    expect((s.zoom as unknown as { pts: Map<number, unknown> }).pts.size).toBe(0);
  });

  it('clears stale touch rejection on a fresh touchstart, including when pointerdown was missed', () => {
    const s = setup(true);
    s.touch('touchstart', 199, 52);
    expect(s.pen.blocksGestures()).toBe(true);
    expect(s.touch('touchstart', 200, 20).defaultPrevented).toBe(false);
    expect(s.pen.blocksGestures()).toBe(false);
  });

  it('keeps double tap zoom and zoomed book dragging', () => {
    const s = setup(true, 'kitap');
    s.pointer('pointerdown', 1, 100); s.pointer('pointerup', 1, 100);
    vi.mocked(performance.now).mockReturnValue(1100);
    s.pointer('pointerdown', 2, 100, 0, 63, 'touch', 1100, true); s.pointer('pointerup', 2, 100);
    expect(s.zoom.zoomed).toBe(true);
    s.pointer('pointerdown', 3, 100, 0, 63, 'touch', 1100, true);
    s.pointer('pointermove', 3, 120); s.pointer('pointerup', 3, 120);
    expect(s.swipe).not.toHaveBeenCalled();
  });

  it.each([false, true])('cancels only stale finger drawing on primary touch (pen=%s)', pen => {
    const s = setup(true);
    s.pointer('pointerdown', 99, 500);
    const svg = { remove: vi.fn() };
    const live = { id: 99, pen, svg, pdf: [], raf: 0, box: { releasePointerCapture() {} } };
    const state = s.pen as unknown as { live: unknown };
    state.live = live;
    s.pointer('pointerdown', 1, 0, 0, 63, 'touch', 1000, true);
    expect(state.live).toBe(pen ? live : null);
    expect(svg.remove).toHaveBeenCalledTimes(pen ? 0 : 1);
  });

  it('does not consume a normal release in window capture', () => {
    const s = setup(true, 'kitap');
    s.pointer('pointerdown', 1, 100);
    (window as unknown as Surface).emit('pointerup', { pointerId: 1, pointerType: 'touch',
      composedPath: () => [s.scroller, window] });
    expect((s.zoom as unknown as { pts: Map<number, unknown> }).pts.size).toBe(1);
    s.pointer('pointerup', 1, 100);
    expect(s.tap).toHaveBeenCalledTimes(1);
  });

  it('H1: recovers two-finger pinch after a lost release and a new primary touch', () => {
    const s = setup(true);
    s.pointer('pointerdown', 99, 500); // detached target: no release reaches the reader
    s.pointer('pointerdown', 1, 0, 0, 63, 'touch', 1000, true);
    expect([...(s.zoom as unknown as { pts: Map<number, unknown> }).pts.keys()]).toEqual([1]);
    s.pointer('pointerdown', 2, 200);
    s.pointer('pointermove', 2, 240); flushFrames();
    expect(s.pages.style.transform).toBe('scale(1.2)');
    s.pointer('pointerup', 2, 240);
    expect(s.zoom.z).toBe(1.2);
  });

  it('H2: a new single finger never pinches against a ghost contact', () => {
    const s = setup(true);
    s.pointer('pointerdown', 99, 500);
    s.pointer('pointerdown', 1, 0, 0, 63, 'touch', 1000, true);
    s.pointer('pointermove', 1, -100); flushFrames();
    expect(s.pages.style.transform).toBe('');
    s.pointer('pointerup', 1, -100);
    expect(s.zoom.z).toBe(1);
    expect(s.pdfZoom).not.toHaveBeenCalled();
  });

  it('keeps the old two-finger list pan when a pen has never been seen', () => {
    const s = setup(false);
    s.pointer('pointerdown', 1, 0); s.pointer('pointerdown', 2, 200);
    s.pointer('pointermove', 1, 20); s.pointer('pointermove', 2, 220);
    expect(s.pen.penSeen).toBe(false);
    expect(s.scroller.scrollBy.mock.calls).toEqual([[-10, 0], [-10, 0]]);
    expect(frames.size).toBe(0); // existing immediate PenInput path, no new threshold
  });

  it('pans once per frame without pinch jitter; after pinch and release the next gesture pans again', () => {
    const s = setup(true);
    s.pointer('pointerdown', 1, 0); s.pointer('pointerdown', 2, 200);
    s.pointer('pointermove', 1, 20); s.pointer('pointermove', 2, 220); flushFrames();
    expect(s.scroller.scrollBy.mock.calls).toEqual([[-20, 0]]);
    expect(s.pages.style.transform).toBe('');
    s.pointer('pointermove', 2, 260); flushFrames();
    expect(s.pages.style.transform).toBe('scale(1.2)');
    expect(s.scroller.scrollBy).toHaveBeenCalledTimes(1);
    s.root.emit('gesturestart', { scale: 1, clientX: 140, clientY: 0 });
    s.root.emit('gesturechange', { scale: 2, clientX: 140, clientY: 0 });
    expect(s.pages.style.transform).toBe('scale(1.2)');
    s.pointer('pointerup', 1, 20); s.pointer('pointerup', 2, 260);
    s.root.emit('gestureend', {});
    expect(s.zoom.z).toBe(1.2);
    s.pointer('pointerdown', 3, 0); s.pointer('pointerdown', 4, 240);
    s.pointer('pointermove', 3, 20); s.pointer('pointermove', 4, 260); flushFrames();
    expect(s.scroller.scrollBy.mock.calls).toEqual([[-20, 0], [-20, 0]]);
    expect(s.zoom.z).toBe(1.2);
    expect(s.pages.style.transform).toBe('');
  });

  it('blocks a palm touch and Safari gesture, and keeps radius-only rejection until touchend', () => {
    const s = setup(true);
    s.pointer('pointerdown', 1, 0, 0, 104);
    expect(s.touch('touchstart', 101, 52).defaultPrevented).toBe(true);
    expect(s.touch('touchmove', 101, 10).defaultPrevented).toBe(true);
    s.root.emit('gesturestart', { scale: 1, clientX: 0, clientY: 0 });
    s.root.emit('gesturechange', { scale: 2, clientX: 0, clientY: 0 });
    expect(s.pages.style.transform).toBe('');
    expect(s.pdfZoom).not.toHaveBeenCalled();
    expect(s.scroller.scrollBy).not.toHaveBeenCalled();
  });

  it('blocks the second finger touchstart only on the pen-known PDF path', () => {
    for (const known of [false, true]) {
      const s = setup(known);
      s.pointer('pointerdown', 1, 0); s.touch('touchstart', 101, 31.5);
      s.pointer('pointerdown', 2, 200);
      expect(s.touch('touchstart', 102, 42, 200, 2).defaultPrevented).toBe(known);
    }
  });

  it('uses touch radius growth to suppress a pointer even when its reported width stays small', () => {
    const s = setup(true, 'kitap');
    s.pointer('pointerdown', 1, 100);
    expect(s.touch('touchstart', 101, 31.5, 100).defaultPrevented).toBe(false);
    s.pointer('pointermove', 1, 0);
    expect(s.touch('touchmove', 101, 60, 0).defaultPrevented).toBe(true);
    s.pointer('pointerup', 1, 0);
    expect(s.swipe).not.toHaveBeenCalled();
  });

  it('allows a known-pen finger swipe, but rejects a growing palm and cooldown swipe', () => {
    const s = setup(true, 'kitap');
    s.pointer('pointerdown', 1, 100); s.pointer('pointerup', 1, 0);
    expect(s.swipe).toHaveBeenCalledExactlyOnceWith(1);
    s.pointer('pointerdown', 2, 100); s.pointer('pointermove', 2, 0, 0, 130); s.pointer('pointerup', 2, 0);
    s.pointer('pointerdown', 3, 0, 0, 1, 'pen', 0); s.pointer('pointerup', 3, 0, 0, 1, 'pen', 100);
    s.pointer('pointerdown', 4, 100, 0, 63, 'touch', 300); s.pointer('pointerup', 4, 0, 0, 63, 'touch', 350);
    expect(s.swipe).toHaveBeenCalledTimes(1);
  });

  it('keeps pen-mode-off contacts and Safari trackpad gestures outside the new path', () => {
    const s = setup(true); s.pen.active = false;
    s.pointer('pointerdown', 1, 0, 0, 272);
    expect(s.touch('touchstart', 101, 136).defaultPrevented).toBe(false);
    expect(s.pen.ignores(1)).toBe(false);
    s.pointer('pointerup', 1, 0);
    s.root.emit('gesturestart', { scale: 1, clientX: 0, clientY: 0 });
    s.root.emit('gesturechange', { scale: 2, clientX: 0, clientY: 0 });
    s.root.emit('gestureend', {});
    expect(s.zoom.z).toBe(2);
  });

  it('handles unavailable storage without breaking pen detection', () => {
    const s = setup(false, 'pdf', true);
    expect(() => s.pointer('pointerdown', 1, 0, 0, 1, 'pen')).not.toThrow();
    expect(s.pen.penSeen).toBe(true);
    expect(s.storage.setItem).toHaveBeenCalledWith('defter-kalem-var', '1');
  });

  it('does not leave Safari gestures blocked after a cancelled palm and pen mode being turned off', () => {
    const s = setup(true);
    s.pointer('pointerdown', 1, 0, 0, 104);
    s.root.emit('gesturestart', { scale: 1 });
    s.pointer('pointercancel', 1, 0, 0, 104);
    s.pen.active = false;
    // Safari may omit gestureend on the cancelled contact; a new gesture is independent.
    s.root.emit('gesturestart', { scale: 1, clientX: 0, clientY: 0 });
    s.root.emit('gesturechange', { scale: 1.5 });
    s.root.emit('gestureend', {});
    expect(s.zoom.z).toBe(1.5);
  });
});
