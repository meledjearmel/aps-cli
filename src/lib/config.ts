import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LocalProjectConfig, ProjectConfig } from '../types.js';

const CONFIG_FILE = 'appstation.conf.json';
const LOCAL_CONFIG_FILE = 'appstation.conf.local.json';

export function configPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILE);
}

export function localConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, LOCAL_CONFIG_FILE);
}

export async function readProjectConfig(cwd: string = process.cwd()): Promise<ProjectConfig | null> {
  try {
    const raw = await readFile(configPath(cwd), 'utf8');
    return JSON.parse(raw) as ProjectConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function readLocalProjectConfig(cwd: string = process.cwd()): Promise<LocalProjectConfig | null> {
  try {
    const raw = await readFile(localConfigPath(cwd), 'utf8');
    return JSON.parse(raw) as LocalProjectConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeProjectConfig(config: ProjectConfig, cwd: string = process.cwd()): Promise<void> {
  await writeFile(configPath(cwd), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function writeLocalProjectConfig(
  local: LocalProjectConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = localConfigPath(cwd);
  await writeFile(filePath, `${JSON.stringify(local, null, 2)}\n`, 'utf8');
  // writeFile's `mode` only applies on creation ; forcer 0600 meme si le
  // fichier existait deja avec des permissions plus larges (secret sensible).
  await chmod(filePath, 0o600).catch(() => {
    // best-effort : semantique ACL differente sur Windows, pas bloquant.
  });
}

const GITIGNORE_HEADER = '# App Station / Registra (genere par aps init)';
const GITIGNORE_PATTERNS = ['appstation.conf.local.json', '.env.registra', 'appstation.manifest.signed.json'];

export async function ensureGitignorePatched(cwd: string = process.cwd()): Promise<boolean> {
  const gitignorePath = path.join(cwd, '.gitignore');
  let current = '';

  try {
    current = await readFile(gitignorePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const existingLines = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = GITIGNORE_PATTERNS.filter((pattern) => !existingLines.has(pattern));

  if (missing.length === 0) {
    return false;
  }

  const separator = current.length > 0 && !current.endsWith('\n') ? '\n\n' : current.length > 0 ? '\n' : '';
  const block = [GITIGNORE_HEADER, ...missing].join('\n');
  await writeFile(gitignorePath, `${current}${separator}${block}\n`, 'utf8');
  return true;
}

export function resolveApiKeyEnvVar(environment: 'development' | 'production'): string {
  return environment === 'development' ? 'REGISTRA_DEV_API_KEY' : 'REGISTRA_API_KEY';
}
