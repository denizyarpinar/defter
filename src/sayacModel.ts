export const EVENT_TYPES = ['cihaz', 'demo', 'giris', 'kitaplik', 'kitap', 'ozet', 'foto'] as const;
export type EventType = typeof EVENT_TYPES[number];
export type DailyCounts = { tarih: string; sayilar: Record<EventType, number> };
export type CounterData = { gunler: DailyCounts[] };
export const utcDay = (time: number): string => new Date(time).toISOString().slice(0, 10);
