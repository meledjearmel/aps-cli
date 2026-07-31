import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProjectName, detectStack } from './stack.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aps-stack-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePackageJson(content: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(content), 'utf8');
}

describe('detectStack', () => {
  it('returns null when no recognizable marker file is present', async () => {
    expect(await detectStack(dir)).toBeNull();
  });

  it('detects electron from package.json dependencies', async () => {
    await writePackageJson({ dependencies: { electron: '^30.0.0' } });
    expect(await detectStack(dir)).toBe('electron');
  });

  it('detects nextjs before falling back to generic react/node', async () => {
    await writePackageJson({ dependencies: { next: '^15.0.0', react: '^19.0.0' } });
    expect(await detectStack(dir)).toBe('nextjs');
  });

  it('detects react when present without next', async () => {
    await writePackageJson({ dependencies: { react: '^19.0.0' } });
    expect(await detectStack(dir)).toBe('react');
  });

  it('detects vue', async () => {
    await writePackageJson({ dependencies: { vue: '^3.0.0' } });
    expect(await detectStack(dir)).toBe('vue');
  });

  it('checks devDependencies as well as dependencies', async () => {
    await writePackageJson({ devDependencies: { electron: '^30.0.0' } });
    expect(await detectStack(dir)).toBe('electron');
  });

  it('falls back to generic node when package.json has no recognized framework', async () => {
    await writePackageJson({ dependencies: { lodash: '^4.0.0' } });
    expect(await detectStack(dir)).toBe('node');
  });

  it('detects php via composer.json when there is no package.json', async () => {
    await writeFile(path.join(dir, 'composer.json'), '{}', 'utf8');
    expect(await detectStack(dir)).toBe('php');
  });

  it('detects flutter via pubspec.yaml', async () => {
    await writeFile(path.join(dir, 'pubspec.yaml'), 'name: my_app\n', 'utf8');
    expect(await detectStack(dir)).toBe('flutter');
  });

  it('detects python via requirements.txt', async () => {
    await writeFile(path.join(dir, 'requirements.txt'), 'requests==2.0\n', 'utf8');
    expect(await detectStack(dir)).toBe('python');
  });

  it('detects rust via Cargo.toml', async () => {
    await writeFile(path.join(dir, 'Cargo.toml'), '[package]\n', 'utf8');
    expect(await detectStack(dir)).toBe('rust');
  });

  it('detects dotnet via Directory.Build.props', async () => {
    await writeFile(path.join(dir, 'Directory.Build.props'), '<Project />', 'utf8');
    expect(await detectStack(dir)).toBe('dotnet');
  });

  it('prefers package.json over other stack markers when both are present', async () => {
    await writePackageJson({ dependencies: { react: '^19.0.0' } });
    await writeFile(path.join(dir, 'composer.json'), '{}', 'utf8');
    expect(await detectStack(dir)).toBe('react');
  });
});

describe('detectProjectName', () => {
  it('reads the name field from package.json when present', async () => {
    await writePackageJson({ name: 'mon-super-projet' });
    expect(await detectProjectName(dir)).toBe('mon-super-projet');
  });

  it('falls back to the directory basename when there is no package.json', async () => {
    expect(await detectProjectName(dir)).toBe(path.basename(dir));
  });

  it('falls back to the directory basename when package.json has no name field', async () => {
    await writePackageJson({ dependencies: {} });
    expect(await detectProjectName(dir)).toBe(path.basename(dir));
  });
});
