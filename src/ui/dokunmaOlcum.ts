import { dokunmaIptalDinle } from './dokunmaIz';
import type { DokunmaOlayi, DokunmaTuru } from './dokunmaOzet';

// Task 6.S-1a: diagnosis only (?olcum=1, loaded with olcum.ts). Every pointer / touch / click event is logged from
// window and document in the capture phase, passive: nothing is blocked or changed. window comes first; the same
// event seen again on document is not counted twice (document is there in case something on window stops it).
// defaultPrevented is read once the event is over (setTimeout 0). The measuring boxes' own taps are not logged.

const TURLER: DokunmaTuru[] = ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click'];
const KONTROL = 'button, a, input, select, textarea, label, [role="tab"], [role="slider"], [data-st], [data-u]';
const OLCUM_KUTUSU = '#olcum, #olcumKalem, #olcumSon';
const MAX_OLAY = 4000;

const kisa = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function oge(el: Element): string {
  const sinif = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
  return kisa(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + sinif.map(c => '.' + c).join(''), 40);
}

function kontrol(el: Element | null): string | null {
  const k = el?.closest(KONTROL);
  if (!k) return null;
  const ad = k.getAttribute('aria-label') || k.getAttribute('title') || (k.textContent ?? '').replace(/\s+/g, ' ').trim();
  return oge(k) + (ad ? ` "${kisa(ad, 24)}"` : '');
}

export interface DokunmaKaydedici {
  olaylar(): DokunmaOlayi[];
  sifirla(): void;
}

export function installDokunmaOlcum(degisti: () => void): DokunmaKaydedici {
  let olaylar: DokunmaOlayi[] = [];
  let t0: number | null = null;
  const gorulen = new WeakSet<Event>();
  const kayitli = new WeakSet<Event>();   // logged (not a measuring box's own tap)
  let bekleyen: [DokunmaOlayi, Event][] = [];

  const zaman = (ts: number) => { t0 ??= ts; return Math.round(ts - t0); };
  const ekle = (o: DokunmaOlayi) => {
    olaylar.push(o);
    if (olaylar.length > MAX_OLAY) olaylar.splice(0, olaylar.length - MAX_OLAY);
  };
  const bosalt = () => {
    for (const [o, e] of bekleyen) o.iptal = e.defaultPrevented;
    bekleyen = [];
    try { degisti(); } catch (err) { console.warn('Dokunma ölçüm kutusu güncellenemedi.', err); }
  };

  const dinle = (e: Event) => {
    if (gorulen.has(e)) return;
    gorulen.add(e);
    const hedef = e.target instanceof Element ? e.target : null;
    if (hedef?.closest(OLCUM_KUTUSU)) return;
    const o: DokunmaOlayi = { t: zaman(e.timeStamp), tur: e.type as DokunmaTuru, hedef: hedef ? oge(hedef) : String(e.target), kontrol: kontrol(hedef) };
    if (typeof PointerEvent !== 'undefined' && e instanceof PointerEvent) {
      o.pointerType = e.pointerType;
      o.pointerId = e.pointerId;
      o.force = Math.round(e.pressure * 100) / 100;
    } else if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      const t = (e.touches[0] ?? e.changedTouches[0]) as (Touch & { touchType?: string }) | undefined;
      if (t?.touchType) o.touchType = t.touchType;
      if (t) o.force = Math.round(t.force * 100) / 100;
      o.kalan = e.touches.length;
    }
    ekle(o);
    kayitli.add(e);
    if (!bekleyen.length) setTimeout(bosalt, 0);
    bekleyen.push([o, e]);
  };

  const secenek = { capture: true, passive: true } as const;
  for (const t of TURLER) {
    window.addEventListener(t, dinle, secenek);
    document.addEventListener(t, dinle, secenek);
  }
  dokunmaIptalDinle((kaynak, e) => {
    if (!kayitli.has(e) && !e.type.startsWith('gesture')) return;
    ekle({ t: zaman(e.timeStamp), tur: 'iptal', kaynak, olayTuru: e.type, hedef: '', kontrol: null });
  });

  return {
    olaylar: () => olaylar.slice(),
    sifirla: () => { olaylar = []; t0 = null; },
  };
}
