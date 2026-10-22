import { afterEach, describe, expect, it, vi } from 'vitest';
import { kitaplikKur } from './kurulum';
import { installKurulumDene } from './kurulumDene';

vi.mock('./kurulum', () => ({
  driveKurulumApi: {},
  kitaplikKur: vi.fn(async () => ({ kokId: 'test-root', kaynak: 'defterKok', olusturulan: [] })),
  webOrnekKaynak: vi.fn(() => ({})),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('development setup: no URL gate, no automatic operation', () => {
  it.each(['', '?kurulum=0', '?kurulum=1'])('starts only when called (search=%s)', async search => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search });
    installKurulumDene(() => 'dar', () => true);
    expect(kitaplikKur).not.toHaveBeenCalled();
    await window.defterKurulumDene!('test-operation', false);
    expect(kitaplikKur).toHaveBeenCalledExactlyOnceWith({}, expect.objectContaining({
      islemId: 'test-operation', mod: 'dar', kilitAcik: true, ornek: undefined,
    }));
  });

  it('passes the unavailable write context to the operation layer', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '' });
    installKurulumDene(() => 'tam', () => false);
    await window.defterKurulumDene!('test-operation', false);
    const options = vi.mocked(kitaplikKur).mock.calls[0][1];
    expect(options.kilitAcik).toBe(false);
    expect(options.yazabilir()).toBe(false);
  });
});
