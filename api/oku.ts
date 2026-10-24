// 6.4b-AI: one notebook page (JPEG) → Claude transcription as JSON. Development/measurement only:
// production answers 404, only the owner's Google account may call it. No npm SDK (raw fetch),
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
const TURLER = ['yazi', 'formul', 'cizim'] as const;

const SISTEM = `You transcribe one photographed or scanned page of handwritten study notes.
- Transcribe exactly as written. Do not correct spelling, grammar or punctuation; do not complete or guess words.
- Mark every illegible word or fragment with [?].
- Keep Turkish and German letters exactly (ä ö ü ß ç ğ ı İ ş). Notes often mix Turkish and German.
- Write formulas as LaTeX (e.g. \\vec{a} \\cdot \\vec{b}) with tur "formul".
- For drawings or diagrams give a short description with tur "cizim".
- One entry per written line, in reading order. girinti is the visual indent level (0 = left margin, 1, 2, ...).
- renk is the ink colour; use "kursun" for pencil, "diger" for anything else.
- Struck-through lines are still transcribed, with ustuCizili true.
- hamMetin is the whole page as plain text, lines separated by newlines, in the same order.`;

const SEMA = {
  type: 'object',
  properties: {
    satirlar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metin: { type: 'string' },
          renk: { type: 'string', enum: [...RENKLER] },
          girinti: { type: 'integer' },
          tur: { type: 'string', enum: [...TURLER] },
          ustuCizili: { type: 'boolean' }
        },
        required: ['metin', 'renk', 'girinti', 'tur', 'ustuCizili'],
        additionalProperties: false
      }
    },
    hamMetin: { type: 'string' }
  },
  required: ['satirlar', 'hamMetin'],
  additionalProperties: false
};

export interface Satir { metin: string; renk: typeof RENKLER[number]; girinti: number; tur: typeof TURLER[number]; ustuCizili: boolean }
export interface OkuSonuc { satirlar: Satir[]; hamMetin: string; model: string; sureMs: number; kullanim: { input_tokens: number; output_tokens: number } }

// requests per e-mail in this function instance (simple limit: instances do not share it)
const istekler = new Map<string, number[]>();
export function sinirSifirla(): void { istekler.clear(); }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const hata = (status: number, mesaj: string, ek: Record<string, unknown> = {}) => json(status, { hata: mesaj, ...ek });

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

export function sonucGecerli(x: unknown): x is { satirlar: Satir[]; hamMetin: string } {
  if (!x || typeof x !== 'object') return false;
  const o = x as { satirlar?: unknown; hamMetin?: unknown };
  return typeof o.hamMetin === 'string' && Array.isArray(o.satirlar) && o.satirlar.every(s => {
    const r = s as Partial<Satir> | null;
    return !!r && typeof r.metin === 'string' && RENKLER.includes(r.renk as never) && Number.isInteger(r.girinti)
      && (r.girinti as number) >= 0 && TURLER.includes(r.tur as never) && typeof r.ustuCizili === 'boolean';
  });
}

export async function okuIstegi(request: Request, deps: OkuDeps): Promise<Response> {
  const { env } = deps;
  if (env.VERCEL_ENV === 'production') return hata(404, 'Bulunamadı.');
  if (request.method !== 'POST') return hata(405, 'Sadece POST.');

  const eksik = ['ANTHROPIC_API_KEY', 'VITE_GOOGLE_CLIENT_ID', 'VITE_SAHIP_EPOSTA'].filter(k => !env[k]);
  if (eksik.length) return hata(500, `Sunucu ayarı eksik: ${eksik.join(', ')}. Vercel'de development ortamına ekle ve vercel dev'i yeniden başlat.`);

  // 1. Google sign-in: the token must belong to this app and to the owner
  const yetki = request.headers.get('authorization') ?? '';
  const token = /^Bearer (\S+)$/.exec(yetki)?.[1];
  if (!token) return hata(401, 'Google girişi yok. Tekrar giriş yap.');
  let bilgi: { aud?: string; email?: string; email_verified?: string | boolean; expires_in?: string | number };
  try {
    const r = await deps.fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!r.ok) return hata(401, 'Google girişi doğrulanamadı. Tekrar giriş yap.');
    bilgi = await r.json() as typeof bilgi;
  } catch {
    return hata(502, 'Google doğrulamasına ulaşılamadı. Bağlantını kontrol et ve tekrar dene.');
  }
  if (bilgi.aud !== env.VITE_GOOGLE_CLIENT_ID || !(Number(bilgi.expires_in) > 0)) {
    return hata(401, 'Google girişi bu uygulamaya ait değil ya da süresi dolmuş. Tekrar giriş yap.');
  }
  // field names only (no values), so the page can show what tokeninfo returned
  const alanlar = Object.keys(bilgi).sort();
  const red = (neden: RedNedeni, ek: Record<string, unknown> = {}) => hata(403, 'Bu deneme sadece sahip hesabıyla kullanılabilir.', { neden, alanlar, ...ek });
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
      return hata(502, 'Drive’dan hesap bilgisi alınamadı. Bağlantını kontrol et ve tekrar dene.');
    }
    if (!eposta) return red('email-yok');
  }
  const sahip = epostaNormal(env.VITE_SAHIP_EPOSTA!);
  // lengths and source only: enough to tell a wrong account from a broken setting, no value
  if (eposta !== sahip) return red('sahip-degil', { ipucu: `${kaynak}-eposta-uzunluk=${eposta.length}, sahip-uzunluk=${sahip.length}` });

  // 2. simple rate limit
  const simdi = deps.simdi();
  const son = (istekler.get(eposta) ?? []).filter(t => simdi - t < SINIR.pencereMs);
  if (son.length >= SINIR.istek) { istekler.set(eposta, son); return hata(429, 'Dakikada en fazla 10 istek. Bir dakika bekle.'); }
  son.push(simdi); istekler.set(eposta, son);

  // 3. body: { model, gorsel (base64 JPEG) }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_GOVDE) return hata(413, 'Görsel çok büyük (en fazla 3 MB JPEG).');
  const metin = await request.text();
  if (metin.length > MAX_GOVDE) return hata(413, 'Görsel çok büyük (en fazla 3 MB JPEG).');
  let govde: { model?: unknown; gorsel?: unknown };
  try { govde = JSON.parse(metin); } catch { return hata(400, 'İstek okunamadı (JSON değil).'); }
  const model = govde.model;
  if (typeof model !== 'string' || !(OKU_MODELLER as readonly string[]).includes(model)) {
    return hata(400, `Bilinmeyen model. İzin verilenler: ${OKU_MODELLER.join(', ')}.`);
  }
  if (typeof govde.gorsel !== 'string' || !govde.gorsel) return hata(400, 'Görsel yok.');
  const gorsel = govde.gorsel;
  if (gorsel.length * 3 / 4 > MAX_JPEG + 4) return hata(413, 'Görsel çok büyük (en fazla 3 MB JPEG).');
  const bayt = base64Coz(gorsel);
  if (!bayt) return hata(400, 'Görsel okunamadı (base64 değil).');
  const boyut = jpegBoyutu(bayt);
  if (!boyut) return hata(415, 'Sadece JPEG görsel gönderilebilir.');
  if (Math.max(boyut.w, boyut.h) > MAX_KENAR) return hata(413, `Görselin uzun kenarı en fazla ${MAX_KENAR} px olabilir.`);

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
    return hata(502, 'Modele ulaşılamadı. Bağlantını kontrol et ve tekrar dene.');
  }
  if (!cevap.ok) return hata(502, `Model isteği başarısız (durum ${cevap.status}).`);

  let mesaj: { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  try { mesaj = await cevap.json() as typeof mesaj; } catch { return hata(502, 'Model yanıtı okunamadı (bozuk JSON).'); }
  if (mesaj.stop_reason === 'refusal') return hata(422, 'Model bu sayfayı okumayı reddetti. Başka bir sayfa dene.');
  if (mesaj.stop_reason === 'max_tokens') return hata(502, 'Model yanıtı yarıda kesildi (çok uzun sayfa).');
  const yazi = (mesaj.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
  let sonuc: unknown;
  try { sonuc = JSON.parse(yazi); } catch { return hata(502, 'Model yanıtı okunamadı (bozuk JSON). Tekrar dene.'); }
  if (!sonucGecerli(sonuc)) return hata(502, 'Model yanıtı beklenen biçimde değil. Tekrar dene.');

  const govdeSonuc: OkuSonuc = {
    satirlar: sonuc.satirlar,
    hamMetin: sonuc.hamMetin,
    model,
    sureMs: deps.simdi() - basla,
    kullanim: { input_tokens: mesaj.usage?.input_tokens ?? 0, output_tokens: mesaj.usage?.output_tokens ?? 0 }
  };
  return json(200, govdeSonuc);
}

const gercek = (): OkuDeps => ({ env: process.env, fetch: (...a) => fetch(...a), simdi: () => Date.now() });
export function POST(request: Request): Promise<Response> { return okuIstegi(request, gercek()); }
export function GET(request: Request): Promise<Response> { return okuIstegi(request, gercek()); }
