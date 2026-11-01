import { gunlukDinle, gunlukOku, gunlukTemizle } from '../drive/authGunlugu';

// Diagnosis only; loaded with ?olcum=1. In the login card it participates in normal layout,
// so it cannot cover login controls, even on a small screen or after session expiry.
export function installAuthGunlugu(): void {
  const box = document.createElement('section');
  box.id = 'olcumAuth';
  for (const event of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'wheel']) {
    box.addEventListener(event, e => e.stopPropagation());
  }
  const title = document.createElement('strong');
  title.textContent = 'Oturum günlüğü'; // dil-kontrol: yoksay
  const text = document.createElement('pre');
  text.tabIndex = 0;
  const controls = document.createElement('div');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Kopyala'; // dil-kontrol: yoksay
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Temizle'; // dil-kontrol: yoksay
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.textContent = '−';
  fold.setAttribute('aria-label', 'Oturum günlüğünü aç/kapat'); // dil-kontrol: yoksay
  fold.setAttribute('aria-expanded', 'true');
  fold.onclick = () => { text.hidden = !text.hidden; fold.setAttribute('aria-expanded', String(!text.hidden)); };
  controls.append(copy, clear, fold, status);
  box.append(title, controls, text);
  const update = () => {
    text.textContent = gunlukOku().map(e => {
      const date = new Date(e.t);
      const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
        + '.' + String(date.getMilliseconds()).padStart(3, '0');
      return `${time} [${e.sayfa}] ${e.olay} ${JSON.stringify(e.ayrinti)}`;
    }).join('\n');
    text.scrollTop = text.scrollHeight;
  };
  copy.onclick = () => {
    // Clipboard failure leaves a selectable log and an actionable message, without logging clipboard contents.
    const result = navigator.clipboard?.writeText(text.textContent ?? '');
    if (result) void result.then(() => { status.textContent = 'Kopyalandı'; }, failed); // dil-kontrol: yoksay
    else failed();
  };
  function failed(): void {
    status.textContent = 'Kopyalanamadı; metni seçip kopyala.'; // dil-kontrol: yoksay
    text.hidden = false;
    fold.setAttribute('aria-expanded', 'true');
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(range);
  }
  clear.onclick = () => { gunlukTemizle(); status.textContent = ''; };
  const login = document.querySelector<HTMLElement>('#login');
  const card = login?.querySelector<HTMLElement>('.card');
  const place = () => {
    const inLogin = !!login && !login.hidden && !!card;
    box.classList.toggle('auth-in-login', inLogin);
    document.body.classList.toggle('auth-log-login', inLogin);
    const parent = inLogin ? card : document.body;
    if (box.parentElement !== parent) parent.append(box);
  };
  if (login) new MutationObserver(place).observe(login, { attributes: true, attributeFilter: ['hidden'] });
  place();
  gunlukDinle(update);
  update();
}
