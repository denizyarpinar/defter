export interface CounterDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  simdi: () => number;
}

export function redisConfig(env: CounterDeps['env']): { url: string; token: string } | null {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  return null;
}

export async function redisBatch(deps: CounterDeps, commands: (string | number)[][], transaction = false): Promise<unknown[]> {
  const config = redisConfig(deps.env);
  if (!config) throw new Error('counter_unconfigured');
  const response = await deps.fetch(config.url.replace(/\/$/, '') + (transaction ? '/multi-exec' : '/pipeline'), {
    method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('counter_unavailable');
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length !== commands.length
    || data.some(item => !item || typeof item !== 'object' || 'error' in item || !('result' in item))) throw new Error('counter_invalid');
  return data.map(item => item.result as unknown);
}
