import { AppStationClient } from '../lib/appstationApi.js';
import { readProjectConfig, writeLocalProjectConfig } from '../lib/config.js';
import { resolveSession } from '../lib/session.js';
import { withSpinner } from '../lib/spinner.js';
import { assertOneOf } from '../lib/validate.js';
import type { Environment } from '../types.js';
import { CliError, ExitCode, nextSteps, ok } from '../lib/ui.js';
import { linkWithRetry } from './init.js';

export interface RotateKeyOptions {
  env?: Environment;
}

/**
 * Rafraichit la cle Registra locale apres une rotation faite cote Registra
 * (admin uniquement a ce jour — voir docs/appstation-software-api-key.md
 * §16 : AppStation ne pilote pas encore la rotation elle-meme). Ne
 * declenche donc pas de rotation, se contente de re-recuperer la cle et le
 * signingSecret courants via `registra/init`.
 */
export async function rotateKeyCommand(options: RotateKeyOptions): Promise<void> {
  assertOneOf(options.env, ['development', 'production'], '--env');

  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  if (options.env && options.env !== config.environment) {
    throw new CliError(
      `--env ${options.env} ne correspond pas a l'environnement de ce projet (${config.environment}). ` +
        'Utilisez "aps init --env <env>" pour changer d\'environnement.',
      ExitCode.Usage,
    );
  }

  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Vous devez etre connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const client = new AppStationClient(session.appstation.baseUrl, session.appstation.accessToken);
  const fingerprint = config.appstation.projectFingerprint;

  let id: number;

  if (config.type === 'module') {
    id = config.appstation.packageId;
    await linkWithRetry('module', (force) => client.linkPackage(id, fingerprint, force), false);
  } else {
    id = config.appstation.softwareId;
    await linkWithRetry('software', (force) => client.linkSoftware(id, fingerprint, force), false);
  }

  const initResponse = await withSpinner('Recuperation de la cle Registra courante...', () =>
    client.registraInit({ type: config.type, id, environment: config.environment, project_fingerprint: fingerprint }),
  );

  await writeLocalProjectConfig({
    auth: { apiKey: initResponse.registra.apiKey },
    signingSecret: initResponse.signingSecret,
  });

  ok('appstation.conf.local.json mis a jour avec la cle Registra courante.');
  nextSteps('Prochaine etape', ['aps doctor   — verifier que la nouvelle cle fonctionne.']);
}
