import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveFetch } from './drive';
import { SaltOkunurIhlal, saltOkunurFetch } from './saltOkunur';

vi.mock('./drive', async importOriginal => ({
  ...await importOriginal<typeof import('./drive')>(),
  driveFetch: vi.fn()
}));

const fetchMock = vi.mocked(driveFetch);

describe('saltOkunurFetch', () => {
  beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue(new Response('{}')); });

  it('GET goes through, always with method GET', async () => {
    await saltOkunurFetch('files?q=x');
    await saltOkunurFetch('files/a?alt=media', { method: 'get' });
    expect(fetchMock.mock.calls.map(c => [c[0], c[1]?.method])).toEqual([['files?q=x', 'GET'], ['files/a?alt=media', 'GET']]);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'patch'])('%s is refused, nothing is sent', async method => {
    await expect(saltOkunurFetch('files/a', { method })).rejects.toBeInstanceOf(SaltOkunurIhlal);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a GET with a body is refused', async () => {
    await expect(saltOkunurFetch('files/a', { body: '{"trashed":true}' })).rejects.toBeInstanceOf(SaltOkunurIhlal);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
