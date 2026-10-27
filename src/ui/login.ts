import { t } from '../dil';

// Sign-in card over the room: "Google ile giriş yap" + "Örnek kitaplıkla dene".
// After a reload it offers one tap: "<ad> olarak devam et".

export interface LoginHandlers {
  onGoogle: () => void;
  onOtherAccount: () => void;
  onSample: () => void;
}

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
let label: string | null = null;   // null: t('giris.google') (never t() while the module loads; 6.5-4a)

export function initLogin(h: LoginHandlers): void {
  $('#loginGoogle').addEventListener('click', h.onGoogle);
  $('#loginOther').addEventListener('click', e => { e.preventDefault(); h.onOtherAccount(); });
  $('#loginSample').addEventListener('click', e => { e.preventDefault(); h.onSample(); });
}

// name = remembered user (one-tap mode), null = first visit / signed out.
export function setRememberedName(name: string | null): void {
  label = name ? t('giris.devamEt', { ad: name }) : t('giris.google');
  $('#loginText').textContent = t(name ? 'giris.tekrarHosgeldin' : 'genel.aciklama');
  $('#loginOther').hidden = !name;
  setLoginBusy(false);
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
  b.querySelector('span')!.textContent = busy ? t('giris.baglaniyor') : label ?? t('giris.google');
}

export function setLoginError(msg: string | null): void {
  const e = $('#loginError');
  e.textContent = msg ?? '';
  e.hidden = !msg;
}
