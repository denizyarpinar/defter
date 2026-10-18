import type { View } from '../scene';

export type LightMode = 'auto' | 'day' | 'night';

interface TopBarHandlers {
  onModeChange: (m: LightMode) => void;
  onGoRoom: () => void;
  onSearch: () => void;   // task 6.3e: the library search panel
}

export function initTopBar(h: TopBarHandlers): void {
  // inside the tap: the panel focuses its box, so the iPad keyboard opens
  document.querySelector('#araBtn')!.addEventListener('click', h.onSearch);
  const seg = document.querySelector<HTMLElement>('#modeSeg')!;
  seg.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
    if (b) h.onModeChange(b.dataset.mode as LightMode);
  });
  document.querySelector('#crumb')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-go="room"]');
    if (b) h.onGoRoom();
  });
}

// Right side of the bar: "<name> · Çıkış" when signed in, "Giriş yap" in sample mode.
export function initUserBox(h: { onSignIn: () => void; onSignOut: () => void }): void {
  document.querySelector('#signInBtn')!.addEventListener('click', h.onSignIn);
  document.querySelector('#signOutBtn')!.addEventListener('click', h.onSignOut);
}

export function updateUserBox(state: { kind: 'none' } | { kind: 'sample' } | { kind: 'user'; name: string }): void {
  const box = document.querySelector<HTMLElement>('#userBox')!;
  box.hidden = state.kind === 'none';
  document.querySelector<HTMLElement>('#signInBtn')!.hidden = state.kind !== 'sample';
  document.querySelector<HTMLElement>('#userName')!.hidden = state.kind !== 'user';
  document.querySelector<HTMLElement>('#signOutBtn')!.hidden = state.kind !== 'user';
  document.querySelector<HTMLElement>('#userName')!.textContent = state.kind === 'user' ? state.name : '';
}

export function updateModeButtons(mode: LightMode): void {
  document.querySelectorAll<HTMLButtonElement>('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}

// "Çalışma odası › Kitaplık › <kitap>"
export function updateCrumb(view: View, bookTitle: string | null): void {
  const crumb = document.querySelector<HTMLElement>('#crumb')!;
  crumb.replaceChildren();
  const part = (text: string, go?: string) => {
    const b = document.createElement('button');
    b.textContent = text;
    if (go) b.dataset.go = go; else b.disabled = true;
    crumb.append(b);
  };
  const sep = () => { const s = document.createElement('span'); s.textContent = '›'; crumb.append(s); };
  part('Çalışma odası', view !== 'room' && !bookTitle ? 'room' : undefined);
  if (view !== 'room') { sep(); part('Kitaplık'); }
  if (bookTitle) { sep(); part(bookTitle); }
}
