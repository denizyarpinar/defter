export interface SahipDeps { env: Record<string, string | undefined>; fetch: typeof fetch }

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
// Task 6.5-4a: `hata` stays the Turkish text (older pages show it as it is); `kod` is a fixed code the page
// turns into its own language (claudeMotor.ts). Values a text needs travel in their own fields (kenar, durum, eksik).
export type HataKodu =
  | 'giris_yok' | 'giris_gecersiz' | 'google_ulasilamadi' | 'giris_baska' | 'sahip_degil' | 'drive_ulasilamadi'
  | 'yontem' | 'ayar_eksik' | 'hiz_siniri' | 'cok_buyuk' | 'json_degil' | 'model_bilinmiyor' | 'gorsel_yok'
  | 'base64_degil' | 'jpeg_degil' | 'kenar_buyuk' | 'model_ulasilamadi' | 'model_hata' | 'model_bozuk'
  | 'model_reddetti' | 'model_yarida' | 'model_bicim';
export const hata = (status: number, kod: HataKodu, mesaj: string, ek: Record<string, unknown> = {}) => json(status, { hata: mesaj, kod, ...ek });

// Short 403 reason codes for the page; they never carry a value (no e-mail, no token).
export type RedNedeni = 'email-yok' | 'email-dogrulanmamis' | 'sahip-degil';

// Both sides: trim, drop wrapping quotes (a pasted "a@b.c"), lower case.
export const epostaNormal = (s: string): string => s.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase();

export async function sahipDogrula(request: Request, deps: SahipDeps): Promise<{ eposta: string } | { cevap: Response }> {
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

