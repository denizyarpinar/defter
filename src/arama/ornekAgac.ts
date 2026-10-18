import type { Book, Library } from '../model/types';
import { bookUnits } from '../model/units';
import { MATERIAL_KINDS } from '../okuma/konuKesfi';
import { localTopic, type SampleFolders } from '../okuma/ornekKaynak';
import { adAnahtari, dosyaAnahtari } from './adEsle';
import { kitapSirasi, type AgacDosyasi, type AgacKitabi, type AgacKonusu, type KitaplikAgaci } from './kitaplikAgaci';

// Task 6.3e: the library search in the sample library (?demo). No Drive: the books and topics come from the
// sample kitap.json files, the files from ornek/index.json (the same map the reader uses, localTopic).
// Only names are searched; the sample library has no text search.

export type OrnekAgaci = Pick<KitaplikAgaci, 'kitaplar' | 'konular' | 'dosyalar'>;

export function ornekAgac(library: Library, books: Map<string, Book>, folders: SampleFolders): OrnekAgaci {
  const kitaplar: AgacKitabi[] = [], konular: AgacKonusu[] = [], dosyalar: AgacDosyasi[] = [];
  kitapSirasi(library, books).forEach((id, sira) => {
    const b = books.get(id)!;
    const baslik = b.baslik || id;
    const kitap: AgacKitabi = { id, baslik, sira, anahtar: [adAnahtari(baslik), adAnahtari(b.sirt)].filter(Boolean).join('\n') };
    kitaplar.push(kitap);
    if (!b.hasJson) return;
    let konuSira = 0;
    for (const u of bookUnits(b)) for (const t of u.konular) {
      const konu: AgacKonusu = { kitap, uniteBaslik: u.baslik, baslik: t.baslik, klasor: t.klasor, sira: konuSira++, anahtar: adAnahtari(t.baslik) };
      konular.push(konu);
      const m = t.klasor ? localTopic(folders[id], t.klasor) : null;
      if (!m) continue;
      for (const kind of MATERIAL_KINDS) for (const it of m[kind]) {
        for (const [f, cozumMu] of [[it.file, false], [it.cozum, true]] as const) {
          if (f) dosyalar.push({ id: f.id, ad: f.name, modifiedTime: f.modifiedTime, kitap, konu, materyal: kind, cozumMu, anahtar: dosyaAnahtari(f.name) });
        }
      }
    }
  });
  return { kitaplar, konular, dosyalar };
}
