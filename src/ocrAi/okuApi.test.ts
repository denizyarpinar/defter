import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_GOVDE, epostaNormal, okuIstegi, sinirSifirla, jpegBoyutu, sonucGecerli, satirlariNormallestir, type OkuDeps } from '../../api/oku';

// Lives under src/ (not api/): every file in api/ becomes a Vercel function.
const ANAHTAR = 'sk-ant-SAHTE-anahtar-123';
const TOKEN = 'ya29.SAHTE-google-token';
const ENV = { ANTHROPIC_API_KEY: ANAHTAR, VITE_GOOGLE_CLIENT_ID: 'istemci.apps.googleusercontent.com', VITE_SAHIP_EPOSTA: 'Sahip@Example.com', VERCEL_ENV: 'development' };

function jpeg(w: number, h: number, ek = 32): string {
  const b = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, ...Array(ek).fill(0)];
  return btoa(String.fromCharCode(...b));
}

const tokenBilgi = (o: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ aud: ENV.VITE_GOOGLE_CLIENT_ID, email: 'sahip@example.com', email_verified: 'true', expires_in: '3000', ...o }));
const modelCevap = (metin: string, o: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: metin }], usage: { input_tokens: 1500, output_tokens: 400 }, ...o }));
const parca = (metin: string, renk: string, o: Record<string, unknown> = {}) => ({ metin, renk, tur: 'yazi', ustuCizili: false, duzeltme: '', ...o });
const iyiSonuc = JSON.stringify({ satirlar: [{ girinti: 1, parcalar: [parca('Graphen [?]', 'mavi')] }] });

function kur(yanitlar: Array<Response | Error>, env: Record<string, string | undefined> = ENV) {
  const fetchSahte = vi.fn(async () => {
    const y = yanitlar.shift();
    if (!y) throw new Error('beklenmeyen fetch');
    if (y instanceof Error) throw y;
    return y;
  });
  const deps: OkuDeps = { env, fetch: fetchSahte as unknown as typeof fetch, simdi: () => 1_000_000 };
  return { deps, fetchSahte };
}

function istek(govde: unknown = { model: 'claude-haiku-5-5', gorsel: jpeg(1500, 2000) }, yetki: string | null = `Bearer ${TOKEN}`, method = 'POST') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (yetki) headers.authorization = yetki;
  return new Request('http://localhost/api/oku', { method, headers, ...(method === 'POST' ? { body: typeof govde === 'string' ? govde : JSON.stringify(govde) } : {}) });
}

let konsol: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  sinirSifirla();
  konsol.forEach(s => s.mockRestore());
  konsol = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k => vi.spyOn(console, k).mockImplementation(() => {}));
});

async function sonuc(r: Response) {
  const metin = await r.text();
  // the key and the Google token never appear in a response or a log
  expect(metin).not.toContain(ANAHTAR);
  expect(metin).not.toContain(TOKEN);
  for (const s of konsol) expect(JSON.stringify(s.mock.calls)).not.toContain(ANAHTAR);
  for (const s of konsol) expect(JSON.stringify(s.mock.calls)).not.toContain(TOKEN);
  return { status: r.status, govde: JSON.parse(metin) as Record<string, unknown> };
}

describe('api/oku', () => {
  // 6.4c-4: production is open too; the owner check stays
  it('production: sahip olmayan hesap 403, Anthropic çağrılmaz', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi({ email: 'baska@example.com' })], { ...ENV, VERCEL_ENV: 'production' });
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(403);
    expect(r.govde.neden).toBe('sahip-degil');
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('production: sahip → 200', async () => {
    const { deps } = kur([tokenBilgi(), modelCevap(iyiSonuc)], { ...ENV, VERCEL_ENV: 'production' });
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(200);
  });

  it('anahtar yoksa 500 + değişkenin adı, değeri yok', async () => {
    const { deps, fetchSahte } = kur([], { ...ENV, ANTHROPIC_API_KEY: undefined });
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(500);
    expect(String(r.govde.hata)).toContain('ANTHROPIC_API_KEY');
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it('PUT: 405', async () => {
    const { deps } = kur([]);
    expect((await sonuc(await okuIstegi(istek(undefined, null, 'PUT'), deps))).status).toBe(405);
  });

  it('token yok: 401, Google ve Anthropic çağrılmaz', async () => {
    const { deps, fetchSahte } = kur([]);
    expect((await sonuc(await okuIstegi(istek(undefined, null), deps))).status).toBe(401);
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it('tokeninfo hata verirse 401', async () => {
    const { deps, fetchSahte } = kur([new Response('{"error":"invalid_token"}', { status: 400 })]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(401);
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('başka uygulamanın token’ı (aud farklı): 401', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi({ aud: 'baska.apps.googleusercontent.com' })]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(401);
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('sahip olmayan hesap: 403 sahip-degil, e-posta yanıtta yok', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi({ email: 'baska@example.com' })]);
    const r = await okuIstegi(istek(), deps);
    const metin = await r.clone().text();
    const s = await sonuc(r);
    expect(s.status).toBe(403);
    expect(s.govde.neden).toBe('sahip-degil');
    expect(metin).not.toContain('baska@example.com');
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  // Drive-only scopes: tokeninfo has no email / email_verified (real cause of the 403 in 6.4b-AI)
  const darTokenBilgi = () => new Response(JSON.stringify({ azp: ENV.VITE_GOOGLE_CLIENT_ID, aud: ENV.VITE_GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file', exp: '1999999999', expires_in: '3000', access_type: 'online' }));
  const about = (emailAddress?: string, status = 200) => new Response(JSON.stringify(emailAddress ? { user: { emailAddress } } : {}), { status });

  it('tokeninfo’da email yoksa e-posta aynı token’la Drive about’tan alınır → 200', async () => {
    const { deps, fetchSahte } = kur([darTokenBilgi(), about('SAHIP@example.com'), modelCevap(iyiSonuc)]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(200);
    const [url, init] = fetchSahte.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('Drive about başka hesap derse: 403 sahip-degil + uzunluk ipucu, değer yok, Anthropic çağrılmaz', async () => {
    const { deps, fetchSahte } = kur([darTokenBilgi(), about('baska.hesap@example.com')]);
    const r = await okuIstegi(istek(), deps);
    const metin = await r.clone().text();
    const s = await sonuc(r);
    expect(s.status).toBe(403);
    expect(s.govde.neden).toBe('sahip-degil');
    expect(s.govde.ipucu).toBe('drive-eposta-uzunluk=23, sahip-uzunluk=17');
    expect(metin).not.toContain('baska.hesap@example.com');
    expect(metin.toLowerCase()).not.toContain('sahip@example.com');
    expect(s.govde.alanlar).toEqual(['access_type', 'aud', 'azp', 'exp', 'expires_in', 'scope']);
    expect(fetchSahte).toHaveBeenCalledTimes(2);
  });

  it('karşılaştırma: boşluk, tırnak ve büyük harf iki tarafta da yok sayılır', async () => {
    expect(epostaNormal('  "Sahip@Example.com"\n')).toBe('sahip@example.com');
    expect(epostaNormal("'a@b.co'")).toBe('a@b.co');
    const env = { ...ENV, VITE_SAHIP_EPOSTA: ' "Sahip@Example.COM" \r\n' };
    const { deps } = kur([darTokenBilgi(), about(' SAHIP@example.com '), modelCevap(iyiSonuc)], env);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(200);
  });

  it('ne tokeninfo ne Drive about e-posta verirse: 403 email-yok', async () => {
    for (const a of [about(undefined), about('sahip@example.com', 403)]) {
      sinirSifirla();
      const { deps } = kur([darTokenBilgi(), a]);
      const s = await sonuc(await okuIstegi(istek(), deps));
      expect(s.status).toBe(403);
      expect(s.govde.neden).toBe('email-yok');
    }
  });

  it('email_verified hem metin "true" hem boolean true kabul; "false" → email-dogrulanmamis', async () => {
    for (const v of ['true', true]) {
      const { deps } = kur([tokenBilgi({ email_verified: v }), modelCevap(iyiSonuc)]);
      expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(200);
    }
    const { deps } = kur([tokenBilgi({ email_verified: 'false' })]);
    const s = await sonuc(await okuIstegi(istek(), deps));
    expect(s.status).toBe(403);
    expect(s.govde.neden).toBe('email-dogrulanmamis');
  });

  it('çok büyük gövde: 413, Anthropic çağrılmaz', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi()]);
    const r = await sonuc(await okuIstegi(istek({ model: 'claude-haiku-5-5', gorsel: 'A'.repeat(MAX_GOVDE + 10) }), deps));
    expect(r.status).toBe(413);
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('uzun kenarı 2000 px’ten büyük: 413', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi()]);
    expect((await sonuc(await okuIstegi(istek({ model: 'claude-haiku-5-5', gorsel: jpeg(2400, 1800) }), deps))).status).toBe(413);
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('JPEG değil: 415', async () => {
    const { deps } = kur([tokenBilgi()]);
    const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0));
    expect((await sonuc(await okuIstegi(istek({ model: 'claude-haiku-5-5', gorsel: png }), deps))).status).toBe(415);
  });

  it('bilinmeyen model: 400', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi()]);
    expect((await sonuc(await okuIstegi(istek({ model: 'claude-opus-5-5', gorsel: jpeg(10, 10) }), deps))).status).toBe(400);
    expect(fetchSahte).toHaveBeenCalledTimes(1);
  });

  it('başarı: satırlar, ham metin, süre ve token; Anthropic’e doğru istek', async () => {
    const { deps, fetchSahte } = kur([tokenBilgi(), modelCevap(iyiSonuc)]);
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(200);
    expect(r.govde).toMatchObject({ model: 'claude-haiku-5-5', kullanim: { input_tokens: 1500, output_tokens: 400 } });
    expect(r.govde.satirlar).toEqual([{ girinti: 1, parcalar: [{ metin: 'Graphen [?]', renk: 'mavi' }] }]);
    expect(r.govde.hamMetin).toBeUndefined();
    const [url, init] = fetchSahte.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(ANAHTAR);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.properties.satirlar.items.anyOf).toHaveLength(2);
    expect(body.system).toContain('duzeltme');
    expect(body.fallbacks).toBeUndefined();
  });

  it('model metni bozuk JSON: 502 + anlaşılır Türkçe mesaj', async () => {
    const { deps } = kur([tokenBilgi(), modelCevap('{"satirlar": [ yarım')]);
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(502);
    expect(String(r.govde.hata)).toContain('bozuk JSON');
  });

  it('şemaya uymayan yanıt: 502', async () => {
    const { deps } = kur([tokenBilgi(), modelCevap(JSON.stringify({ satirlar: [{ girinti: 0, parcalar: [parca('x', 'mor')] }] }))]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(502);
  });

  it('6.4b biçimi (satır başına tek renk) artık 502', async () => {
    const { deps } = kur([tokenBilgi(), modelCevap(JSON.stringify({ satirlar: [{ metin: 'x', renk: 'mavi', girinti: 0, tur: 'yazi', ustuCizili: false }], hamMetin: 'x' }))]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(502);
  });

  it('aynı satırda kırmızı DE + mavi TR: iki parça, kendi renginde; çizim satırı; normalleştirme', async () => {
    const model = { satirlar: [
      { girinti: 0, parcalar: [parca('der Knoten', 'kirmizi'), parca('düğüm', 'mavi')] },
      { girinti: 1, parcalar: [parca('\\deg(v)', 'siyah', { tur: 'formul' }), parca('Kantn', 'kursun', { ustuCizili: true, duzeltme: 'Kante' }), parca('aynı', 'siyah', { duzeltme: 'aynı' })] },
      { girinti: 1, cizim: 'üç düğümlü graf' }
    ] };
    expect(sonucGecerli(model)).toBe(true);
    const { deps } = kur([tokenBilgi(), modelCevap(JSON.stringify(model))]);
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(200);
    expect(r.govde.satirlar).toEqual([
      { girinti: 0, parcalar: [{ metin: 'der Knoten', renk: 'kirmizi' }, { metin: 'düğüm', renk: 'mavi' }] },
      { girinti: 1, parcalar: [{ metin: '\\deg(v)', renk: 'siyah', tur: 'formul' }, { metin: 'Kantn', renk: 'kursun', ustuCizili: true, duzeltme: 'Kante' }, { metin: 'aynı', renk: 'siyah' }] },
      { girinti: 1, cizim: 'üç düğümlü graf' }
    ]);
  });

  it('sonucGecerli: hem parcalar hem cizim, eksik duzeltme, negatif girinti → geçersiz', () => {
    expect(sonucGecerli({ satirlar: [{ girinti: 0, parcalar: [], cizim: 'x' }] })).toBe(false);
    expect(sonucGecerli({ satirlar: [{ girinti: 0, parcalar: [{ metin: 'x', renk: 'mavi', tur: 'yazi', ustuCizili: false }] }] })).toBe(false);
    expect(sonucGecerli({ satirlar: [{ girinti: -1, cizim: 'x' }] })).toBe(false);
    expect(satirlariNormallestir([])).toEqual([]);
  });

  it('Anthropic hata gövdesi istemciye aktarılmaz', async () => {
    const { deps } = kur([tokenBilgi(), new Response(`{"error":{"message":"invalid x-api-key ${ANAHTAR}"}}`, { status: 401 })]);
    const r = await sonuc(await okuIstegi(istek(), deps));
    expect(r.status).toBe(502);
    expect(String(r.govde.hata)).toBe('Model isteği başarısız (durum 401).');
  });

  it('ret (refusal): 422', async () => {
    const { deps } = kur([tokenBilgi(), modelCevap('', { stop_reason: 'refusal' })]);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(422);
  });

  it('dakikada 11. istek: 429, Anthropic çağrılmaz', async () => {
    const yanitlar: Response[] = [];
    for (let i = 0; i < 10; i++) yanitlar.push(tokenBilgi(), modelCevap(iyiSonuc));
    yanitlar.push(tokenBilgi());
    const { deps, fetchSahte } = kur(yanitlar);
    for (let i = 0; i < 10; i++) expect((await okuIstegi(istek(), deps)).status).toBe(200);
    expect((await sonuc(await okuIstegi(istek(), deps))).status).toBe(429);
    expect(fetchSahte).toHaveBeenCalledTimes(21);
  });

  // 6.4c-4: the free status query (GET)
  describe('durum (GET)', () => {
    const durum = async (yanitlar: Array<Response | Error>, env: Record<string, string | undefined> = ENV, yetki: string | null = `Bearer ${TOKEN}`) => {
      const { deps, fetchSahte } = kur(yanitlar, env);
      const r = await sonuc(await okuIstegi(istek(undefined, yetki, 'GET'), deps));
      return { ...r, fetchSahte };
    };

    it('sahip + anahtar: { acik: true }, Anthropic çağrılmaz', async () => {
      const r = await durum([tokenBilgi()], { ...ENV, VERCEL_ENV: 'production' });
      expect(r).toMatchObject({ status: 200, govde: { acik: true } });
      expect(r.fetchSahte).toHaveBeenCalledTimes(1);
      expect(String(r.fetchSahte.mock.calls[0])).toContain('tokeninfo');
    });

    it('sahip olmayan hesap: { acik: false }, e-posta yanıtta yok', async () => {
      const r = await durum([tokenBilgi({ email: 'baska@example.com' })]);
      expect(r.status).toBe(200);
      expect(r.govde).toEqual({ acik: false });
    });

    it('anahtar yok: { acik: false }, hiç istek yok', async () => {
      const r = await durum([], { ...ENV, ANTHROPIC_API_KEY: undefined });
      expect(r).toMatchObject({ status: 200, govde: { acik: false } });
      expect(r.fetchSahte).not.toHaveBeenCalled();
    });

    it('token yok ya da başka uygulamanın token’ı: { acik: false }', async () => {
      expect((await durum([], ENV, null)).govde).toEqual({ acik: false });
      expect((await durum([tokenBilgi({ aud: 'baska' })])).govde).toEqual({ acik: false });
    });

    it('Google’a ulaşılamazsa 502 (sayfa önbelleğe almaz)', async () => {
      expect((await durum([new Error('ağ')])).status).toBe(502);
    });

    it('10/dk sayacına girmez', async () => {
      const yanitlar: Response[] = [];
      for (let i = 0; i < 12; i++) yanitlar.push(tokenBilgi());
      for (let i = 0; i < 10; i++) yanitlar.push(tokenBilgi(), modelCevap(iyiSonuc));
      const { deps } = kur(yanitlar);
      for (let i = 0; i < 12; i++) expect((await okuIstegi(istek(undefined, `Bearer ${TOKEN}`, 'GET'), deps)).status).toBe(200);
      for (let i = 0; i < 10; i++) expect((await okuIstegi(istek(), deps)).status).toBe(200);
    });
  });

  it('jpegBoyutu SOF başlığını okur', () => {
    const b = Uint8Array.from(atob(jpeg(1500, 2000)), c => c.charCodeAt(0));
    expect(jpegBoyutu(b)).toEqual({ w: 1500, h: 2000 });
  });
});
