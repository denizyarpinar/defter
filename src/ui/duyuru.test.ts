import { describe, expect, it } from 'vitest';
import { AnnouncementState, ANNOUNCEMENT_ID } from './duyuru';

function store() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('duyuru gösterimi', () => {
  it('istek ve uygun oda olmadan açılmaz; engel kalkınca bekleyen duyuru açılabilir', () => {
    const state = new AnnouncementState(store(), store());
    expect(state.canOpen(true)).toBe(false);
    state.request();
    expect(state.canOpen(false)).toBe(false);
    expect(state.canOpen(true)).toBe(true);
  });
  it('aynı sekmede yenileme ve tekrar giriş duyuruyu yeniden açmaz', () => {
    const tab = store();
    const state = new AnnouncementState(store(), tab);
    state.request(); state.markShown(); state.cancel(); state.request();
    expect(state.canOpen(true)).toBe(false);
    const restored = new AnnouncementState(store(), tab);
    restored.request();
    expect(restored.canOpen(true)).toBe(false);
  });
  it('işaretleyerek kapatma yalnız bu duyuruyu gizler; yeni duyuru açılabilir', () => {
    const device = store();
    const state = new AnnouncementState(device, store());
    state.request(); state.markShown(); state.dismiss(true);
    const same = new AnnouncementState(device, store()); same.request();
    expect(same.canOpen(true)).toBe(false);
    const next = new AnnouncementState(device, store(), 'next-announcement'); next.request();
    expect(next.canOpen(true)).toBe(true);
    expect([...device.values]).toEqual([['defter-duyuru-gizle:' + ANNOUNCEMENT_ID, '1']]);
  });
  it('normal kapatma kalıcı tercih yazmaz; yeni sekmede gösterilebilir', () => {
    const device = store();
    const state = new AnnouncementState(device, store());
    state.request(); state.markShown(); state.dismiss(false);
    expect(device.values.size).toBe(0);
    const next = new AnnouncementState(device, store()); next.request();
    expect(next.canOpen(true)).toBe(true);
  });
  it('çıkış bekleyen gösterimi iptal eder; sonraki girişte yeni istek gerekir', () => {
    const state = new AnnouncementState(store(), store());
    state.request(); state.cancel();
    expect(state.canOpen(true)).toBe(false);
    state.request(); expect(state.canOpen(true)).toBe(true);
  });
  it('engellenmiş depolama gösterimi ve kapatmayı bozmaz; bellekte tekrar engellenir', () => {
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    const state = new AnnouncementState(blocked, blocked);
    state.request(); expect(state.canOpen(true)).toBe(true);
    expect(() => { state.markShown(); state.dismiss(true); }).not.toThrow();
    state.request(); expect(state.canOpen(true)).toBe(false);
  });
  it('gösterimden önce başka sekmede gizlenen duyuru açılmaz', () => {
    const device = store(); const state = new AnnouncementState(device, store()); state.request();
    device.setItem('defter-duyuru-gizle:' + ANNOUNCEMENT_ID, '1');
    expect(state.canOpen(true)).toBe(false);
  });
});
