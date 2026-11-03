import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from '@vercel/analytics';
import { analizBaslat } from './analiz';

vi.mock('@vercel/analytics', () => ({ inject: vi.fn() }));

beforeEach(() => {
  vi.mocked(inject).mockReset();
  vi.stubEnv('PROD', true);
  vi.stubGlobal('location', new URL('https://mydefter.app/'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('analytics', () => {
  it('starts only page-view analytics in production', () => {
    analizBaslat();
    expect(inject).toHaveBeenCalledExactlyOnceWith({ mode: 'auto', beforeSend: expect.any(Function) });
  });

  it('removes query and hash before sending without changing the original event', () => {
    analizBaslat();
    const beforeSend = vi.mocked(inject).mock.calls[0][0]!.beforeSend!;
    const event = { type: 'pageview' as const, url: 'https://mydefter.app/reader?email=test%40example.com&file=private.pdf#drive-id' };
    expect(beforeSend(event)).toEqual({ type: 'pageview', url: 'https://mydefter.app/reader' });
    expect(event.url).toContain('?email=');
    expect(beforeSend({ type: 'pageview', url: 'https://mydefter.app/' })).toEqual({ type: 'pageview', url: 'https://mydefter.app/' });
    expect(beforeSend({ type: 'pageview', url: 'invalid' })).toBeNull();
  });

  it('does not inject when opted out for this session', () => {
    vi.stubGlobal('location', new URL('https://mydefter.app/?analiz=0'));
    analizBaslat();
    expect(inject).not.toHaveBeenCalled();
  });

  it.each(['http://localhost:5173/', 'https://defter-preview.vercel.app/', 'https://mydefter.app.example.com/'])('does not inject on %s', url => {
    vi.stubGlobal('location', new URL(url));
    analizBaslat();
    expect(inject).not.toHaveBeenCalled();
  });

  it('does not inject in a development build even on the live hostname', () => {
    vi.stubEnv('PROD', false);
    analizBaslat();
    expect(inject).not.toHaveBeenCalled();
  });

  it('allows the app to continue when inject throws', () => {
    vi.mocked(inject).mockImplementation(() => { throw new Error('blocked'); });
    expect(() => analizBaslat()).not.toThrow();
    expect(inject).toHaveBeenCalledOnce();
  });
});
