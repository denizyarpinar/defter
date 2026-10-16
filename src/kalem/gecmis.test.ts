import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, UndoStack, locative } from './gecmis';

// Task 4.7: undo / redo list, the toast's Turkish suffix

describe('UndoStack', () => {
  it('undo, redo; a new operation clears the redo list', () => {
    const h = new UndoStack<number>();
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
    h.push(1); h.push(2);
    expect(h.undo()).toBe(2);
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(2);
    expect(h.redo()).toBeNull();
    expect(h.undo()).toBe(2);
    h.push(3);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeNull();
  });

  it(`at most ${HISTORY_LIMIT}: the oldest goes`, () => {
    const h = new UndoStack<number>();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h.push(i);
    let n = 0, last = 0;
    for (let op; (op = h.undo()) !== null; n++) last = op;
    expect(n).toBe(HISTORY_LIMIT);
    expect(last).toBe(6);
  });
});

describe('locative', () => {
  it('follows how the number is read', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(locative)).toEqual(["1'de", "2'de", "3'te", "4'te", "5'te", "6'da", "7'de", "8'de", "9'da"]);
    expect([10, 20, 30, 40, 50, 60, 70, 80, 90].map(locative)).toEqual(["10'da", "20'de", "30'da", "40'ta", "50'de", "60'ta", "70'te", "80'de", "90'da"]);
    expect([12, 43, 100, 200, 1000, 0].map(locative)).toEqual(["12'de", "43'te", "100'de", "200'de", "1000'de", "0'da"]);
  });
});
