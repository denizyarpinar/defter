// Task 5.8f: under the reader's material bar: "2 fotoğraf ekleniyor…", one card per failed adding
// ([Tekrar dene] [Sonra]) and the strip of the topic's waiting photos ([Şimdi ekle] [Sonra]).
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

export class FotoDurumKutusu {
  private readonly kok = el('div', 'fd');
  private readonly hap = el('p', 'fd-hap');
  private readonly kartlar = el('div', 'fd-kartlar');
  private readonly serit = el('div', 'fd-serit');
  private readonly kartMap = new Map<string, HTMLElement>();

  // placed right after `sonra` (the material bar)
  constructor(sonra: HTMLElement) {
    this.hap.setAttribute('aria-live', 'polite');
    this.kartlar.setAttribute('role', 'alert');
    this.kok.append(this.hap, this.kartlar, this.serit);
    sonra.after(this.kok);
    this.durum(null);
    this.seritGoster(null);
  }

  private yenile(): void {
    this.kok.hidden = this.hap.hidden && !this.kartMap.size && this.serit.hidden;
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

  // the reader closed: cards and strip go (the records stay on the device; the status stays)
  temizle(): void {
    for (const id of [...this.kartMap.keys()]) this.kartKaldir(id);
    this.seritGoster(null);
  }
}
