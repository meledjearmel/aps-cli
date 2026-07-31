import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeProjectFingerprint } from './fingerprint.js';

const execFileAsync = promisify(execFile);

async function initGitRepo(dir: string, remoteUrl?: string): Promise<void> {
  await execFileAsync('git', ['init', '-q'], { cwd: dir });
  if (remoteUrl) {
    await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: dir });
  }
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aps-fingerprint-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('computeProjectFingerprint', () => {
  it('returns a 64-char hex sha256 digest', async () => {
    const fingerprint = await computeProjectFingerprint(dir);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is derived from the git remote origin URL when present', async () => {
    await initGitRepo(dir, 'https://example.com/team/project.git');

    const fingerprint = await computeProjectFingerprint(dir);
    const expected = createHash('sha256').update('https://example.com/team/project.git').digest('hex');
    expect(fingerprint).toBe(expected);
  });

  it('produces the same fingerprint for the same remote regardless of local path', async () => {
    const dirB = await mkdtemp(path.join(os.tmpdir(), 'aps-fingerprint-test-'));

    try {
      await initGitRepo(dir, 'https://example.com/team/shared.git');
      await initGitRepo(dirB, 'https://example.com/team/shared.git');

      expect(await computeProjectFingerprint(dir)).toBe(await computeProjectFingerprint(dirB));
    } finally {
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('produces different fingerprints for different remotes', async () => {
    const dirB = await mkdtemp(path.join(os.tmpdir(), 'aps-fingerprint-test-'));

    try {
      await initGitRepo(dir, 'https://example.com/team/repo-a.git');
      await initGitRepo(dirB, 'https://example.com/team/repo-b.git');

      expect(await computeProjectFingerprint(dir)).not.toBe(await computeProjectFingerprint(dirB));
    } finally {
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('falls back to the local path when there is no git remote (repo without origin)', async () => {
    await initGitRepo(dir);

    const fingerprint = await computeProjectFingerprint(dir);
    const expected = createHash('sha256').update(`local:${path.resolve(dir)}`).digest('hex');
    expect(fingerprint).toBe(expected);
  });

  it('falls back to the local path when the directory is not a git repo at all', async () => {
    const fingerprint = await computeProjectFingerprint(dir);
    const expected = createHash('sha256').update(`local:${path.resolve(dir)}`).digest('hex');
    expect(fingerprint).toBe(expected);
  });
});
