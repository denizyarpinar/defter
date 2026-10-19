import type { KitaplikGorunumu } from './kitaplikDurumu';

// Small Drive status elements: "Kitaplığın yükleniyor…", save state, "Kitaplığını kur" and error cards.

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

export function setLibraryLoading(on: boolean): void {
  $('#libLoading').hidden = !on;
}

let fadeTimer: number | undefined;
let retryFn: (() => void) | null = null;

export function initSaveState(): void {
  $('#saveRetry').addEventListener('click', () => { const r = retryFn; retryFn = null; r?.(); });
}

function show(text: string, kind: 'info' | 'error'): void {
  clearTimeout(fadeTimer);
  const box = $('#saveState');
  box.hidden = false;
  box.classList.remove('fade');
  box.classList.toggle('error', kind === 'error');
  $('#saveText').textContent = text;
  $('#saveRetry').hidden = kind !== 'error';
}

export function showSaving(): void {
  show('Kaydediliyor…', 'info');
}

export function showSaved(): void {
  show('Kaydedildi ✓', 'info');
  fadeTimer = window.setTimeout(() => {
    $('#saveState').classList.add('fade');
    fadeTimer = window.setTimeout(() => { $('#saveState').hidden = true; }, 300);
  }, 1600);
}

// Stays until the user retries (or the next save works).
export function showSaveError(message: string, retry: () => void): void {
  retryFn = retry;
  show(message, 'error');
}

export function hideSaveState(): void {
  clearTimeout(fadeTimer);
  $('#saveState').hidden = true;
}

// Task 6.K2b: no root / half set up → "Kitaplığını kur". The main button: set up (or "Tekrar dene" after an error),
// "Tekrar giriş yap" when Drive refused the permission.
export function initKurulum(h: { onSetup: () => void; onSignIn: () => void; onSample: () => void }): void {
  $('#kuKur').addEventListener('click', () => { if ($('#kuKur').dataset.giris === undefined) h.onSetup(); else h.onSignIn(); });
  $('#kuSample').addEventListener('click', h.onSample);
}

const KURULUM_METNI = {
  kur: "Drive'ında “Defter Library” adlı bir klasör açılacak. Kitapların orada durur; Drive'ındaki başka dosyalara dokunulmaz.",
  tamamla: '“Defter Library” klasörün var ama kurulum yarım kalmış. Eksik parçalar eklenecek; başka dosyalarına dokunulmaz.'
};

export function setKurulum(k: KitaplikGorunumu['kurulum']): void {
  $('#kurulum').hidden = k === null;
  if (!k) return;
  $('#kuText').textContent = KURULUM_METNI[k.dugme];
  $('#kuKilit').hidden = !k.kilitli;
  $('#kuError').textContent = k.hata ?? '';
  $('#kuError').hidden = k.hata === null;
  const b = $<HTMLButtonElement>('#kuKur');
  const giris = k.hata !== null && k.izinYok;
  if (giris) b.dataset.giris = ''; else delete b.dataset.giris;
  b.disabled = k.kilitli || k.mesgul;
  b.replaceChildren();
  if (k.mesgul) {
    const spin = document.createElement('span');
    spin.className = 'spin';
    spin.setAttribute('aria-hidden', 'true');
    b.append(spin, 'Kuruluyor…');
  } else {
    b.textContent = giris ? 'Tekrar giriş yap' : k.hata !== null ? 'Tekrar dene' : k.dugme === 'kur' ? 'Kitaplığı kur' : 'Kurulumu tamamla';
  }
  $<HTMLButtonElement>('#kuSample').disabled = k.mesgul;
}

// Task 6.K1: the owner signed in with drive.file only → "Tam erişimi aç" (the popup opens on the tap)
export function initFullAccess(h: { onOpen: () => void; onSample: () => void }): void {
  $('#faOpen').addEventListener('click', h.onOpen);
  $('#faSample').addEventListener('click', h.onSample);
}

export function setFullAccess(show: boolean, busy: boolean, error: string | null): void {
  $('#fullAccess').hidden = !show;
  const b = $<HTMLButtonElement>('#faOpen');
  b.disabled = busy;
  b.textContent = busy ? 'Bağlanıyor…' : 'Tam erişimi aç';
  $('#faError').textContent = error ?? '';
  $('#faError').hidden = error === null;
}

// Task 5.1: the Drive library could not be loaded (offline, Drive error): message + "Tekrar dene" + sample library.
export function initLibError(h: { onRetry: () => void; onSample: () => void }): void {
  $('#leRetry').addEventListener('click', h.onRetry);
  $('#leSample').addEventListener('click', h.onSample);
}

export function setLibError(message: string | null): void {
  $('#leText').textContent = message ?? '';
  $('#libError').hidden = message === null;
}
