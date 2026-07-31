import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AppStationClient } from './appstationApi.js';

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

function htmlResponse(status: number): Response {
  return new Response('<html>redirected</html>', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppStationClient requests', () => {
  it('sends the Authorization bearer token and JSON headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    const client = new AppStationClient('https://appstation.test', 'my-token');
    await client.listSoftwares();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appstation.test/api/v1/developer/softwares');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer my-token');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('strips a trailing slash from baseUrl before building the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    const client = new AppStationClient('https://appstation.test/', 'token');
    await client.listSoftwares();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://appstation.test/api/v1/developer/softwares');
  });

  it('listSoftwares unwraps the paginated data array', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: 1, name: 'A', slug: 'a', status: 'draft' }] }));

    const client = new AppStationClient('https://appstation.test', 'token');
    const softwares = await client.listSoftwares();

    expect(softwares).toEqual([{ id: 1, name: 'A', slug: 'a', status: 'draft' }]);
  });

  it('createSoftware POSTs the payload and unwraps the resource', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 5, name: 'X', slug: 'x', status: 'draft' } }));

    const client = new AppStationClient('https://appstation.test', 'token');
    const software = await client.createSoftware({ name: 'X', tagline: 'a tagline' });

    expect(software.id).toBe(5);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appstation.test/api/v1/developer/softwares');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'X', tagline: 'a tagline' });
  });

  it('linkSoftware targets the id-specific URL and returns the full envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { id: 3, name: 'X', slug: 'x', status: 'draft' }, registra_dev_sync_error: null }),
    );

    const client = new AppStationClient('https://appstation.test', 'token');
    const result = await client.linkSoftware(3, 'a'.repeat(64), true);

    expect(result.registra_dev_sync_error).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appstation.test/api/v1/developer/softwares/3/link');
    expect(JSON.parse(init.body as string)).toEqual({ project_fingerprint: 'a'.repeat(64), force: true });
  });
});

describe('AppStationClient error handling', () => {
  it('throws ApiError with the server message on a JSON error response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { message: 'Nom requis' }));

    const client = new AppStationClient('https://appstation.test', 'token');
    await expect(client.listSoftwares()).rejects.toMatchObject({ status: 422, message: 'Nom requis' });
  });

  it('extracts the first Laravel validation error when there is no top-level message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { errors: { name: ['Le nom est requis.'] } }));

    const client = new AppStationClient('https://appstation.test', 'token');
    await expect(client.listSoftwares()).rejects.toMatchObject({ status: 422, message: 'Le nom est requis.' });
  });

  it('falls back to a generic message when the error body has no message/errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    const client = new AppStationClient('https://appstation.test', 'token');
    await expect(client.listSoftwares()).rejects.toThrow(/HTTP 500/);
  });

  it('treats a non-JSON 401/redirect response as an auth failure, not a generic HTML error', async () => {
    fetchMock.mockResolvedValue(htmlResponse(401));

    const client = new AppStationClient('https://appstation.test', 'token');
    await expect(client.listSoftwares()).rejects.toThrow(/aps login/);
  });

  it('wraps a network failure in an ApiError with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const client = new AppStationClient('https://appstation.test', 'token');

    try {
      await client.listSoftwares();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
    }
  });
});
