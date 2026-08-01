import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureGitignorePatched,
  readLocalProjectConfig,
  readProjectConfig,
  resolveApiKeyEnvVar,
  writeLocalProjectConfig,
  writeProjectConfig,
} from './config.js';
import type { LocalProjectConfig, SoftwareProjectConfig } from '../types.js';

const sampleConfig: SoftwareProjectConfig = {
  $schema: 'https://appstation.dev/schemas/appstation.conf.v1.json',
  version: 1,
  type: 'software',
  environment: 'development',
  software: { token: 'tok', name: 'Mon Logiciel' },
  api: { baseUrl: 'https://registra.test/api' },
  auth: { apiKeySource: 'env', apiKeyEnvVar: 'REGISTRA_DEV_API_KEY' },
  integration: { detectedStack: 'node' },
  appstation: { baseUrl: 'https://appstation.test', softwareId: 1, projectFingerprint: 'a'.repeat(64) },
};

const sampleLocalConfig: LocalProjectConfig = {
  auth: { apiKey: 'plain-key-123' },
  signingSecret: 'signing-secret-abc',
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aps-config-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('project config read/write', () => {
  it('returns null when appstation.conf.json does not exist', async () => {
    expect(await readProjectConfig(dir)).toBeNull();
  });

  it('round-trips a written config', async () => {
    await writeProjectConfig(sampleConfig, dir);
    const read = await readProjectConfig(dir);
    expect(read).toEqual(sampleConfig);
  });

  it('writes appstation.conf.json as pretty-printed JSON at the expected path', async () => {
    await writeProjectConfig(sampleConfig, dir);
    const raw = await readFile(path.join(dir, 'appstation.conf.json'), 'utf8');
    expect(raw).toContain('\n');
    expect(JSON.parse(raw)).toEqual(sampleConfig);
  });
});

describe('local project config read/write', () => {
  it('returns null when appstation.conf.local.json does not exist', async () => {
    expect(await readLocalProjectConfig(dir)).toBeNull();
  });

  it('round-trips a written local config', async () => {
    await writeLocalProjectConfig(sampleLocalConfig, dir);
    expect(await readLocalProjectConfig(dir)).toEqual(sampleLocalConfig);
  });

  it('writes appstation.conf.local.json readable only by the owner (POSIX)', async () => {
    if (process.platform === 'win32') return;

    await writeLocalProjectConfig(sampleLocalConfig, dir);
    const { stat } = await import('node:fs/promises');
    const mode = (await stat(path.join(dir, 'appstation.conf.local.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('re-tightens permissions to 0600 when overwriting an existing looser file (POSIX)', async () => {
    if (process.platform === 'win32') return;

    const filePath = path.join(dir, 'appstation.conf.local.json');
    await writeFile(filePath, '{}', { mode: 0o644 });

    await writeLocalProjectConfig(sampleLocalConfig, dir);

    const { stat } = await import('node:fs/promises');
    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('ensureGitignorePatched', () => {
  it('creates .gitignore with all three patterns when none exists', async () => {
    const patched = await ensureGitignorePatched(dir);
    expect(patched).toBe(true);

    const content = await readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(content).toContain('appstation.conf.local.json');
    expect(content).toContain('.env.registra');
    expect(content).toContain('appstation.manifest.signed.json');
  });

  it('is a no-op when all patterns are already present', async () => {
    await writeFile(
      path.join(dir, '.gitignore'),
      'node_modules/\nappstation.conf.local.json\n.env.registra\nappstation.manifest.signed.json\n',
      'utf8',
    );

    const patched = await ensureGitignorePatched(dir);
    expect(patched).toBe(false);
  });

  it('adds only the missing patterns, without duplicating existing ones', async () => {
    await writeFile(path.join(dir, '.gitignore'), 'node_modules/\nappstation.conf.local.json\n', 'utf8');

    const patched = await ensureGitignorePatched(dir);
    expect(patched).toBe(true);

    const content = await readFile(path.join(dir, '.gitignore'), 'utf8');
    const occurrences = content.split('appstation.conf.local.json').length - 1;
    expect(occurrences).toBe(1);
    expect(content).toContain('.env.registra');
    expect(content).toContain('appstation.manifest.signed.json');
  });
});

describe('resolveApiKeyEnvVar', () => {
  it('maps development to REGISTRA_DEV_API_KEY', () => {
    expect(resolveApiKeyEnvVar('development')).toBe('REGISTRA_DEV_API_KEY');
  });

  it('maps production to REGISTRA_API_KEY', () => {
    expect(resolveApiKeyEnvVar('production')).toBe('REGISTRA_API_KEY');
  });
});
