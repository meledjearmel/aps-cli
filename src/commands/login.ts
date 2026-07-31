import { AppStationClient } from '../lib/appstationApi.js';
import { readCredentials, writeCredentials } from '../lib/credentials.js';
import { promptInput, promptPassword } from '../lib/prompts.js';
import { withSpinner } from '../lib/spinner.js';
import { CliError, ExitCode, nextSteps, ok } from '../lib/ui.js';

export interface LoginOptions {
  token?: string;
  baseUrl?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const existing = await readCredentials();

  const baseUrl = (
    options.baseUrl ??
    process.env.APPSTATION_BASE_URL ??
    (await promptInput(
      {
        message: 'URL de base AppStation (ex: https://appstation.example.com)',
        default: existing?.appstation.baseUrl,
        validate: (value) => (value.trim().length > 0 ? true : 'Requis'),
      },
      '--base-url <url> (ou APPSTATION_BASE_URL)',
    ))
  )
    .trim()
    .replace(/\/+$/, '');

  const accessToken = (
    options.token ??
    (await promptPassword(
      {
        message: 'Token CLI (AppStation -> Parametres -> CLI)',
        mask: '*',
        validate: (value) => (value.trim().length > 0 ? true : 'Requis'),
      },
      '--token <token> (ou APS_TOKEN)',
    ))
  ).trim();

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
