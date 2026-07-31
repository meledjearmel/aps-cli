import { AppStationClient } from '../lib/appstationApi.js';
import { readCredentials, writeCredentials } from '../lib/credentials.js';
import { pollUntilResolved, requestDeviceCode } from '../lib/deviceAuth.js';
import { openBrowser } from '../lib/openBrowser.js';
import { isNonInteractive, promptInput } from '../lib/prompts.js';
import { withSpinner } from '../lib/spinner.js';
import { CliError, ExitCode, heading, info, nextSteps, ok } from '../lib/ui.js';

export interface LoginOptions {
  token?: string;
  baseUrl?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const existing = await readCredentials();

  const baseUrl = await resolveBaseUrl(options, existing?.appstation.baseUrl);
  const accessToken = options.token !== undefined ? resolveExplicitToken(options.token) : await browserLogin(baseUrl);

  const client = new AppStationClient(baseUrl, accessToken);

  try {
    await withSpinner('Verification du token aupres d\'AppStation...', () => client.listSoftwares());
  } catch (error) {
    throw new CliError(
      `Impossible de valider le token aupres d'AppStation : ${(error as Error).message}`,
      ExitCode.Unauthenticated,
    );
  }

  await writeCredentials({ appstation: { baseUrl, accessToken } });
  ok(`Connecte a ${baseUrl}.`);
  nextSteps('Prochaine etape', ['aps init   — lier ou creer un software/module AppStation']);
}

async function resolveBaseUrl(options: LoginOptions, existingBaseUrl?: string): Promise<string> {
  if (options.baseUrl) {
    return options.baseUrl.trim().replace(/\/+$/, '');
  }

  if (process.env.APPSTATION_BASE_URL) {
    return process.env.APPSTATION_BASE_URL.trim().replace(/\/+$/, '');
  }

  const value = await promptInput(
    {
      message: 'URL de base AppStation (ex: https://appstation.example.com)',
      default: existingBaseUrl,
      validate: (v) => (v.trim().length > 0 ? true : 'Requis'),
    },
    '--base-url <url> (ou APPSTATION_BASE_URL)',
  );

  return value.trim().replace(/\/+$/, '');
}

function resolveExplicitToken(token: string): string {
  const trimmed = token.trim();

  if (trimmed.length === 0) {
    throw new CliError('--token fourni mais vide.', ExitCode.Usage);
  }

  return trimmed;
}

/**
 * Connexion navigateur (device code) : la CLI recupere un code, ouvre le
 * navigateur sur AppStation, et poll jusqu'a approbation. Equivalent de
 * `gh auth login` / `docker login` avec browser flow.
 */
async function browserLogin(baseUrl: string): Promise<string> {
  if (isNonInteractive()) {
    throw new CliError(
      'Connexion navigateur indisponible en mode non-interactif : precisez --token <token> (ou APS_TOKEN).',
      ExitCode.Usage,
    );
  }

  const device = await withSpinner('Demarrage de la connexion navigateur...', () => requestDeviceCode(baseUrl));

  heading('Connexion navigateur');
  info(`Code : ${device.user_code}`);
  info(`Si le navigateur ne s'ouvre pas automatiquement, ouvrez : ${device.verification_uri_complete}`);

  await openBrowser(device.verification_uri_complete);

  return withSpinner("En attente d'approbation dans le navigateur...", () =>
    pollUntilResolved(baseUrl, device.device_code, device.interval, device.expires_in),
  );
}
