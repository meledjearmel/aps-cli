import { readCredentials } from './credentials.js';
import type { Credentials } from '../types.js';
import { CliError, ExitCode } from './ui.js';

/**
 * Resout la session AppStation : priorite a APS_TOKEN (+ APPSTATION_BASE_URL)
 * pour l'usage CI/non-interactif (equivalent d'EXPO_TOKEN chez eas), sinon
 * retombe sur les credentials locaux ecrits par "aps login".
 */
export async function resolveSession(): Promise<Credentials | null> {
  const envToken = process.env.APS_TOKEN;

  if (envToken && envToken.trim().length > 0) {
    const baseUrl = process.env.APPSTATION_BASE_URL;

    if (!baseUrl || baseUrl.trim().length === 0) {
      throw new CliError(
        'APS_TOKEN est defini mais APPSTATION_BASE_URL est manquant.',
        ExitCode.Usage,
      );
    }

    return {
      appstation: {
        baseUrl: baseUrl.trim().replace(/\/+$/, ''),
        accessToken: envToken.trim(),
      },
    };
  }

  return readCredentials();
}
