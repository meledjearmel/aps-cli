import { AppStationClient } from '../lib/appstationApi.js';
import { readProjectConfig, writeLocalProjectConfig, writeProjectConfig } from '../lib/config.js';
import { promptConfirm } from '../lib/prompts.js';
import { resolveSession } from '../lib/session.js';
import { withSpinner } from '../lib/spinner.js';
import { CliError, ExitCode, info, nextSteps, ok } from '../lib/ui.js';
import { buildModuleConfig, buildSoftwareConfig, isModuleResponse, linkWithRetry } from './init.js';

export interface PromoteOptions {
  yes?: boolean;
}

/**
 * Bascule appstation.conf.json / appstation.conf.local.json de development
 * vers production, une fois le software/module `published` cote AppStation
 * (approbation admin + sync Registra prod — voir workflow-published.md).
 * Reutilise `registra/init`, comme `aps init --env production` : pas
 * d'endpoint AppStation dedie necessaire.
 */
export async function promoteCommand(options: PromoteOptions): Promise<void> {
  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  if (config.environment === 'production') {
    throw new CliError('Ce projet est deja configure en production. Utilisez "aps rotate-key" pour rafraichir la cle.', ExitCode.Generic);
  }

  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Vous devez etre connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const client = new AppStationClient(session.appstation.baseUrl, session.appstation.accessToken);
  const fingerprint = config.appstation.projectFingerprint;

  const id = config.type === 'module' ? config.appstation.packageId : config.appstation.softwareId;

  const status = await withSpinner(`Verification du statut du ${config.type} AppStation...`, async () => {
    if (config.type === 'module') {
      const packages = await client.listPackages();
      return packages.find((pkg) => pkg.id === id)?.status ?? null;
    }

    const softwares = await client.listSoftwares();
    return softwares.find((software) => software.id === id)?.status ?? null;
  });

  if (status === null) {
    throw new CliError(`${config.type === 'module' ? 'Module' : 'Software'} introuvable sur votre compte AppStation.`, ExitCode.Generic);
  }

  if (status !== 'published') {
    throw new CliError(
      `Ce ${config.type} n'est pas encore publie sur AppStation (statut actuel : "${status}"). ` +
        'La production necessite une approbation admin prealable.',
      ExitCode.Generic,
    );
  }

  if (!options.yes) {
    const proceed = await promptConfirm(
      {
        message: 'Basculer la configuration locale vers production ? Ecrase appstation.conf.json et appstation.conf.local.json.',
        default: false,
      },
      '--yes',
    );

    if (!proceed) {
      info('Annule.');
      return;
    }
  }

  if (config.type === 'module') {
    await linkWithRetry('module', (force) => client.linkPackage(id, fingerprint, force), false);
  } else {
    await linkWithRetry('software', (force) => client.linkSoftware(id, fingerprint, force), false);
  }

  const initResponse = await withSpinner('Recuperation de la cle Registra production...', () =>
    client.registraInit({ type: config.type, id, environment: 'production', project_fingerprint: fingerprint }),
  );

  const newConfig = isModuleResponse(initResponse)
    ? buildModuleConfig(initResponse, session.appstation.baseUrl, fingerprint, config.integration.detectedStack, id)
    : buildSoftwareConfig(initResponse, session.appstation.baseUrl, fingerprint, config.integration.detectedStack, id);

  await writeProjectConfig(newConfig);
  await writeLocalProjectConfig({
    auth: { apiKey: initResponse.registra.apiKey },
    signingSecret: initResponse.signingSecret,
  });

  ok('appstation.conf.json et appstation.conf.local.json bascules vers production.');
  nextSteps('Prochaine etape', [
    'aps doctor --env production   — verifier que la nouvelle cle fonctionne.',
    'En CI/CD : remplacez REGISTRA_DEV_API_KEY par REGISTRA_API_KEY.',
  ]);
}
