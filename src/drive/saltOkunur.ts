import { driveFetch } from './drive';

// Task 6.3-0a: a Drive request that can only read. Anything but a GET without a body is refused
// before it leaves the page. Every request of temizlikListesi.ts goes through here.

export class SaltOkunurIhlal extends Error {
  constructor(ne: string) { super(`Salt okunur araç: ${ne} isteği engellendi. Bu araç Drive'a yazmaz; kodu kontrol et.`); }
}

export async function saltOkunurFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') throw new SaltOkunurIhlal(method);
  if (init.body != null) throw new SaltOkunurIhlal('Gövdeli (body)');
  return driveFetch(path, { ...init, method: 'GET' });
}
