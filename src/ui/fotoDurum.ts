// Task 5.8f: under the reader's material bar: "2 fotoğraf ekleniyor…", one card per failed adding
// ([Tekrar dene] [Sonra]) and the strip of the topic's waiting photos ([Şimdi ekle] [Sonra]).
// Task 6.EK-2: a second strip for a summary addition ("Yeni ek var: ozet-ek.pdf" [Ekle] [Sonra]).
import { t } from '../dil';


const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const dugme = (cls: string, text: string, onclick: () => void) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.onclick = onclick;
  return b;
};

export interface EkSerit {
  metin: string;
  neden?: string | null;         // 'yazilamaz': why it can't be added
  hata?: string | null;          // the last try failed
  ekleniyor?: string | null;     // "Ekleniyor… %42"
  ekle: (() => void) | null;     // null: grey
  sonra: () => void;
}

export class FotoDurumKutusu {
  private readonly kok = el('div', 'fd');
  private readonly hap = el('p', 'fd-hap');
  private readonly kartlar = el('div', 'fd-kartlar');
  private readonly serit = el('div', 'fd-serit');
  private readonly ekSerit = el('div', 'fd-serit fd-ek');
  private readonly kartMap = new Map<string, HTMLElement>();

  // placed right after `sonra` (the material bar)
  constructor(sonra: HTMLElement) {
    this.hap.setAttribute('aria-live', 'polite');
    this.kartlar.setAttribute('role', 'alert');
    this.kok.append(this.hap, this.kartlar, this.serit, this.ekSerit);
    sonra.after(this.kok);
    this.durum(null);
    this.seritGoster(null);
    this.ekSeritGoster(null);
  }

  private yenile(): void {
    this.kok.hidden = this.hap.hidden && !this.kartMap.size && this.serit.hidden && this.ekSerit.hidden;
  }

  durum(metin: string | null): void {
    this.hap.textContent = metin ?? '';
    this.hap.hidden = !metin;
    this.yenile();
  }

  kartGoster(islemId: string, metin: string, tekrar: () => void): void {
    this.kartKaldir(islemId);
    const kart = el('div', 'fd-kart');
    kart.append(el('p', 'fd-metin', metin),
      dugme('fd-ana', t('genel.tekrarDene'), () => { this.kartKaldir(islemId); tekrar(); }),
      dugme('fd-ikinci', t('foto.sonra'), () => this.kartKaldir(islemId)));
    this.kartMap.set(islemId, kart);
    this.kartlar.append(kart);
    this.yenile();
  }

  kartKaldir(islemId: string): void {
    this.kartMap.get(islemId)?.remove();
    this.kartMap.delete(islemId);
    this.yenile();
  }

  kartliIdler(): ReadonlySet<string> { return new Set(this.kartMap.keys()); }

  // null: hidden
  seritGoster(s: { metin: string; simdi: () => void; sonra: () => void } | null): void {
    if (!s) this.serit.replaceChildren();
    else this.serit.replaceChildren(el('p', 'fd-metin', s.metin), dugme('fd-ana', t('foto.simdiEkle'), s.simdi), dugme('fd-ikinci', t('foto.sonra'), s.sonra));
    this.serit.hidden = !s;
    this.yenile();
  }

  // Task 6.EK-2: the summary addition. ekle null: grey (neden says why); ekleniyor: the button's text while it runs
  // (both buttons off); hata: the last try's error (the button says "Tekrar dene"). null: hidden
  ekSeritGoster(s: EkSerit | null): void {
    this.ekSerit.hidden = !s;
    if (!s) { this.ekSerit.replaceChildren(); this.yenile(); return; }
    const ekle = dugme('fd-ana', s.ekleniyor ?? t(s.hata ? 'genel.tekrarDene' : 'ekleme.ekle'), () => s.ekle?.());
    const sonra = dugme('fd-ikinci', t('foto.sonra'), s.sonra);
    ekle.disabled = !s.ekle || !!s.ekleniyor;
    sonra.disabled = !!s.ekleniyor;
    const metin = el('p', 'fd-metin', s.metin);
    for (const [cls, m] of [['fd-neden', s.neden], ['fd-hata', s.hata]] as const) if (m) metin.append(el('span', cls, m));
    this.ekSerit.replaceChildren(metin, ekle, sonra);
    this.ekSerit.setAttribute('aria-live', 'polite');
    this.yenile();
  }

  // the reader closed: cards and strips go (the records stay on the device; the status stays)
  temizle(): void {
    for (const id of [...this.kartMap.keys()]) this.kartKaldir(id);
    this.seritGoster(null);
    this.ekSeritGoster(null);
  }
}
