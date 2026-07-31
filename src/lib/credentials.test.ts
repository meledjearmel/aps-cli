import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// os.homedir() est une fonction native dependant de l'OS reel, pas de
// process.platform : la mocker directement est le seul moyen fiable de
// tester la branche POSIX sur une machine Windows (et vice-versa), sans
// jamais toucher au vrai dossier utilisateur pendant les tests.
vi.spyOn(os, 'homedir');

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(path.join(os.tmpdir(), 'aps-credentials-test-'));
  vi.resetModules();
});

afterEach(async () => {
  setPlatform(originalPlatform);
  vi.unstubAllEnvs();
  vi.mocked(os.homedir).mockReset();
  await rm(tempHome, { recursive: true, force: true });
});

describe('credentials storage (Windows: %APPDATA%\\app-station\\credentials.json)', () => {
  it('returns null when no credentials file exists yet', async () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', tempHome);
    const { readCredentials } = await import('./credentials.js');

    expect(await readCredentials()).toBeNull();
  });

  it('round-trips written credentials and stores them under %APPDATA%/app-station', async () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', tempHome);
    const { readCredentials, writeCredentials } = await import('./credentials.js');

    const credentials = { appstation: { baseUrl: 'https://appstation.test', accessToken: 'tok-abc' } };
    await writeCredentials(credentials);

    expect(await readCredentials()).toEqual(credentials);

    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(tempHome, 'app-station', 'credentials.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(credentials);
  });

  it('clearCredentials removes the file so a later read returns null', async () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', tempHome);
    const { clearCredentials, readCredentials, writeCredentials } = await import('./credentials.js');

    await writeCredentials({ appstation: { baseUrl: 'https://appstation.test', accessToken: 'tok' } });
    await clearCredentials();

    expect(await readCredentials()).toBeNull();
  });

  it('clearCredentials on an already-missing file does not throw', async () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', tempHome);
    const { clearCredentials } = await import('./credentials.js');

    await expect(clearCredentials()).resolves.not.toThrow();
  });
});

describe('credentials storage (POSIX: ~/.config/app-station/credentials.json)', () => {
  // os.homedir() est une API native liee a l'OS reel, pas a process.platform :
  // on la mocke directement plutot que de compter sur $HOME, pour que ce
  // test soit fiable sur Windows comme sur Linux/macOS sans jamais toucher
  // au vrai dossier utilisateur de la machine qui l'execute.
  it('stores credentials under homedir()/.config/app-station', async () => {
    setPlatform('linux');
    vi.mocked(os.homedir).mockReturnValue(tempHome);
    const { readCredentials, writeCredentials } = await import('./credentials.js');

    const credentials = { appstation: { baseUrl: 'https://appstation.test', accessToken: 'tok-xyz' } };
    await writeCredentials(credentials);

    expect(await readCredentials()).toEqual(credentials);

    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(tempHome, '.config', 'app-station', 'credentials.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(credentials);
  });

  it('writes the credentials file readable only by the owner', async () => {
    // chmod() est un vrai appel systeme lie a l'OS hote reel (pas a notre
    // process.platform simule) : NTFS n'a pas la meme semantique de bits que
    // POSIX, donc ce test n'a de sens que sur un hote POSIX.
    if (originalPlatform === 'win32') return;

    setPlatform('linux');
    vi.mocked(os.homedir).mockReturnValue(tempHome);
    const { writeCredentials } = await import('./credentials.js');

    await writeCredentials({ appstation: { baseUrl: 'https://appstation.test', accessToken: 'tok' } });

    const { stat } = await import('node:fs/promises');
    const mode = (await stat(path.join(tempHome, '.config', 'app-station', 'credentials.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
