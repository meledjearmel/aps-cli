import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readLocalProjectConfig, readProjectConfig, resolveSigningSecret } from '../lib/config.js';
import { buildManifestPayload, signManifest } from '../lib/manifest.js';
import { CliError, ExitCode, nextSteps, ok } from '../lib/ui.js';

export interface SignOptions {
  output?: string;
}

const DEFAULT_OUTPUT = 'appstation.manifest.signed.json';

export async function signCommand(options: SignOptions): Promise<void> {
  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  const local = await readLocalProjectConfig();

  if (local === null) {
    throw new CliError('appstation.conf.local.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  const signingSecret = await resolveSigningSecret(process.cwd(), local);
  const payload = buildManifestPayload(config, local.auth.apiKey);
  const signed = signManifest(payload, signingSecret);

  const outputPath = options.output ?? DEFAULT_OUTPUT;
  await writeFile(path.resolve(outputPath), `${JSON.stringify(signed, null, 2)}\n`, 'utf8');

  ok(`Manifest signe ecrit : ${outputPath}`);
  nextSteps('Prochaine etape', [
    'Soumettez ce fichier a AppStation (dashboard editeur ou review).',
    `Verifiable localement avec "aps verify ${outputPath}".`,
  ]);
}
