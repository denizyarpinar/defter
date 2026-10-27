// 6.4b-AI: one notebook page (JPEG) → Claude transcription as JSON (6.4c-1: parts inside a line). 6.4c-4: also in
// production; only the owner's Google account may call it. GET is the free status query ({ acik }: may this
// account read? no Anthropic request, not counted in the limit). No npm SDK (raw fetch),
// no relative imports (the function is bundled on its own). The Anthropic key and the Google token
// never reach a log, an error text or the response.

declare const process: { env: Record<string, string | undefined> };

export interface OkuDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  simdi: () => number;
}

export const OKU_MODELLER = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const;
export const MAX_GOVDE = 4 * 1024 * 1024;     // Vercel's request limit is 4.5 MB
export const MAX_JPEG = 3 * 1024 * 1024;
export const MAX_KENAR = 2000;
export const SINIR = { pencereMs: 60_000, istek: 10 };

const RENKLER = ['siyah', 'mavi', 'kirmizi', 'yesil', 'kursun', 'diger'] as const;
const PARCA_TURLERI = ['yazi', 'formul'] as const;

// 6.4c-1: parts inside a line (red German + blue Turkish in one line = two parts); spelling as written,
// a correction only in its own field. The answer is turned into the record's shape (src/ocr/kayit/sema.ts).
const SISTEM = `You transcribe one photographed or scanned page of handwritten study notes.
- Transcribe exactly as written. Do not correct spelling, grammar or punctuation in metin; do not complete or guess words.
- If a word is clearly misspelled and you are sure what was meant, put the corrected text of that part in duzeltme; otherwise duzeltme is "".
- Mark every illegible word or fragment with [?].
- Keep Turkish and German letters exactly (ä ö ü ß ç ğ ı İ ş). Notes often mix Turkish and German.
- One entry per written line, in reading order. girinti is the visual indent level (0 = left margin, 1, 2, ...).
- A line is split into parts wherever the ink colour, struck-through state or kind changes (e.g. a red German word followed by its blue Turkish meaning = two parts). Parts are joined with one space when shown; do not add leading or trailing spaces.
- renk is the ink colour of the part; use "kursun" for pencil, "diger" for anything else.
- Write formulas as LaTeX (e.g. \\vec{a} \\cdot \\vec{b}) in a part with tur "formul"; other parts have tur "yazi".
- Struck-through parts are still transcribed, with ustuCizili true.
- For drawings or diagrams use a line with cizim: a short description (no parcalar).`;

const PARCA = {
  type: 'object',
  properties: {
    metin: { type: 'string' },
    renk: { type: 'string', enum: [...RENKLER] },
    tur: { type: 'string', enum: [...PARCA_TURLERI] },
    ustuCizili: { type: 'boolean' },
    duzeltme: { type: 'string' }
  },
  required: ['metin', 'renk', 'tur', 'ustuCizili', 'duzeltme'],
  additionalProperties: false
};

const SEMA = {
  type: 'object',
  properties: {
    satirlar: {
      type: 'array',
      items: {
        anyOf: [
          { type: 'object', properties: { girinti: { type: 'integer' }, parcalar: { type: 'array', items: PARCA } }, required: ['girinti', 'parcalar'], additionalProperties: false },
          { type: 'object', properties: { girinti: { type: 'integer' }, cizim: { type: 'string' } }, required: ['girinti', 'cizim'], additionalProperties: false }
        ]
      }
    }
  },
  required: ['satirlar'],
  additionalProperties: false
};

// The model's answer (every field present) and the record's shape (defaults left out)
interface ModelParca { metin: string; renk: typeof RENKLER[number]; tur: typeof PARCA_TURLERI[number]; ustuCizili: boolean; duzeltme: string }
type ModelSatir = { girinti: number; parcalar: ModelParca[] } | { girinti: number; cizim: string };
export interface Parca { metin: string; renk: typeof RENKLER[number]; tur?: 'formul'; ustuCizili?: true; duzeltme?: string }
export type Satir = { girinti: number; parcalar: Parca[] } | { girinti: number; cizim: string };
export interface OkuSonuc { satirlar: Satir[]; model: string; sureMs: number; kullanim: { input_tokens: number; output_tokens: number } }

// requests per e-mail in this function instance (simple limit: instances do not share it)
const istekler = new Map<string, number[]>();
export function sinirSifirla(): void { istekler.clear(); }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
// Task 6.5-4a: `hata` stays the Turkish text (older pages show it as it is); `kod` is a fixed code the page
// turns into its own language (claudeMotor.ts). Values a text needs travel in their own fields (kenar, durum, eksik).
export type HataKodu =
  | 'giris_yok' | 'giris_gecersiz' | 'google_ulasilamadi' | 'giris_baska' | 'sahip_degil' | 'drive_ulasilamadi'
  | 'yontem' | 'ayar_eksik' | 'hiz_siniri' | 'cok_buyuk' | 'json_degil' | 'model_bilinmiyor' | 'gorsel_yok'
  | 'base64_degil' | 'jpeg_degil' | 'kenar_buyuk' | 'model_ulasilamadi' | 'model_hata' | 'model_bozuk'
  | 'model_reddetti' | 'model_yarida' | 'model_bicim';
const hata = (status: number, kod: HataKodu, mesaj: string, ek: Record<string, unknown> = {}) => json(status, { hata: mesaj, kod, ...ek });

// Short 403 reason codes for the page; they never carry a value (no e-mail, no token).
export type RedNedeni = 'email-yok' | 'email-dogrulanmamis' | 'sahip-degil';

// Both sides: trim, drop wrapping quotes (a pasted "a@b.c"), lower case.
export const epostaNormal = (s: string): string => s.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase();

// Width/height from the JPEG frame header (SOF marker); null if it is not a readable JPEG.
export function jpegBoyutu(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

function base64Coz(s: string): Uint8Array | null {
  try {
    const ikili = atob(s);
    const b = new Uint8Array(ikili.length);
    for (let i = 0; i < ikili.length; i++) b[i] = ikili.charCodeAt(i);
    return b;
  } catch { return null; }
}

const girintiMi = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;

function parcaGecerli(p: unknown): p is ModelParca {
  const r = p as Partial<ModelParca> | null;
  return !!r && typeof r.metin === 'string' && RENKLER.includes(r.renk as never) && PARCA_TURLERI.includes(r.tur as never)
    && typeof r.ustuCizili === 'boolean' && typeof r.duzeltme === 'string';
}

export function sonucGecerli(x: unknown): x is { satirlar: ModelSatir[] } {
  if (!x || typeof x !== 'object') return false;
  const o = x as { satirlar?: unknown };
  return Array.isArray(o.satirlar) && o.satirlar.every(s => {
    const r = s as { girinti?: unknown; parcalar?: unknown; cizim?: unknown } | null;
    if (!r || !girintiMi(r.girinti)) return false;
    if (Array.isArray(r.parcalar)) return r.cizim === undefined && r.parcalar.every(parcaGecerli);
    return typeof r.cizim === 'string';
  });
}

// Model answer → the record's shape: tur "yazi", ustuCizili false and an empty / same duzeltme are left out
export function satirlariNormallestir(satirlar: ModelSatir[]): Satir[] {
  return satirlar.map(s => {
    if (!('parcalar' in s)) return { girinti: s.girinti, cizim: s.cizim };
    return {
      girinti: s.girinti,
      parcalar: s.parcalar.map(p => {
        const o: Parca = { metin: p.metin, renk: p.renk };
        if (p.tur === 'formul') o.tur = 'formul';
        if (p.ustuCizili) o.ustuCizili = true;
        if (p.duzeltme && p.duzeltme !== p.metin) o.duzeltme = p.duzeltme;
        return o;
      })
    };
  });
}

const AYARLAR = ['ANTHROPIC_API_KEY', 'VITE_GOOGLE_CLIENT_ID', 'VITE_SAHIP_EPOSTA'] as const;

// 6.4c-4: the Google sign-in must belong to this app and to the owner. The owner's (normalised) e-mail, or the
// error answer. POST and the GET status query share it.
async function sahipDogrula(request: Request, deps: OkuDeps): Promise<{ eposta: string } | { cevap: Response }> {
  const { env } = deps;
  const yetki = request.headers.get('authorization') ?? '';
  const token = /^Bearer (\S+)$/.exec(yetki)?.[1];
  if (!token) return { cevap: hata(401, 'giris_yok', 'Google girişi yok. Tekrar giriş yap.') };
  let bilgi: { aud?: string; email?: string; email_verified?: string | boolean; expires_in?: string | number };
  try {
    const r = await deps.fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!r.ok) return { cevap: hata(401, 'giris_gecersiz', 'Google girişi doğrulanamadı. Tekrar giriş yap.') };
    bilgi = await r.json() as typeof bilgi;
  } catch {
    return { cevap: hata(502, 'google_ulasilamadi', 'Google doğrulamasına ulaşılamadı. Bağlantını kontrol et ve tekrar dene.') };
  }
  if (bilgi.aud !== env.VITE_GOOGLE_CLIENT_ID || !(Number(bilgi.expires_in) > 0)) {
    return { cevap: hata(401, 'giris_baska', 'Google girişi bu uygulamaya ait değil ya da süresi dolmuş. Tekrar giriş yap.') };
  }
  // field names only (no values), so the page can show what tokeninfo returned
  const alanlar = Object.keys(bilgi).sort();
  const red = (neden: RedNedeni, ek: Record<string, unknown> = {}) =>
    ({ cevap: hata(403, 'sahip_degil', 'El yazısı okuma sadece sahip hesabıyla kullanılabilir.', { neden, alanlar, ...ek }) });
  let eposta = typeof bilgi.email === 'string' ? epostaNormal(bilgi.email) : '';
  let kaynak: 'tokeninfo' | 'drive' = 'tokeninfo';
  if (eposta) {
    if (bilgi.email_verified !== true && bilgi.email_verified !== 'true') return red('email-dogrulanmamis');
  } else {
    // The app asks only for Drive scopes, no 'email' scope: then tokeninfo has no e-mail.
    // Same token, read-only Drive about (no new Google permission); that address is the account's own.
    try {
      const r = await deps.fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const about = await r.json() as { user?: { emailAddress?: unknown } };
        if (typeof about.user?.emailAddress === 'string') { eposta = epostaNormal(about.user.emailAddress); kaynak = 'drive'; }
      }
    } catch {
      return { cevap: hata(502, 'drive_ulasilamadi', 'Drive’dan hesap bilgisi alınamadı. Bağlantını kontrol et ve tekrar dene.') };
    }
    if (!eposta) return red('email-yok');
  }
  const sahip = epostaNormal(env.VITE_SAHIP_EPOSTA!);
  // lengths and source only: enough to tell a wrong account from a broken setting, no value
  if (eposta !== sahip) return red('sahip-degil', { ipucu: `${kaynak}-eposta-uzunluk=${eposta.length}, sahip-uzunluk=${sahip.length}` });
  return { eposta };
}

// 6.4c-4: GET → { acik }: true only with all settings, a valid token and the owner. Free: no Anthropic request,
// not counted in the limit. 502 (Google unreachable) is the only non-200 answer; the page does not keep it.
export async function durumIstegi(request: Request, deps: OkuDeps): Promise<Response> {
  if (AYARLAR.some(k => !deps.env[k])) return json(200, { acik: false });
  const d = await sahipDogrula(request, deps);
  if ('eposta' in d) return json(200, { acik: true });
  return d.cevap.status === 502 ? d.cevap : json(200, { acik: false });
}

export async function okuIstegi(request: Request, deps: OkuDeps): Promise<Response> {
  const { env } = deps;
  if (request.method === 'GET') return durumIstegi(request, deps);
  if (request.method !== 'POST') return hata(405, 'yontem', 'Sadece POST.');

  const eksik = AYARLAR.filter(k => !env[k]);
  if (eksik.length) return hata(500, 'ayar_eksik', `Sunucu ayarı eksik: ${eksik.join(', ')}. Vercel'de development (vercel dev), preview ya da production ortamına ekle, sonra vercel dev'i yeniden başlat ya da yeniden yayınla.`, { eksik });

  // 1. Google sign-in: the token must belong to this app and to the owner
  const d = await sahipDogrula(request, deps);
  if ('cevap' in d) return d.cevap;
  const eposta = d.eposta;

  // 2. simple rate limit
  const simdi = deps.simdi();
  const son = (istekler.get(eposta) ?? []).filter(t => simdi - t < SINIR.pencereMs);
  if (son.length >= SINIR.istek) { istekler.set(eposta, son); return hata(429, 'hiz_siniri', 'Dakikada en fazla 10 istek. Bir dakika bekle.', { sinir: SINIR.istek }); }
  son.push(simdi); istekler.set(eposta, son);

  // 3. body: { model, gorsel (base64 JPEG) }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_GOVDE) return hata(413, 'cok_buyuk', 'Görsel çok büyük (en fazla 3 MB JPEG).');
  const metin = await request.text();
  if (metin.length > MAX_GOVDE) return hata(413, 'cok_buyuk', 'Görsel çok büyük (en fazla 3 MB JPEG).');
  let govde: { model?: unknown; gorsel?: unknown };
  try { govde = JSON.parse(metin); } catch { return hata(400, 'json_degil', 'İstek okunamadı (JSON değil).'); }
  const model = govde.model;
  if (typeof model !== 'string' || !(OKU_MODELLER as readonly string[]).includes(model)) {
    return hata(400, 'model_bilinmiyor', `Bilinmeyen model. İzin verilenler: ${OKU_MODELLER.join(', ')}.`);
  }
  if (typeof govde.gorsel !== 'string' || !govde.gorsel) return hata(400, 'gorsel_yok', 'Görsel yok.');
  const gorsel = govde.gorsel;
  if (gorsel.length * 3 / 4 > MAX_JPEG + 4) return hata(413, 'cok_buyuk', 'Görsel çok büyük (en fazla 3 MB JPEG).');
  const bayt = base64Coz(gorsel);
  if (!bayt) return hata(400, 'base64_degil', 'Görsel okunamadı (base64 değil).');
  const boyut = jpegBoyutu(bayt);
  if (!boyut) return hata(415, 'jpeg_degil', 'Sadece JPEG görsel gönderilebilir.');
  if (Math.max(boyut.w, boyut.h) > MAX_KENAR) return hata(413, 'kenar_buyuk', `Görselin uzun kenarı en fazla ${MAX_KENAR} px olabilir.`, { kenar: MAX_KENAR });

  // 4. Claude (structured output → JSON); no fallback: the measurement is for the named model
  const basla = deps.simdi();
  let cevap: Response;
  try {
    cevap = await deps.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: SISTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: gorsel } },
            { type: 'text', text: 'Transcribe this page.' }
          ]
        }],
        output_config: { format: { type: 'json_schema', schema: SEMA } }
      })
    });
  } catch {
    return hata(502, 'model_ulasilamadi', 'Modele ulaşılamadı. Bağlantını kontrol et ve tekrar dene.');
  }
  if (!cevap.ok) return hata(502, 'model_hata', `Model isteği başarısız (durum ${cevap.status}).`, { durum: cevap.status });

  let mesaj: { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  try { mesaj = await cevap.json() as typeof mesaj; } catch { return hata(502, 'model_bozuk', 'Model yanıtı okunamadı (bozuk JSON).'); }
  if (mesaj.stop_reason === 'refusal') return hata(422, 'model_reddetti', 'Model bu sayfayı okumayı reddetti. Başka bir sayfa dene.');
  if (mesaj.stop_reason === 'max_tokens') return hata(502, 'model_yarida', 'Model yanıtı yarıda kesildi (çok uzun sayfa).');
  const yazi = (mesaj.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
  let sonuc: unknown;
  try { sonuc = JSON.parse(yazi); } catch { return hata(502, 'model_bozuk', 'Model yanıtı okunamadı (bozuk JSON). Tekrar dene.'); }
  if (!sonucGecerli(sonuc)) return hata(502, 'model_bicim', 'Model yanıtı beklenen biçimde değil. Tekrar dene.');

  const govdeSonuc: OkuSonuc = {
    satirlar: satirlariNormallestir(sonuc.satirlar),
    model,
    sureMs: deps.simdi() - basla,
    kullanim: { input_tokens: mesaj.usage?.input_tokens ?? 0, output_tokens: mesaj.usage?.output_tokens ?? 0 }
  };
  return json(200, govdeSonuc);
}

const gercek = (): OkuDeps => ({ env: process.env, fetch: (...a) => fetch(...a), simdi: () => Date.now() });
export function POST(request: Request): Promise<Response> { return okuIstegi(request, gercek()); }
export function GET(request: Request): Promise<Response> { return okuIstegi(request, gercek()); }
