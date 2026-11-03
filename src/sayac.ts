import { type EventType, utcDay } from './sayacModel';

export const SAYAC_ACIK = true;
const sent = new Map<EventType, string>();

export function olay(type: EventType): void {
  try {
    const params = new URLSearchParams(location.search);
    if (!SAYAC_ACIK || !import.meta.env.PROD || location.hostname !== 'mydefter.app'
      || params.get('sayac') === '0' || params.get('analiz') === '0') return;
    if (type === 'cihaz' || type === 'demo') {
      const day = utcDay(Date.now());
      const key = type === 'cihaz' ? 'defter-sayac-gun' : 'defter-sayac-demo-gun';
      if (sent.get(type) === day) return;
      try { if (localStorage.getItem(key) === day) return; } catch { /* in-memory fallback */ }
      sent.set(type, day);
      try { localStorage.setItem(key, day); } catch { /* blocked storage must not interrupt the app */ }
    }
    const body = new Blob([JSON.stringify({ tur: type })], { type: 'text/plain;charset=UTF-8' });
    try {
      if (navigator.sendBeacon?.('/api/olay', body)) return;
    } catch { /* a rejected beacon still gets the fetch fallback */ }
    void fetch('/api/olay', { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch { /* counting never interrupts user actions */ }
}
