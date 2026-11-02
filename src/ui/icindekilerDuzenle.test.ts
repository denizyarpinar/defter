import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBook } from '../model/parse';
import { IcindekilerDuzenleyici, type IcindekilerBaglami } from './icindekilerDuzenle';

// Browser coverage for DOM, real pointer capture and handles lives in
// scripts/surukle-kontrol.mjs. These exercise the editor's real write/undo path.
function fixture(draw = false) {
  const book = parseBook('b', { surum: 2, uniteler: [
    { baslik: 'A', klasor: 'U1', konular: ['a', 'b', 'c'].map(n => ({ baslik: n, klasor: 'U1/' + n })) },
    { baslik: 'B', klasor: 'U2', konular: [] },
    { baslik: 'C', klasor: 'U3', konular: [] },
  ] });
  const send = vi.fn(), moved = vi.fn((fn: () => void) => fn());
  const context: IcindekilerBaglami = {
    kilitAcik: true, hasJson: () => true, uniteKlasorleri: async () => [],
    gonder: send, bekleyenEklemeler: () => [], durum: () => ({ tur: 'bos' }),
    dinle: () => () => {}, tekrarDene() {}, vazgec() {}, girisYap() {}, copIste() {},
    copBekleyenler: () => [], yonlendir: () => undefined,
  };
  const element = { addEventListener() {}, ownerDocument: { activeElement: null },
    innerHTML: '', querySelector: () => null, replaceChildren() {}, classList: { toggle() {} },
  } as unknown as HTMLElement;
  const editor = new IcindekilerDuzenleyici({ liste: element, durum: element,
    baglam: () => context, yerDegisti: moved, yeniden() {} });
  if (!draw) vi.spyOn(editor, 'ciz').mockImplementation(() => {});
  editor.ac(book);
  const internal = editor as unknown as {
    siraDegistir(place: string, target: number): void;
    tasi(place: string, direction: -1 | 1): void;
    duzenlenen: { tur: 'konu'; u: number; t: number } | null;
  };
  return { book, context, editor, internal, send, moved, element };
}

describe('contents editor reorder writes', () => {
  afterEach(() => vi.useRealTimers());
  it('drop 1→3 sends one insertion order and the original undo', () => {
    vi.useFakeTimers();
    const { book, internal, send, moved } = fixture();
    internal.siraDegistir('k0.0', 2);
    expect(book.uniteler[0].konular.map(t => t.baslik)).toEqual(['b', 'c', 'a']);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(send).toHaveBeenCalledExactlyOnceWith(book,
      { tur: 'konuSirasi', unite: 'k:U1', sira: ['U1/b', 'U1/c', 'U1/a'] },
      { tur: 'konuSirasi', unite: 'k:U1', sira: ['U1/a', 'U1/b', 'U1/c'] });
    expect(moved).toHaveBeenCalledOnce();
  });
  it('arrows and drop share one debounced request and original undo', () => {
    vi.useFakeTimers();
    const { book, internal, send } = fixture();
    internal.tasi('u2', -1);
    vi.advanceTimersByTime(300);
    internal.siraDegistir('u1', 0);
    vi.advanceTimersByTime(800);
    expect(send).toHaveBeenCalledExactlyOnceWith(book,
      { tur: 'uniteSirasi', sira: ['k:U3', 'k:U1', 'k:U2'] },
      { tur: 'uniteSirasi', sira: ['k:U1', 'k:U2', 'k:U3'] });
  });
  it('same position, locked writer and name editing write nothing', () => {
    vi.useFakeTimers();
    const { internal, send, context } = fixture();
    internal.siraDegistir('k0.0', 0);
    internal.duzenlenen = { tur: 'konu', u: 0, t: 0 };
    internal.siraDegistir('k0.0', 2);
    internal.duzenlenen = null;
    context.kilitAcik = false;
    internal.siraDegistir('u0', 1);
    vi.advanceTimersByTime(1000);
    expect(send).not.toHaveBeenCalled();
  });
  it('topic write follows the same unit object after units move', () => {
    vi.useFakeTimers();
    const { book, internal, send } = fixture();
    internal.siraDegistir('k0.0', 2);
    internal.siraDegistir('u0', 2);
    vi.advanceTimersByTime(800);
    expect(send.mock.calls[0][1]).toEqual({ tur: 'konuSirasi', unite: 'k:U1', sira: ['U1/b', 'U1/c', 'U1/a'] });
    expect(book.uniteler[2].konular.map(t => t.baslik)).toEqual(['b', 'c', 'a']);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('pending additions and trash rows never have a handle', () => {
    const { context, book, editor, element } = fixture(true);
    context.bekleyenEklemeler = () => [
      { tur: 'konuEkle', unite: 'k:U1', uniteSira: 0, baslik: 'Pending topic' },
      { tur: 'uniteEkle', baslik: 'Pending unit' },
    ];
    context.copBekleyenler = () => [{ tur: 'konu', konu: 'U1/a' }, { tur: 'unite', klasor: 'U2' }];
    editor.ciz();
    const pending = element.innerHTML.match(/<(?:section|li) class="[^"]*ie-bekliyor[^\n]*?<\/(?:section|li)>/g)!;
    expect(pending).toHaveLength(4);
    for (const row of pending) expect(row).not.toContain('data-surukle');
    expect(element.innerHTML).toContain('data-surukle="k0.1"');
    expect(book.uniteler[0].konular).toHaveLength(3);
  });
  it('redraw requests leave captured markup alone until the gesture ends', () => {
    const { book, editor, element } = fixture(true);
    const original = element.innerHTML;
    const state = editor as unknown as { drag: unknown };
    state.drag = {};
    book.uniteler[0].baslik = 'Queue update';
    editor.ciz(); editor.ciz();
    expect(element.innerHTML).toBe(original);
    state.drag = null;
    editor.ciz();
    expect(element.innerHTML).toContain('Queue update');
  });
});
