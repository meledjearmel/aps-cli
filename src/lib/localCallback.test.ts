import { describe, expect, it } from 'vitest';
import { CliError, ExitCode } from './ui.js';
import { beginLocalCallbackLogin } from './localCallback.js';

function extractQueryParam(url: string, name: string): string | null {
  return new URL(url).searchParams.get(name);
}

describe('beginLocalCallbackLogin', () => {
  it('starts a local server bound to an ephemeral port and builds the authorize URL', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');

    expect(flow.port).toBeGreaterThan(0);
    expect(flow.authorizeUrl.startsWith('https://appstation.test/developers/cli-auth?callback=')).toBe(true);

    const callback = extractQueryParam(flow.authorizeUrl, 'callback');
    expect(callback).toBe(`http://127.0.0.1:${flow.port}/callback`);

    const state = extractQueryParam(flow.authorizeUrl, 'state');
    expect(state).toMatch(/^[0-9a-f]{48}$/);

    // Cleanup: register the listener first, then trigger it, so the server
    // shuts down instead of leaking into the next test.
    const cleanup = flow.waitForToken();
    await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&token=cleanup`);
    await cleanup;
  });

  it('strips a trailing slash from baseUrl', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test/');
    expect(flow.authorizeUrl.startsWith('https://appstation.test/developers/cli-auth?')).toBe(true);

    const state = extractQueryParam(flow.authorizeUrl, 'state');
    const cleanup = flow.waitForToken();
    await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&token=cleanup`);
    await cleanup;
  });

  it('resolves with the token once the callback is hit with the matching state', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');
    const state = extractQueryParam(flow.authorizeUrl, 'state');

    const resultPromise = flow.waitForToken();
    const response = await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&token=plain-token-abc`);

    expect(response.status).toBe(200);
    expect(await resultPromise).toBe('plain-token-abc');
  });

  it('rejects when the callback carries an error param (user denied)', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');
    const state = extractQueryParam(flow.authorizeUrl, 'state');

    const resultPromise = flow.waitForToken();
    const assertion = expect(resultPromise).rejects.toMatchObject({ exitCode: ExitCode.Unauthenticated });
    await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&error=access_denied`);

    await assertion;
  });

  it('ignores a request with a mismatched state and keeps waiting for the real one', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');
    const state = extractQueryParam(flow.authorizeUrl, 'state');

    const resultPromise = flow.waitForToken();

    const badResponse = await fetch(`http://127.0.0.1:${flow.port}/callback?state=wrong-state&token=stolen`);
    expect(badResponse.status).toBe(400);

    const goodResponse = await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&token=real-token`);
    expect(goodResponse.status).toBe(200);

    await expect(resultPromise).resolves.toBe('real-token');
  });

  it('returns 404 for any path other than /callback and keeps waiting', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');
    const state = extractQueryParam(flow.authorizeUrl, 'state');

    const resultPromise = flow.waitForToken();

    const notFound = await fetch(`http://127.0.0.1:${flow.port}/other-path`);
    expect(notFound.status).toBe(404);

    await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}&token=real-token`);
    await expect(resultPromise).resolves.toBe('real-token');
  });

  it('rejects if the callback is hit without a token and without an error', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test');
    const state = extractQueryParam(flow.authorizeUrl, 'state');

    const resultPromise = flow.waitForToken();
    const assertion = expect(resultPromise).rejects.toBeInstanceOf(CliError);
    await fetch(`http://127.0.0.1:${flow.port}/callback?state=${state}`);

    await assertion;
  });

  it('times out and stops the server if nothing calls back in time', async () => {
    const flow = await beginLocalCallbackLogin('https://appstation.test', 50);

    await expect(flow.waitForToken()).rejects.toMatchObject({ exitCode: ExitCode.Unauthenticated });

    // Le serveur doit etre ferme : une nouvelle requete sur ce port doit echouer.
    await expect(fetch(`http://127.0.0.1:${flow.port}/callback`)).rejects.toThrow();
  });
});
