// Task 6.5-2a: the sample library in English. public/ornek/en.json is a layer over the sample's own JSON:
// shelf id → name, book id → title, spine, course, language and the names of its units / topics / chapters
// (matched by their order; the folders stay as they are). Applied to the raw JSON before parsing, only when
// the interface is English. A name the layer doesn't have stays Turkish (dil-kontrol.mjs lists them).
// Pure, tested. Nothing here is written to Drive except through the set-up's sample book (kurulum.ts).

export interface KitapKatmani {
  baslik?: string;
  sirt?: string;
  ders?: string;
  dil?: string;
  uniteler?: { baslik?: string; konular?: string[] }[];
  bolumler?: string[];
}

export interface OrnekKatman {
  raflar: Record<string, string>;
  kitaplar: Record<string, KitapKatmani>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const metin = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v : undefined;

// en.json → the layer (anything unexpected is left out)
export function katmanOku(json: unknown): OrnekKatman {
  const o = isObj(json) ? json : {};
  const raflar: Record<string, string> = {};
  if (isObj(o.raflar)) for (const [id, ad] of Object.entries(o.raflar)) { const m = metin(ad); if (m) raflar[id] = m; }
  const kitaplar: Record<string, KitapKatmani> = {};
  if (isObj(o.kitaplar)) for (const [id, k] of Object.entries(o.kitaplar)) if (isObj(k)) kitaplar[id] = k as KitapKatmani;
  return { raflar, kitaplar };
}

// kitaplik.json: the shelves' names
export function kitaplikCevir(json: unknown, k: OrnekKatman): unknown {
  if (!isObj(json) || !Array.isArray(json.raflar)) return json;
  return {
    ...json,
    raflar: json.raflar.map(r => isObj(r) && typeof r.id === 'string' && k.raflar[r.id] ? { ...r, ad: k.raflar[r.id] } : r)
  };
}

const adli = <T>(eski: T, yeni: string | undefined): T => isObj(eski) && yeni ? { ...eski, baslik: yeni } : eski;

// kitap.json: title, spine, course, language, and the names by their order
export function kitapCevir(id: string, json: unknown, k: OrnekKatman): unknown {
  const c = k.kitaplar[id];
  if (!c || !isObj(json)) return json;
  const out: Obj = { ...json };
  for (const a of ['baslik', 'sirt', 'ders', 'dil'] as const) { const m = metin(c[a]); if (m) out[a] = m; }
  if (Array.isArray(json.uniteler)) {
    out.uniteler = json.uniteler.map((u, i) => {
      const cu = c.uniteler?.[i];
      const yeni = adli(u, metin(cu?.baslik));
      if (!isObj(yeni) || !Array.isArray(yeni.konular)) return yeni;
      return { ...yeni, konular: yeni.konular.map((t, j) => adli(t, metin(cu?.konular?.[j]))) };
    });
  }
  if (Array.isArray(json.bolumler)) out.bolumler = json.bolumler.map((b, i) => adli(b, metin(c.bolumler?.[i])));
  return out;
}
