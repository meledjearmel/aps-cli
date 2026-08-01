import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSigningSecret } from '../lib/config.js';
import { verifyManifest, type SignedManifest } from '../lib/manifest.js';
import { CliError, ExitCode, fail, ok } from '../lib/ui.js';

export interface VerifyOptions {
  file: string;
}

function isSignedManifestShape(value: unknown): value is SignedManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { signature?: unknown }).signature === 'string' &&
    typeof (value as { payload?: unknown }).payload === 'object' &&
    (value as { payload?: unknown }).payload !== null
  );
}

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  let raw: string;

  try {
    raw = await readFile(path.resolve(options.file), 'utf8');
  } catch {
    throw new CliError(`Fichier introuvable : ${options.file}`, ExitCode.Usage);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(`JSON invalide : ${options.file}`, ExitCode.Usage);
  }

  if (!isSignedManifestShape(parsed)) {
    throw new CliError(`Structure de manifest invalide (attendu { payload, signature }) : ${options.file}`, ExitCode.Usage);
  }

  const signingSecret = await resolveSigningSecret();
  const result = verifyManifest(parsed, signingSecret);

  if (!result.valid) {
    for (const error of result.errors) {
      fail(error);
    }

    throw new CliError('Manifest invalide.', ExitCode.Generic);
  }

  ok(`Manifest valide : ${options.file}`);
}
