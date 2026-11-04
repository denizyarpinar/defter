import { t } from '../dil';

export const ANNOUNCEMENT_ID = 'gelecek-ozellikler-v1';
// Rollback: disable this flag; library/sign-in remains independent.
export const ANNOUNCEMENT_ENABLED = true;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
function read(store: Store | null, key: string): boolean {
  try { return store?.getItem(key) === '1'; } catch { return false; }
}
function write(store: Store | null, key: string): void {
  try { store?.setItem(key, '1'); } catch { /* In-memory suppression still works. */ }
}
function storage(kind: 'localStorage' | 'sessionStorage'): Store | null {
  try { return window[kind]; } catch { return null; }
}

// Preferences contain only the announcement ID, never account information.
export class AnnouncementState {
  private shown: boolean;
  private pending = false;
  private readonly hiddenKey: string;
  private readonly shownKey: string;
  constructor(private readonly device: Store | null, private readonly tab: Store | null, id = ANNOUNCEMENT_ID) {
    this.hiddenKey = 'defter-duyuru-gizle:' + id;
    this.shownKey = 'defter-duyuru-gosterildi:' + id;
    this.shown = read(tab, this.shownKey);
  }
  get waiting(): boolean { return this.pending; }
  request(): void { this.pending = !this.shown && !read(this.device, this.hiddenKey); }
  canOpen(roomReady: boolean): boolean {
    return this.pending && roomReady && !this.shown && !read(this.device, this.hiddenKey) && !read(this.tab, this.shownKey);
  }
  markShown(): void { this.shown = true; this.pending = false; write(this.tab, this.shownKey); }
  dismiss(hide: boolean): void { this.pending = false; if (hide) write(this.device, this.hiddenKey); }
  cancel(): void { this.pending = false; }
}

export function createAnnouncement(options: { active(): boolean; roomReady(): boolean }): { request(): void; refresh(): void } {
  const state = new AnnouncementState(storage('localStorage'), storage('sessionStorage'));
  let timer: number | undefined;
  let loading = false;
  let generation = 0;
  let closeDialog: (() => void) | undefined;
  function refresh(): void {
    if (!ANNOUNCEMENT_ENABLED || !options.active()) {
      generation++; loading = false; state.cancel(); clearTimeout(timer); timer = undefined;
      closeDialog?.(); return;
    }
    if (!state.waiting || loading || timer !== undefined || closeDialog) return;
    timer = window.setTimeout(() => { timer = undefined; void tryOpen(); }, 120);
  }
  async function tryOpen(): Promise<void> {
    if (!state.canOpen(options.roomReady()) || !options.active()) return;
    loading = true;
    const ticket = ++generation;
    const image = new Image();
    image.src = '/duyurular/gelecek-ozellikler-v1.webp';
    try { await image.decode(); }
    catch { if (ticket === generation) { loading = false; state.cancel(); } return; }
    if (ticket !== generation) return;
    loading = false;
    if (!options.active() || !state.canOpen(options.roomReady())) return;
    openDialog(image);
  }
  function openDialog(image: HTMLImageElement): void {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'defterDuyuru'; dialog.className = 'duyuru-dialog';
    dialog.setAttribute('aria-labelledby', 'duyuruTitle');
    dialog.setAttribute('aria-describedby', 'duyuruPlan duyuruFeatures');
    const card = document.createElement('div'); card.className = 'duyuru-card';
    const hero = document.createElement('div'); hero.className = 'duyuru-hero';
    image.className = 'duyuru-art'; image.alt = ''; image.setAttribute('aria-hidden', 'true');
    image.width = 1536; image.height = 1024; image.draggable = false;
    const copy = document.createElement('div'); copy.className = 'duyuru-copy';
    const brand = document.createElement('div'); brand.className = 'duyuru-brand'; brand.textContent = 'DEFTER';
    const title = document.createElement('h2'); title.id = 'duyuruTitle';
    title.append(t('duyuru.baslik'), document.createElement('br'));
    const emphasis = document.createElement('em'); emphasis.textContent = t('duyuru.baslikVurgu'); title.append(emphasis);
    const plan = document.createElement('p'); plan.id = 'duyuruPlan'; plan.textContent = t('duyuru.plan');
    const list = document.createElement('ul'); list.id = 'duyuruFeatures';
    for (const key of ['duyuru.kalem', 'duyuru.yanYana', 'duyuru.oda'] as const) {
      const item = document.createElement('li'); item.textContent = t(key); list.append(item);
    }
    copy.append(brand, title, plan, list); hero.append(image, copy);
    const close = document.createElement('button'); close.className = 'duyuru-close'; close.type = 'button';
    close.textContent = '×'; close.setAttribute('aria-label', t('duyuru.kapat'));
    const footer = document.createElement('div'); footer.className = 'duyuru-footer';
    const label = document.createElement('label');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    label.append(checkbox, document.createTextNode(t('duyuru.gosterme')));
    const back = document.createElement('button'); back.className = 'duyuru-back'; back.type = 'button'; back.textContent = t('duyuru.don');
    footer.append(label, back); card.append(hero, close, footer); dialog.append(card);
    function stop(): void {
      window.removeEventListener('keydown', onKey, true); closeDialog = undefined;
      dialog.close(); dialog.remove();
      const target = previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus.tabIndex >= 0
        && previousFocus.getClientRects().length > 0 && !previousFocus.closest('[inert]')
        ? previousFocus : document.querySelector<HTMLElement>('#araBtn');
      if (target?.getClientRects().length) target.focus({ preventScroll: true });
    }
    function dismiss(): void { state.dismiss(checkbox.checked); stop(); }
    function onKey(event: KeyboardEvent): void {
      event.stopImmediatePropagation(); // Keep the room/search shortcuts behind the modal inactive.
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === close) { event.preventDefault(); back.focus(); }
        else if (!event.shiftKey && document.activeElement === back) { event.preventDefault(); close.focus(); }
      }
    }
    close.onclick = dismiss; back.onclick = dismiss;
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    document.body.append(dialog);
    try { dialog.showModal(); } catch { dialog.remove(); state.cancel(); return; }
    closeDialog = stop; state.markShown();
    window.addEventListener('keydown', onKey, true); close.focus({ preventScroll: true });
  }
  // Resume deferred openings after a panel/reader closes, including a restored reading position.
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'class', 'aria-hidden'] });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('storage', refresh);
  return { request: () => { if (ANNOUNCEMENT_ENABLED && options.active()) { state.request(); refresh(); } }, refresh };
}
