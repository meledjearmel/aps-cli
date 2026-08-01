import { AppStationClient } from '../lib/appstationApi.js';
import { writeCredentials } from '../lib/credentials.js';
import { describeFetchError } from '../lib/errors.js';
import { beginLocalCallbackLogin } from '../lib/localCallback.js';
import { openBrowser } from '../lib/openBrowser.js';
import { isNonInteractive } from '../lib/prompts.js';
import { withSpinner } from '../lib/spinner.js';
import { CliError, ExitCode, heading, info, nextSteps, ok } from '../lib/ui.js';

const PRODUCTION_BASE_URL = 'https://app-station.neocode.ci';
const DEV_BASE_URL = 'https://app-station.test';

export interface LoginOptions {
  token?: string;
  baseUrl?: string;
  dev?: boolean;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const accessToken = options.token !== undefined ? resolveExplicitToken(options.token) : await browserLogin(baseUrl);

  const client = new AppStationClient(baseUrl, accessToken);

  try {
    await withSpinner('Verification du token aupres d\'AppStation...', () => client.listSoftwares());
  } catch (error) {
    throw new CliError(
      `Impossible de valider le token aupres d'AppStation : ${describeFetchError(error)}`,
      ExitCode.Unauthenticated,
    );
  }

  await writeCredentials({ appstation: { baseUrl, accessToken } });
  ok(`Connecte a ${baseUrl}.`);
  nextSteps('Prochaine etape', ['aps init   — lier ou creer un software/module AppStation']);
}

function resolveBaseUrl(options: LoginOptions): string {
  const explicit = options.baseUrl ?? process.env.APPSTATION_BASE_URL;

  if (explicit) {
    return explicit.trim().replace(/\/+$/, '');
  }

  return options.dev ? DEV_BASE_URL : PRODUCTION_BASE_URL;
}

function resolveExplicitToken(token: string): string {
  const trimmed = token.trim();

  if (trimmed.length === 0) {
    throw new CliError('--token fourni mais vide.', ExitCode.Usage);
  }

  return trimmed;
}

/**
 * Connexion navigateur via callback local : la CLI demarre un serveur
 * ephemere sur 127.0.0.1, ouvre le navigateur sur AppStation avec l'URL de ce
 * serveur en parametre, et attend la redirection retour. Plus resistant au
 * phishing qu'un flow "device code" classique — voir
 * app/Support/Cli/CallbackUrlValidator.php cote serveur : le token n'est
 * jamais redirige ailleurs que vers un callback loopback, donc impossible a
 * relayer vers la machine d'un attaquant.
 */
async function browserLogin(baseUrl: string): Promise<string> {
  if (isNonInteractive()) {
    throw new CliError(
      'Connexion navigateur indisponible en mode non-interactif : precisez --token <token> (ou APS_TOKEN).',
      ExitCode.Usage,
    );
  }

  const flow = await withSpinner('Demarrage du serveur local...', () => beginLocalCallbackLogin(baseUrl));

  heading('Connexion navigateur');
  info(`Si le navigateur ne s'ouvre pas automatiquement, ouvrez : ${flow.authorizeUrl}`);

  await openBrowser(flow.authorizeUrl);

  return withSpinner("En attente d'approbation dans le navigateur...", () => flow.waitForToken());
}
