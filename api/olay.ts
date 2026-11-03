import { EVENT_TYPES, utcDay, type EventType } from '../src/sayacModel.js';
import { redisBatch, redisConfig, type CounterDeps } from './_sayac.js';

declare const process: { env: Record<string, string | undefined> };
const requests = new Map<string, { start: number; count: number }>();
export function sinirSifirla(): void { requests.clear(); }
const empty = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function olayIstegi(request: Request, deps: CounterDeps): Promise<Response> {
  try {
    if (request.method !== 'POST' || request.headers.get('origin') !== 'https://mydefter.app' || !redisConfig(deps.env)) return empty();
    const now = deps.simdi();
    for (const [ip, entry] of requests) if (now - entry.start >= 60_000) requests.delete(ip);
    // Vercel supplies the forwarding header; addresses never leave this instance's memory.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
    const entry = requests.get(ip) ?? { start: now, count: 0 };
    requests.set(ip, entry);
    if (++entry.count > 30) return empty();
    if (Number(request.headers.get('content-length')) > 200) return empty();
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 200) { await reader.cancel(); return empty(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return new Response(null, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('tur' in body) || !EVENT_TYPES.includes(body.tur as EventType)) return new Response(null, { status: 400 });
    const key = `sayac:${utcDay(now)}`;
    await redisBatch(deps, [['HINCRBY', key, body.tur as EventType, 1], ['EXPIRE', key, 400 * 86400]], true);
  } catch {
    // Counting is best effort. Never log request data or interrupt the client.
  }
  return empty();
}

export function POST(request: Request): Promise<Response> {
  return olayIstegi(request, { env: process.env, fetch: (...args) => fetch(...args), simdi: Date.now });
}
