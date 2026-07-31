import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credentials } from '../types.js';
import { CliError, ExitCode } from './ui.js';

const readCredentialsMock = vi.fn<() => Promise<Credentials | null>>();

vi.mock('./credentials.js', () => ({
  readCredentials: () => readCredentialsMock(),
}));

beforeEach(() => {
  readCredentialsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSession', () => {
  it('builds a session from APS_TOKEN + APPSTATION_BASE_URL when both are set', async () => {
    vi.stubEnv('APS_TOKEN', 'ci-token');
    vi.stubEnv('APPSTATION_BASE_URL', 'https://appstation.test');

    const { resolveSession } = await import('./session.js');
    const session = await resolveSession();

    expect(session).toEqual({ appstation: { baseUrl: 'https://appstation.test', accessToken: 'ci-token' } });
    expect(readCredentialsMock).not.toHaveBeenCalled();
  });

  it('trims whitespace and strips a trailing slash from APPSTATION_BASE_URL', async () => {
    vi.stubEnv('APS_TOKEN', '  ci-token  ');
    vi.stubEnv('APPSTATION_BASE_URL', '  https://appstation.test/  ');

    const { resolveSession } = await import('./session.js');
    const session = await resolveSession();

    expect(session).toEqual({ appstation: { baseUrl: 'https://appstation.test', accessToken: 'ci-token' } });
  });

  it('throws a Usage CliError when APS_TOKEN is set but APPSTATION_BASE_URL is missing', async () => {
    vi.stubEnv('APS_TOKEN', 'ci-token');
    vi.stubEnv('APPSTATION_BASE_URL', undefined);

    const { resolveSession } = await import('./session.js');

    await expect(resolveSession()).rejects.toMatchObject({ exitCode: ExitCode.Usage });
    expect(readCredentialsMock).not.toHaveBeenCalled();
  });

  it('falls back to local credentials when APS_TOKEN is unset', async () => {
    vi.stubEnv('APS_TOKEN', undefined);
    const stored: Credentials = { appstation: { baseUrl: 'https://appstation.test', accessToken: 'local-token' } };
    readCredentialsMock.mockResolvedValue(stored);

    const { resolveSession } = await import('./session.js');
    const session = await resolveSession();

    expect(session).toEqual(stored);
    expect(readCredentialsMock).toHaveBeenCalledOnce();
  });

  it('falls back to local credentials when APS_TOKEN is only whitespace', async () => {
    vi.stubEnv('APS_TOKEN', '   ');
    readCredentialsMock.mockResolvedValue(null);

    const { resolveSession } = await import('./session.js');

    expect(await resolveSession()).toBeNull();
    expect(readCredentialsMock).toHaveBeenCalledOnce();
  });

  it('returns null when neither APS_TOKEN nor local credentials are available', async () => {
    vi.stubEnv('APS_TOKEN', undefined);
    readCredentialsMock.mockResolvedValue(null);

    const { resolveSession } = await import('./session.js');

    expect(await resolveSession()).toBeNull();
  });
});

// Sanity check that CliError itself carries the exit code we assert on above.
describe('CliError', () => {
  it('exposes the exit code passed to its constructor', () => {
    const error = new CliError('x', ExitCode.Usage);
    expect(error.exitCode).toBe(ExitCode.Usage);
  });
});
