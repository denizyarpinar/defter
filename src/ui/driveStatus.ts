// Small Drive status elements: "Kitaplığın yükleniyor…", save state, "Kitaplık bulunamadı" and error cards.

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

export function initNotFound(h: { onRetry: () => void; onSample: () => void }): void {
  $('#nfRetry').addEventListener('click', h.onRetry);
  $('#nfSample').addEventListener('click', h.onSample);
}

export function setNotFound(show: boolean): void {
  $('#notFound').hidden = !show;
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
