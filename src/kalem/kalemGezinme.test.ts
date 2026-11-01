import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PenInput, type PenHost } from './kalemModu';
import { ZoomController } from '../okuma/zoomKontrol';

vi.mock('./kalemOlcum', () => ({ kalemOlcer: null }));

// Minimal event surfaces: capture listeners run before bubble listeners, as on the actual scroller.
class Surface {
  style = { transform: '', transformOrigin: '' };
  classList = { toggle: vi.fn() };
  scrollLeft = 0;
  scrollTop = 0;
  scrollBy = vi.fn((x: number, y: number) => { this.scrollLeft += x; this.scrollTop += y; });
  private listeners = new Map<string, { capture: boolean; fn: (e: Event) => void }[]>();
  addEventListener(type: string, fn: (e: Event) => void, options?: boolean | AddEventListenerOptions): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ capture: options === true || (typeof options === 'object' && !!options.capture), fn });
    this.listeners.set(type, list);
  }
  closest(): null { return null; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
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
  frames = new Map(); let id = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('window', { setTimeout: () => 1 });
});
afterEach(() => { vi.unstubAllGlobals(); });

function setup(known: boolean, mode: 'pdf' | 'kitap' = 'pdf', storageFails = false) {
  const storage = { getItem: vi.fn(() => { if (storageFails) throw Error('storage'); return known ? '1' : null; }),
    setItem: vi.fn(() => { if (storageFails) throw Error('storage'); }) };
  vi.stubGlobal('localStorage', storage);
  const root = new Surface(), scroller = new Surface(), book = new Surface(), pages = new Surface();
  let pen: PenInput;
  const swipe = vi.fn(), tap = vi.fn(() => false), pdfZoom = vi.fn();
  const zoom = new ZoomController(root.element(), book.element(), new Surface().element(), scroller.element(), pages.element(), {
    mode: () => mode, hasPages: () => true, pdfZoom, settled() {}, tap,
    swipe: dir => { if (!pen.active || pen.penSeen) swipe(dir); },
    penOwns: id => pen.owns(id), penIgnores: id => pen.ignores(id),
    penBlocksGestures: () => pen.blocksGestures(), fingerPan: () => pen.active && pen.penSeen && mode === 'pdf',
  });
  const host: PenHost = { pageAt: () => null, pageAtPoint: () => null, tool: () => 'kalem',
    style: () => ({ arac: 'kalem', renk: '#000', kalinlik: 1, opaklik: 1 }), add() {}, erase() {}, eraseEnd() {}, eraseCancel() {},
    penSeen() {}, fingerPan: () => mode === 'pdf', scroller: scroller.element() };
  pen = new PenInput([scroller.element(), book.element()], host); pen.active = true;
  const area = mode === 'pdf' ? scroller : book;
  const pointer = (type: string, id: number, x: number, y = 0, width = 63, pointerType = 'touch', time = 1000) =>
    area.emit(type, { pointerId: id, pointerType, button: 0, clientX: x, clientY: y, width, timeStamp: time });
  const touch = (type: string, id: number, radius: number, x = 0, remaining = 1) => {
    const contact = { identifier: id, radiusX: radius, clientX: x, clientY: 0 };
    return area.emit(type, { changedTouches: [contact], touches: Array.from({ length: remaining }, () => contact), timeStamp: 1000 });
  };
  return { pen, zoom, scroller, pages, root, pointer, touch, swipe, tap, pdfZoom, storage };
}

describe('pen and zoom event coordination', () => {
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
