// Task 6.4c-1b: the dev helper's choice of a topic and its console texts (pure, tested). Only book ids and
// folder paths: no e-mail, no Drive id.

export interface DeneAday {
  kitap: string;              // book id (folder name)
  ornek: boolean;             // the setup's sample book (defterOrnek)
  konu: string;               // the topic's folder path
  ozetVar: boolean;           // the folder has an ozet.pdf
}

export type DeneAdim = 'kitaplik' | 'kitap' | 'konu' | 'ozet';
const ADIM: Record<DeneAdim, string> = { kitaplik: '1/4 kitaplık', kitap: '2/4 kitap', konu: '3/4 konu', ozet: '4/4 ozet.pdf' };

export const adimEtiketi = (a: DeneAdim): string => `[adım ${ADIM[a]}]`;

const testMi = (a: DeneAday) => /test/i.test(a.konu) || /test/i.test(a.kitap);

// The default: the first real (not sample) topic with an ozet.pdf; a topic or book named "test" comes first.
export function varsayilanKonu(adaylar: readonly DeneAday[]): DeneAday | null {
  const gercek = adaylar.filter(a => !a.ornek && a.ozetVar);
  return gercek.find(testMi) ?? gercek[0] ?? null;
}

// Rows for console.table: every book; its topics with an ozet.pdf, or one row "(ozet.pdf'li konu yok)"
export function listeSatirlari(kitaplar: readonly { kitap: string; ornek: boolean }[], adaylar: readonly DeneAday[]): { kitap: string; ornek: string; konu: string }[] {
  return kitaplar.flatMap(k => {
    const konular = adaylar.filter(a => a.kitap === k.kitap && a.ozetVar).map(a => a.konu);
    const ornek = k.ornek ? 'evet' : '';
    return konular.length ? konular.map(konu => ({ kitap: k.kitap, ornek, konu })) : [{ kitap: k.kitap, ornek, konu: "(ozet.pdf'li konu yok)" }];
  });
}
