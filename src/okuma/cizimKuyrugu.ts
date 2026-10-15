// Drawing control for the reader (task 3.7, no DOM, so it can be tested with fake timers).

export interface Timers {
  set(fn: () => void, ms: number): number;
  clear(id: number | undefined): void;
}
const realTimers: Timers = { set: (fn, ms) => window.setTimeout(fn, ms), clear: id => clearTimeout(id) };

// Runs `run` once things have been quiet for `ms`: every poke() during a gesture starts the wait again.
export class Debouncer {
  private id: number | undefined;
  constructor(private ms: number, private run: () => void, private timers: Timers = realTimers) {}

  poke(): void {
    this.timers.clear(this.id);
    this.id = this.timers.set(() => { this.id = undefined; this.run(); }, this.ms);
  }

  cancel(): void {
    this.timers.clear(this.id);
    this.id = undefined;
  }

  get waiting(): boolean { return this.id !== undefined; }
}

export interface Cancelable { cancel(): void }

// At most one drawing per key (page) at a time: a new one cancels the one still running.
export class SingleFlight<K> {
  private jobs = new Map<K, Cancelable>();

  start<J extends Cancelable>(key: K, job: J): J {
    const old = this.jobs.get(key);
    if (old && old !== job) old.cancel();
    this.jobs.set(key, job);
    return job;
  }

  // The job is over (done, failed or cancelled): forget it if it is still the current one.
  done(key: K, job: Cancelable): void {
    if (this.jobs.get(key) === job) this.jobs.delete(key);
  }

  isCurrent(key: K, job: Cancelable): boolean {
    return this.jobs.get(key) === job;
  }

  cancelAll(): void {
    for (const j of this.jobs.values()) j.cancel();
    this.jobs.clear();
  }

  get size(): number { return this.jobs.size; }
}
