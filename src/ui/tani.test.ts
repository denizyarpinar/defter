import { describe, expect, it } from 'vitest';
import { MAX_ERRORS, errorText, pushError } from './hataKutusu';
import { canvasLine, noteRender, setCanvasStats, slowestRender } from './tani';

describe('error box', () => {
  it('keeps the last 5 errors', () => {
    let list: string[] = [];
    for (let k = 1; k <= 7; k++) list = pushError(list, `hata ${k}`);
    expect(list).toHaveLength(MAX_ERRORS);
    expect(list[0]).toBe('hata 3');
    expect(list[4]).toBe('hata 7');
  });

  it('turns errors and rejection reasons into one line', () => {
    expect(errorText(new Error('Sayfa çizilemedi'))).toBe('Sayfa çizilemedi');
    expect(errorText(new TypeError('x is undefined'))).toBe('TypeError: x is undefined');
    expect(errorText('düz metin')).toBe('düz metin');
    expect(errorText({ kod: 5 })).toBe('{"kod":5}');
    expect(errorText('a'.repeat(1000))).toHaveLength(300);
  });
});

describe('fps box numbers', () => {
  it('slowest drawing of the last 5 seconds', () => {
    noteRender(40, 1000);
    noteRender(180, 2000);
    noteRender(60, 6500);
    expect(slowestRender(6500)).toBe(180);
    expect(slowestRender(7100)).toBe(60);    // the 180 ms one is older than 5 s now
    expect(slowestRender(20000)).toBeNull();
  });

  it('canvas line', () => {
    setCanvasStats(6, 18_400_000);
    noteRender(141.6, 30000);
    expect(canvasLine(30000)).toBe('canvas 6 · 18.4 MP · en yavaş çizim 142 ms');
    expect(canvasLine(99999)).toBe('canvas 6 · 18.4 MP · en yavaş çizim –');
  });
});
