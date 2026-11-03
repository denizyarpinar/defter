import { t } from '../dil';
import { currentToken, isSignedIn, kapsamDurumu } from '../drive/auth';
import { EVENT_TYPES, type CounterData, type EventType } from '../sayacModel';

let closePanel: (() => void) | undefined;
let dismissed = false;
const allowed = () => isSignedIn() && kapsamDurumu().sahip === true;

export function kullanimPaneliGuncelle(): void {
  if (!allowed()) { closePanel?.(); dismissed = false; return; }
  if (new URLSearchParams(location.search).get('panel') !== '1' || closePanel || dismissed) return;
  openPanel();
}

function openPanel(): void {
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  const root = document.createElement('div');
  root.id = 'kullanimPaneli'; root.className = 'fp';
  const card = document.createElement('section');
  card.className = 'fp-kart usage-card';
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'usageTitle');
  const title = document.createElement('h2'); title.id = 'usageTitle'; title.className = 'fp-baslik'; title.textContent = t('panel.baslik');
  const note = document.createElement('p'); note.className = 'fp-durum'; note.textContent = t('panel.yaklasik');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = t('panel.kapat');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = t('panel.yukleniyor');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = t('panel.tekrar'); retry.hidden = true;
  const content = document.createElement('div');
  card.append(title, note, close, status, retry, content); root.append(card);
  const stop = () => {
    controller.abort(); root.remove(); removeEventListener('keydown', onKey, true); closePanel = undefined;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  closePanel = stop;
  const dismiss = () => { dismissed = true; stop(); };
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = [...card.querySelectorAll<HTMLElement>('button, [tabindex="0"]')].filter(element => !element.hidden);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  close.onclick = dismiss;
  root.onclick = event => { if (event.target === root) dismiss(); };
  for (const name of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'wheel']) root.addEventListener(name, event => event.stopPropagation());
  addEventListener('keydown', onKey, true); document.body.append(root); close.focus();
  async function load(): Promise<void> {
    status.textContent = t('panel.yukleniyor'); retry.hidden = true;
    try {
      if (!allowed()) { stop(); return; }
      const response = await fetch('/api/panel?gun=30', { headers: { Authorization: `Bearer ${currentToken()}` }, signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!allowed()) { stop(); return; }
      if (!response.ok) { status.textContent = t(data.kod === 'sayac_ayarsiz' ? 'panel.ayarsiz' : 'panel.hata'); retry.hidden = false; return; }
      renderCounts(content, data as CounterData);
      status.textContent = '';
    } catch {
      if (!controller.signal.aborted) { status.textContent = t('panel.hata'); retry.hidden = false; }
    }
  }
  retry.onclick = () => { void load(); };
  void load();
}

export function renderCounts(container: HTMLElement, data: CounterData): void {
  container.replaceChildren();
  const totals = document.createElement('div'); totals.className = 'usage-totals';
  for (const days of [7, 30] as const) {
    const box = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = t(days === 7 ? 'panel.son7' : 'panel.son30'); box.append(heading);
    const list = document.createElement('dl');
    for (const type of EVENT_TYPES) {
      const label = document.createElement('dt'); label.textContent = t(`panel.${type}`);
      const value = document.createElement('dd'); value.textContent = String(data.gunler.slice(-days).reduce((sum, day) => sum + day.sayilar[type], 0));
      list.append(label, value);
    }
    box.append(list); totals.append(box);
  }
  const scroll = document.createElement('div'); scroll.className = 'usage-table'; scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', t('panel.gunluk'));
  const table = document.createElement('table');
  const caption = document.createElement('caption'); caption.textContent = t('panel.gunluk'); table.append(caption);
  const head = document.createElement('thead'), header = document.createElement('tr');
  for (const label of [t('panel.tarih'), ...EVENT_TYPES.map(type => t(`panel.${type}`))]) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; header.append(cell);
  }
  head.append(header); table.append(head);
  const body = document.createElement('tbody');
  const max = Object.fromEntries(EVENT_TYPES.map(type => [type, Math.max(1, ...data.gunler.map(day => day.sayilar[type]))])) as Record<EventType, number>;
  for (const day of [...data.gunler].reverse()) {
    const row = document.createElement('tr'); const date = document.createElement('th'); date.scope = 'row'; date.textContent = day.tarih; row.append(date);
    for (const type of EVENT_TYPES) {
      const cell = document.createElement('td');
      const value = document.createElement('span'); value.textContent = String(day.sayilar[type]);
      const bar = document.createElement('span'); bar.className = 'usage-bar'; bar.setAttribute('aria-hidden', 'true'); bar.style.width = `${100 * day.sayilar[type] / max[type]}%`;
      cell.append(value, bar); row.append(cell);
    }
    body.append(row);
  }
  table.append(body); scroll.append(table); container.append(totals, scroll);
}
