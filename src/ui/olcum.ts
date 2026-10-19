import { ekranMetni, olcumDinle, type Olcum } from '../defter/sureOlcum';
import { kapsamDurumu } from '../drive/auth';
import { darZorlaUrl, kisaScope, sahipZorlaYok } from '../drive/kapsam';
import { alanDurumu } from './gorunurAlan';

// Task 5.10g-ek: ?olcum=1 — a small box in the corner with the numbers of the page's position
// (iPad Safari: the screen stayed moved up after the keyboard / photo picker). Only for diagnosis.
// Task 5.10g-ek2: bottom left (at the top it was cut by Safari's bar); the key numbers in the first line.
// Task 6.2e-1: a second box, bottom right: the last time measurement (sureOlcum.ts), "Kopyala" and ×
// (the iPad has no console). It appears only when a measurement ends.
// Task 6.K1: the first lines: active permission (tam/dar), owner, test switches and the token's scope list.

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
    const k = kapsamDurumu();
    const evet = (b: boolean | null) => b === null ? '–' : b ? 'evet' : 'hayır';
    kutu.textContent = [
      `kapsam: ${k.aktif ?? '–'} · sahip: ${evet(k.sahip)} · eski izinler: ${evet(k.dahilEt)}`
        + (darZorlaUrl(location.search) ? ' · ?kapsam=dar' : '') + (sahipZorlaYok(location.search) ? ' · ?sahip=0' : ''),
      `scope: ${k.scopes.map(kisaScope).join(', ') || '–'}`,
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
  olcumDinle(sonOlcumGoster);
}

let sonKutu: { kok: HTMLDivElement; metin: HTMLPreElement; not: HTMLSpanElement } | null = null;

function sonOlcumKutusu(): NonNullable<typeof sonKutu> {
  if (sonKutu) return sonKutu;
  const kok = document.createElement('div');
  kok.id = 'olcumSon';
  Object.assign(kok.style, {
    position: 'fixed', right: '4px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)', zIndex: '10001',
    width: 'min(560px, calc(100vw - 8px))', maxHeight: '60vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
    font: '11px/1.35 ui-monospace, Menlo, monospace', color: '#fff', background: 'rgba(0, 0, 0, .82)', borderRadius: '6px', padding: '6px'
  } satisfies Partial<CSSStyleDeclaration>);
  const bar = document.createElement('div');
  Object.assign(bar.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } satisfies Partial<CSSStyleDeclaration>);
  const baslik = document.createElement('strong');
  baslik.textContent = 'Son ölçüm';
  baslik.style.flex = '1';
  const not = document.createElement('span');
  not.style.opacity = '.85';
  const dugme = (yazi: string, etiket: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = yazi;
    b.setAttribute('aria-label', etiket);
    Object.assign(b.style, { font: 'inherit', color: '#000', background: '#fff', border: '0', borderRadius: '4px', padding: '4px 10px', minHeight: '32px' } satisfies Partial<CSSStyleDeclaration>);
    return b;
  };
  const kopyala = dugme('Kopyala', 'Ölçümü kopyala');
  const kapat = dugme('×', 'Ölçüm kutusunu kapat');
  const metin = document.createElement('pre');
  Object.assign(metin.style, { margin: '0', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', webkitUserSelect: 'text' } satisfies Partial<CSSStyleDeclaration>);
  bar.append(baslik, not, kopyala, kapat);
  kok.append(bar, metin);
  // the reader under it never sees these taps (it must not close or turn a page)
  for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'wheel']) {
    kok.addEventListener(t, e => e.stopPropagation());
  }
  kopyala.onclick = () => void kopyalaMetin(metin, not);
  kapat.onclick = () => { kok.hidden = true; };
  document.body.append(kok);
  sonKutu = { kok, metin, not };
  return sonKutu;
}

function sonOlcumGoster(o: Olcum): void {
  const k = sonOlcumKutusu();
  k.metin.textContent = ekranMetni(o);
  k.not.textContent = '';
  k.kok.hidden = false;
  // a narrow screen: above the numbers box (bottom left) instead of over it
  const eski = document.getElementById('olcum')?.getBoundingClientRect();
  const yeni = k.kok.getBoundingClientRect();
  const ust = eski && eski.right > yeni.left ? Math.ceil(eski.height) + 8 : 0;
  k.kok.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${4 + ust}px)`;
  k.kok.style.maxHeight = `min(60vh, calc(100% - ${ust + 16}px))`;
}

// navigator.clipboard; no clipboard or it refuses → the text is selected, to copy by hand
async function kopyalaMetin(metin: HTMLPreElement, not: HTMLSpanElement): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('pano yok');
    await navigator.clipboard.writeText(metin.textContent ?? '');
    not.textContent = 'Kopyalandı';
  } catch {
    const r = document.createRange();
    r.selectNodeContents(metin);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    not.textContent = 'Metni seçtim, kopyala';
  }
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
