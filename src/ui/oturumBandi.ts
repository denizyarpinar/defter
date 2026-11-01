import { t } from '../dil';
import type { BannerState } from '../drive/yenileme';

export function oturumBandiKur(touch: () => void): (state: BannerState) => void {
  const banner = document.createElement('div');
  banner.id = 'oturumBandi';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  const text = document.createElement('span');
  const button = document.createElement('button');
  button.type = 'button';
  // Never defer touch: GIS must start within this click's user activation.
  button.addEventListener('click', touch);
  banner.append(text, button);
  // Body avoids #app's stacking context, so diagnostics/reader layers cannot cover the button.
  document.body.append(banner);
  const header = document.querySelector('.bar');
  const place = () => {
    // The phone header wraps: keep its sign-out button available below the first row.
    if (header) banner.style.top = `${Math.max(64, header.getBoundingClientRect().bottom + 8)}px`;
  };
  if (header) new ResizeObserver(place).observe(header);
  return state => {
    place();
    banner.hidden = state === 'hidden';
    text.textContent = t(state === 'retry' ? 'oturum.bant.hata' : 'oturum.bant.metin');
    button.textContent = t(state === 'retry' ? 'genel.tekrarDene' : 'oturum.bant.devam');
    button.disabled = state === 'busy';
  };
}
