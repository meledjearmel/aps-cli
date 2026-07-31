import { readLocalProjectConfig, readProjectConfig, resolveApiKeyEnvVar } from '../lib/config.js';
import { withSpinner } from '../lib/spinner.js';
import type { Environment } from '../types.js';
import { assertOneOf } from '../lib/validate.js';
import { CliError, ExitCode, fail, nextSteps, ok, warn } from '../lib/ui.js';

export interface DoctorOptions {
  env?: Environment;
}

interface KeyResolution {
  apiKey: string;
  source: 'env' | 'local';
}

async function resolveApiKey(environment: Environment): Promise<KeyResolution> {
  const envVar = resolveApiKeyEnvVar(environment);
  const fromEnv = process.env[envVar];

  if (fromEnv && fromEnv.trim().length > 0) {
    return { apiKey: fromEnv, source: 'env' };
  }

  const local = await readLocalProjectConfig();

  if (local?.auth.apiKey) {
    return { apiKey: local.auth.apiKey, source: 'local' };
  }

  throw new CliError(
    `Cle API introuvable (ni variable d'environnement ${envVar}, ni appstation.conf.local.json). Executez "aps init".`,
    ExitCode.MissingConfig,
  );
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  assertOneOf(options.env, ['development', 'production'], '--env');

  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  ok('appstation.conf.json valide (schema v1).');

  const environment = options.env ?? config.environment;

  if (options.env && options.env !== config.environment) {
    warn(`Config locale liee a l'environnement "${config.environment}", diagnostic force sur "${options.env}".`);
  }

  const { apiKey, source } = await resolveApiKey(environment);
  ok(`Cle API resolue (source: ${source === 'env' ? resolveApiKeyEnvVar(environment) : 'appstation.conf.local.json'}).`);

  // config.api.baseUrl inclut deja le prefixe /api (voir
  // app-station/config/marketplace.php: "base_url — URL racine incluant le
  // prefixe /api de l'app Registra"). Ne pas re-ajouter /api ici.
  const baseUrl = config.api.baseUrl.replace(/\/+$/, '');
  const headers = {
    'X-Software-Api-Key': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let meResponse: Response;

  try {
    meResponse = await withSpinner('Registra GET /software/me...', () => fetch(`${baseUrl}/software/me`, { headers }));
  } catch (error) {
    throw new CliError(`Impossible de contacter Registra (${baseUrl}) : ${(error as Error).message}`, ExitCode.Network);
  }

  if (meResponse.status === 401 || meResponse.status === 403) {
    fail('Registra GET /software/me -> cle API refusee.');
    throw new CliError('Cle API invalide pour cet environnement. Verifiez "aps init" / "aps rotate-key".', ExitCode.Generic);
  }

  if (!meResponse.ok) {
    throw new CliError(`Registra GET /software/me -> HTTP ${meResponse.status}.`, ExitCode.Generic);
  }

  const me = (await meResponse.json()) as { data?: { name?: string }; name?: string };
  const name = me.data?.name ?? me.name;
  ok(`Registra GET /software/me -> ${name ?? 'OK'} (${environment}).`);

  let verifyResponse: Response;

  try {
    verifyResponse = await withSpinner('Registra POST /licences/verify (probe)...', () =>
      fetch(`${baseUrl}/licences/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ licence_key: 'APS-DOCTOR-PROBE-0000' }),
      }),
    );
  } catch (error) {
    throw new CliError(`Impossible de contacter Registra (${baseUrl}) : ${(error as Error).message}`, ExitCode.Network);
  }

  if (verifyResponse.status === 404) {
    ok('Probe verify -> 404 (cle API acceptee).');
  } else if (verifyResponse.status === 401) {
    fail('Probe verify -> 401 (cle API refusee).');
    throw new CliError('Cle API invalide.', ExitCode.Generic);
  } else {
    warn(`Probe verify -> HTTP ${verifyResponse.status} (inattendu, mais la cle a probablement ete acceptee).`);
  }

  ok(`Environnement coherent : ${environment}.`);
  nextSteps('Pret', ['Integrez l\'API licences Registra dans votre projet avec cette cle.']);
}
