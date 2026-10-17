import { alanDurumu } from './gorunurAlan';

// Task 5.10g-ek: ?olcum=1 — a small box in the corner with the numbers of the page's position
// (iPad Safari: the screen stayed moved up after the keyboard / photo picker). Only for diagnosis.
// Task 5.10g-ek2: bottom left (at the top it was cut by Safari's bar); the key numbers in the first line.

const n = (x: number | undefined | null) => x == null ? '–' : String(Math.round(x * 10) / 10);

export function installOlcum(): void {
  const kutu = document.createElement('pre');
  kutu.id = 'olcum';
  kutu.setAttribute('aria-hidden', 'true');
  Object.assign(kutu.style, {
    position: 'fixed', left: '4px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)', zIndex: '10001', margin: '0', padding: '4px 6px',
    font: '10px/1.3 ui-monospace, Menlo, monospace', color: '#fff', background: 'rgba(0, 0, 0, .55)', borderRadius: '4px',
    pointerEvents: 'none', whiteSpace: 'pre', maxWidth: '60vw', overflow: 'hidden'
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(kutu);
  let olay = 'açılış', sayac = 0;

  const yaz = () => {
    const de = document.documentElement, vv = window.visualViewport;
    const rect = (sel: string) => {
      const e = document.querySelector<HTMLElement>(sel);
      if (!e || e.hidden) return 'gizli';
      const r = e.getBoundingClientRect();
      return `top ${n(r.top)} h ${n(r.height)}`;
    };
    const app = document.querySelector('#app');
    const cs = app ? getComputedStyle(app) : null;
    const ae = document.activeElement as HTMLElement | null;
    kutu.textContent = [
      vv ? `vv offsetTop ${n(vv.offsetTop)} · pageTop ${n(vv.pageTop)} · scrollY ${n(scrollY)}` : `vv yok · scrollY ${n(scrollY)}`,
      `olay: ${olay} (#${sayac})`,
      `html.scrollTop ${n(de.scrollTop)} · body.scrollTop ${n(document.body.scrollTop)}`,
      `innerHeight ${n(innerHeight)} · html.clientHeight ${n(de.clientHeight)}`,
      vv ? `vv h ${n(vv.height)} · scale ${n(vv.scale)}` : 'vv yok',
      `#reader ${rect('#reader')}`,
      `#okuyucu ${rect('#okuyucu')}`,
      `#app top ${cs?.top ?? '–'} h ${cs?.height ?? '–'}`,
      `dvh: ${CSS.supports('height', '100dvh') ? 'var' : 'yok'} · 100vh=${n(vhPx())}px`,
      `klavye ${alanDurumu.klavyeAcik ? 'açık' : 'kapalı'} · en büyük vv h ${n(alanDurumu.enBuyukH)}`,
      `ad kutusu: ${adKutusu()}`,
      `düzeltme ${alanDurumu.duzeltme} · sıfırlama ${alanDurumu.sifirlama} · son: ${alanDurumu.sonOlay}`,
      `odak: ${ae ? ae.tagName.toLowerCase() + (ae.id ? '#' + ae.id : '') : '–'}`,
    ].join('\n');
  };
  const olaydan = (ad: string) => () => { olay = ad; sayac++; yaz(); setTimeout(yaz, 450); setTimeout(yaz, 900); };
  const vv = window.visualViewport;
  vv?.addEventListener('resize', olaydan('vv resize'));
  vv?.addEventListener('scroll', olaydan('vv scroll'));
  addEventListener('resize', olaydan('resize'));
  addEventListener('pageshow', olaydan('pageshow'));
  addEventListener('scroll', olaydan('scroll'));
  document.addEventListener('focusin', olaydan('focusin'));
  document.addEventListener('focusout', olaydan('focusout'));
  document.addEventListener('change', e => { if ((e.target as HTMLInputElement | null)?.type === 'file') olaydan('dosya seçildi')(); }, true);
  setInterval(yaz, 1000);   // also what changes without an event
  yaz();
}

// the file panel's name box: its real font size (iOS zooms into fields under 16px) and where it is
function adKutusu(): string {
  const e = document.querySelector<HTMLInputElement>('#dosyaPanel .dp-ad input');
  if (!e) return 'yok';
  const r = e.getBoundingClientRect();
  return `font ${getComputedStyle(e).fontSize} · top ${n(r.top)}${document.activeElement === e ? ' · odakta' : ''}`;
}

let vhOlcer: HTMLDivElement | null = null;
function vhPx(): number {
  if (!vhOlcer) {
    vhOlcer = document.createElement('div');
    vhOlcer.style.cssText = 'position:fixed;left:-10px;top:0;width:1px;height:100vh;visibility:hidden;pointer-events:none';
    document.body.append(vhOlcer);
  }
  return vhOlcer.getBoundingClientRect().height;
}
