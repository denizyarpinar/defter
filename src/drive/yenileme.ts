// Renewal state machine. No DOM, storage or GIS dependency; all effects are injected.
export type RenewalReason = 'zamanlayici' | 'freshToken' | '401' | 'bant';
export type BannerState = 'hidden' | 'continue' | 'retry' | 'busy';
export const yenilemeAcik = (enabled: boolean, search: string): boolean => enabled && new URLSearchParams(search).get('yenile') !== '0';
export function tokenOmru(seconds: number, search: string): number {
  const limit = Number(new URLSearchParams(search).get('tokenSure'));
  return Number.isFinite(limit) && limit >= 120 && limit <= 3600 ? Math.min(seconds, limit) : seconds;
}
export const yenilemeZamani = (expiresAt: number, acquiredAt: number): number =>
  expiresAt - Math.min(300_000, (expiresAt - acquiredAt) / 3);

interface RenewalEffects {
  now(): number;
  later(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
  visible(): boolean;
  signIn(reason: RenewalReason): Promise<string>;
  cancelRequest(): void;
  banner(state: BannerState): void;
  log(event: string, detail?: Record<string, string | number>): void;
}

export class Renewal {
  private timer?: ReturnType<typeof setTimeout>;
  private timeout?: ReturnType<typeof setTimeout>;
  private due = Infinity;
  private tried = false;
  private active = false;
  private generation = 0;
  private waiting = 0;
  private gate?: { promise: Promise<string>; resolve(value: string): void; reject(error: Error): void };
  constructor(private readonly effects: RenewalEffects) {}

  get isWaiting(): boolean { return this.gate !== undefined; }

  accept(expiresAt: number, acquiredAt: number): void {
    if (this.timer !== undefined) this.effects.clear(this.timer);
    this.tried = false;
    this.due = yenilemeZamani(expiresAt, acquiredAt);
    this.effects.log('yenile.plan', { kalanSn: Math.max(0, Math.round((expiresAt - this.effects.now()) / 1000)) });
    this.timer = this.effects.later(() => this.check(), Math.max(0, this.due - this.effects.now()));
  }

  check(): void {
    if (this.effects.visible() && !this.tried && this.effects.now() >= this.due) {
      // Timer attempts also own a gate, so Drive requests join the same attempt.
      void this.renew('zamanlayici').catch(() => {});
    }
  }

  renew(reason: RenewalReason): Promise<string> {
    this.waiting++;
    this.effects.log('yenile.bekle', { istek: this.waiting });
    if (!this.gate) {
      let resolve!: (value: string) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
      this.gate = { promise, resolve, reject };
      if (!this.tried && this.effects.visible()) this.attempt(reason);
      else this.show('continue');
    }
    return this.gate!.promise;
  }

  // Intentionally synchronous: GIS must be called before the click handler returns.
  touch(): void {
    if (this.gate && !this.active) this.attempt('bant');
  }

  private show(state: BannerState): void {
    this.effects.banner(state);
    if (state === 'continue' || state === 'retry') this.effects.log('bant.goster');
  }

  private attempt(reason: RenewalReason): void {
    this.active = true;
    this.tried = true;
    const generation = ++this.generation;
    if (reason === 'bant') this.show('busy');
    const finish = (value?: string, error?: unknown, timedOut = false) => {
      if (generation !== this.generation) return;
      ++this.generation;
      this.active = false;
      if (this.timeout !== undefined) this.effects.clear(this.timeout);
      this.timeout = undefined;
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      this.effects.log(reason === 'bant' ? 'bant.dokun' : 'yenile.sessiz', {
        sonuc: value ? 'basarili' : timedOut ? 'zamanAsimi' : code === 'popup-blocked' ? 'engellendi' : 'hata',
      });
      if (value) {
        const gate = this.gate;
        this.gate = undefined;
        this.waiting = 0;
        this.show('hidden');
        gate?.resolve(value);
      } else {
        this.effects.cancelRequest();
        this.show(reason === 'bant' ? 'retry' : 'continue');
      }
    };
    this.timeout = this.effects.later(() => finish(undefined, undefined, true), 15_000);
    try {
      // No await or Promise.then before signIn: preserves the browser's user gesture.
      this.effects.signIn(reason).then(value => finish(value), error => finish(undefined, error));
    } catch (error) { finish(undefined, error); }
  }

  cancel(error: Error): void {
    ++this.generation;
    if (this.timer !== undefined) this.effects.clear(this.timer);
    if (this.timeout !== undefined) this.effects.clear(this.timeout);
    this.timer = this.timeout = undefined;
    this.due = Infinity;
    this.tried = this.active = false;
    this.waiting = 0;
    const gate = this.gate;
    this.gate = undefined;
    this.effects.cancelRequest();
    this.show('hidden');
    gate?.reject(error);
  }
}
