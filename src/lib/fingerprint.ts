import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function gitRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd });
    const url = stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Empreinte stable du repo local. Basee sur l'URL du remote `origin` quand
 * elle existe (stable entre clones/collegues) ; sinon repli sur le chemin
 * absolu (stable uniquement sur cette machine).
 */
export async function computeProjectFingerprint(cwd: string = process.cwd()): Promise<string> {
  const remote = await gitRemoteUrl(cwd);
  const base = remote ?? `local:${path.resolve(cwd)}`;
  return createHash('sha256').update(base).digest('hex');
}
