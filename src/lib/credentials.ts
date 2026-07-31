import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Credentials } from '../types.js';

function credentialsDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'app-station');
  }

  return path.join(os.homedir(), '.config', 'app-station');
}

function credentialsPath(): string {
  return path.join(credentialsDir(), 'credentials.json');
}

export async function readCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(credentialsPath(), 'utf8');
    return JSON.parse(raw) as Credentials;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCredentials(credentials: Credentials): Promise<void> {
  await mkdir(credentialsDir(), { recursive: true });
  const filePath = credentialsPath();
  await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
  // writeFile's `mode` only applies on creation ; forcer 0600 meme si le
  // fichier existait deja avec des permissions plus larges (token en clair).
  await chmod(filePath, 0o600).catch(() => {
    // best-effort : semantique ACL differente sur Windows, pas bloquant.
  });
}

export async function clearCredentials(): Promise<void> {
  await rm(credentialsPath(), { force: true });
}
