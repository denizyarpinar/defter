import { inject, type BeforeSendEvent } from '@vercel/analytics';

export const ANALIZ_ACIK = true;

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    return { ...event, url: url.origin + url.pathname };
  } catch {
    return null;
  }
}

export function analizBaslat(): void {
  try {
    if (!ANALIZ_ACIK || !import.meta.env.PROD || location.hostname !== 'mydefter.app'
      || new URLSearchParams(location.search).get('analiz') === '0') return;
    inject({ mode: 'auto', beforeSend });
  } catch {
    // Analytics must never interrupt the app, even when blocked by the browser.
  }
}
