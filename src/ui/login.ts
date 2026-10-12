// Sign-in card over the room: "Google ile giriş yap" + "Örnek kitaplıkla dene".

export interface LoginHandlers {
  onGoogle: () => void;
  onSample: () => void;
}

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

export function initLogin(h: LoginHandlers): void {
  $('#loginGoogle').addEventListener('click', h.onGoogle);
  $('#loginSample').addEventListener('click', e => { e.preventDefault(); h.onSample(); });
}

export function showLogin(message?: string): void {
  $('#login').hidden = false;
  setLoginBusy(false);
  setLoginError(message ?? null);
}

export function hideLogin(): void {
  $('#login').hidden = true;
}

export function setLoginBusy(busy: boolean): void {
  const b = $<HTMLButtonElement>('#loginGoogle');
  b.disabled = busy;
  b.querySelector('span')!.textContent = busy ? 'Bağlanıyor…' : 'Google ile giriş yap';
}

export function setLoginError(msg: string | null): void {
  const e = $('#loginError');
  e.textContent = msg ?? '';
  e.hidden = !msg;
}
