import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

interface StackProbe {
  file: string;
  stack: string;
}

const PROBES: StackProbe[] = [
  { file: 'pubspec.yaml', stack: 'flutter' },
  { file: 'composer.json', stack: 'php' },
  { file: 'requirements.txt', stack: 'python' },
  { file: 'pyproject.toml', stack: 'python' },
  { file: 'go.mod', stack: 'go' },
  { file: 'Cargo.toml', stack: 'rust' },
];

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

export async function detectStack(cwd: string = process.cwd()): Promise<string | null> {
  const pkg = await readPackageJson(cwd);

  if (pkg !== null) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.electron) return 'electron';
    if (deps.next) return 'nextjs';
    if (deps.react) return 'react';
    if (deps.vue) return 'vue';
    return 'node';
  }

  for (const probe of PROBES) {
    if (await fileExists(path.join(cwd, probe.file))) {
      return probe.stack;
    }
  }

  if (await fileExists(path.join(cwd, 'Directory.Build.props'))) {
    return 'dotnet';
  }

  return null;
}

export async function detectProjectName(cwd: string = process.cwd()): Promise<string | null> {
  const pkg = await readPackageJson(cwd);
  return pkg?.name ?? path.basename(cwd);
}
