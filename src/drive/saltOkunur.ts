import { driveFetch } from './drive';

// Task 6.3-0a: a Drive request that can only read. Anything but a GET without a body is refused
// before it leaves the page. Every request of temizlikListesi.ts goes through here.
// Task 6.3-0b: saltOkunurSar puts the same guard around any fetcher (temizlikUygula's dry run).

export class SaltOkunurIhlal extends Error {
  constructor(ne: string) { super(`Salt okunur araç: ${ne} isteği engellendi. Bu araç Drive'a yazmaz; kodu kontrol et.`); }
}

export type Getirici = (path: string, init?: RequestInit) => Promise<Response>;

export function saltOkunurSar(f: Getirici): Getirici {
  return (path, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET') return Promise.reject(new SaltOkunurIhlal(method));
    if (init.body != null) return Promise.reject(new SaltOkunurIhlal('Gövdeli (body)'));
    return f(path, { ...init, method: 'GET' });
  };
}

export const saltOkunurFetch: Getirici = saltOkunurSar((path, init) => driveFetch(path, init));
