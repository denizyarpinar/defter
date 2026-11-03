import { EVENT_TYPES, utcDay, type DailyCounts } from '../src/sayacModel.js';
import { json, sahipDogrula } from './_sahip.js';
import { redisBatch, redisConfig, type CounterDeps } from './_sayac.js';

declare const process: { env: Record<string, string | undefined> };

export async function panelIstegi(request: Request, deps: CounterDeps): Promise<Response> {
  if (request.method !== 'GET') return json(405, { kod: 'yontem' });
  if (!deps.env.VITE_GOOGLE_CLIENT_ID || !deps.env.VITE_SAHIP_EPOSTA) return json(503, { kod: 'ayar_eksik' });
  const owner = await sahipDogrula(request, deps);
  if ('cevap' in owner) return owner.cevap;
  if (!redisConfig(deps.env)) return json(503, { kod: 'sayac_ayarsiz' });
  const requested = Number(new URL(request.url).searchParams.get('gun') ?? 30);
  const days = Number.isFinite(requested) ? Math.max(1, Math.min(90, Math.floor(requested))) : 30;
  const now = deps.simdi();
  const dates = Array.from({ length: days }, (_, i) => utcDay(now - (days - i - 1) * 86400_000));
  try {
    const results = await redisBatch(deps, dates.map(date => ['HMGET', `sayac:${date}`, ...EVENT_TYPES]));
    const gunler: DailyCounts[] = dates.map((tarih, i) => {
      const values = results[i];
      if (!Array.isArray(values) || values.length !== EVENT_TYPES.length) throw new Error('counter_invalid');
      const sayilar = Object.fromEntries(EVENT_TYPES.map((type, index) => {
        const value = Number(values[index]);
        return [type, Number.isSafeInteger(value) && value >= 0 ? value : 0];
      })) as DailyCounts['sayilar'];
      return { tarih, sayilar };
    });
    return json(200, { gunler });
  } catch { return json(503, { kod: 'sayac_ulasilamadi' }); }
}

export function GET(request: Request): Promise<Response> {
  return panelIstegi(request, { env: process.env, fetch: (...args) => fetch(...args), simdi: Date.now });
}
