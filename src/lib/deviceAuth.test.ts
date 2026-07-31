import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError, ExitCode } from './ui.js';
import { pollUntilResolved, requestDeviceCode } from './deviceAuth.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requestDeviceCode', () => {
  it('POSTs to the device-code endpoint and returns the parsed payload', async () => {
    const payload = {
      device_code: 'd'.repeat(40),
      user_code: 'ABCD-1234',
      verification_uri: 'https://appstation.test/developers/cli-auth',
      verification_uri_complete: 'https://appstation.test/developers/cli-auth?code=ABCD-1234',
      expires_in: 600,
      interval: 5,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, payload));

    const result = await requestDeviceCode('https://appstation.test');

    expect(result).toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appstation.test/api/v1/developer/cli/device-code');
    expect(init.method).toBe('POST');
  });

  it('throws a Network CliError on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    await expect(requestDeviceCode('https://appstation.test')).rejects.toMatchObject({
      exitCode: ExitCode.Network,
    });
  });

  it('throws a Network CliError when fetch itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(requestDeviceCode('https://appstation.test')).rejects.toBeInstanceOf(CliError);
  });
});

describe('pollUntilResolved', () => {
  it('resolves with the token as soon as the first poll reports approved', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'approved', token: 'plain-token-123' }));

    const token = await pollUntilResolved('https://appstation.test', 'device-code', 5, 600);

    expect(token).toBe('plain-token-123');
  });

  it('throws when the code was denied', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'denied' }));

    await expect(pollUntilResolved('https://appstation.test', 'device-code', 5, 600)).rejects.toMatchObject({
      exitCode: ExitCode.Unauthenticated,
    });
  });

  it('throws when the code has expired', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'expired' }));

    await expect(pollUntilResolved('https://appstation.test', 'device-code', 5, 600)).rejects.toThrow(/expire/);
  });

  it('keeps polling while pending and resolves once approved', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'approved', token: 'tok-after-retries' }));

    const promise = pollUntilResolved('https://appstation.test', 'device-code', 1, 60);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe('tok-after-retries');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('tolerates a transient network error mid-poll instead of aborting the login', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: 'pending' }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'approved', token: 'tok-after-network-blip' }));

    const promise = pollUntilResolved('https://appstation.test', 'device-code', 1, 60);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe('tok-after-network-blip');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after expiresInSeconds and reports a timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'pending' }));

    const promise = pollUntilResolved('https://appstation.test', 'device-code', 1, 2);
    const assertion = expect(promise).rejects.toThrow(/passe/);

    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
  });
});
