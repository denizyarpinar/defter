// Undo / redo (task 4.7): one history for the whole reader session (all files). No DOM, so it can be tested.

export const HISTORY_LIMIT = 200;

export class UndoStack<Op> {
  private done: Op[] = [];
  private undone: Op[] = [];

  constructor(private limit = HISTORY_LIMIT) {}

  // A new operation: the redo list is gone. Over the limit, the oldest can't be undone any more.
  push(op: Op): void {
    this.done.push(op);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  // The operation to undo (it moves to the redo list), or null
  undo(): Op | null {
    const op = this.done.pop();
    if (op === undefined) return null;
    this.undone.push(op);
    return op;
  }

  redo(): Op | null {
    const op = this.undone.pop();
    if (op === undefined) return null;
    this.done.push(op);
    return op;
  }

  // Task 6.4e-4: the operation undo() / redo() would take, without taking it
  get nextUndo(): Op | undefined { return this.done[this.done.length - 1]; }
  get nextRedo(): Op | undefined { return this.undone[this.undone.length - 1]; }

  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }

  // Every operation, done and undone (task 4.8b: a file's key changes after an upload)
  each(fn: (op: Op) => void): void {
    this.done.forEach(fn);
    this.undone.forEach(fn);
  }

  clear(): void {
    this.done = [];
    this.undone = [];
  }
}

// Turkish locative suffix after a number: 3'te, 6'da, 40'ta, 100'de (it follows how the number is read)
const ONES = ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'];       // bir iki üç dört beş altı yedi sekiz dokuz
const TENS = ['', 'da', 'de', 'da', 'ta', 'de', 'ta', 'te', 'de', 'da'];       // on yirmi otuz kırk elli altmış yetmiş seksen doksan

export function locative(n: number): string {
  n = Math.abs(Math.trunc(n));
  let ek: string;
  if (n === 0) ek = 'da';                       // sıfır
  else if (n % 10) ek = ONES[n % 10];
  else if (n % 100) ek = TENS[(n / 10) % 10];
  else if (n % 1000) ek = 'de';                 // yüz
  else if (n % 1e6) ek = 'de';                  // bin
  else ek = 'da';                               // milyon
  return `${n}'${ek}`;
}
