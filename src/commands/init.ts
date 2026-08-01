import { ApiError, AppStationClient } from '../lib/appstationApi.js';
import {
  ensureGitignorePatched,
  readProjectConfig,
  resolveApiKeyEnvVar,
  writeLocalProjectConfig,
  writeProjectConfig,
} from '../lib/config.js';
import { computeProjectFingerprint } from '../lib/fingerprint.js';
import { isNonInteractive, promptConfirm, promptInput, promptSelect } from '../lib/prompts.js';
import { resolveSession } from '../lib/session.js';
import { withSpinner } from '../lib/spinner.js';
import { detectProjectName, detectStack } from '../lib/stack.js';
import { assertOneOf, parsePositiveId } from '../lib/validate.js';
import type {
  AppStationPackage,
  AppStationSoftware,
  Environment,
  ModuleProjectConfig,
  ProjectType,
  RegistraInitModuleResponse,
  RegistraInitResponse,
  SoftwareProjectConfig,
} from '../types.js';
import { CliError, ExitCode, heading, info, nextSteps, ok, warn } from '../lib/ui.js';

export interface InitOptions {
  link?: boolean;
  create?: boolean;
  type?: ProjectType;
  env?: Environment;
  softwareId?: string;
  packageId?: string;
  parentSoftwareId?: string;
  name?: string;
  tagline?: string;
  forceLink?: boolean;
  yes?: boolean;
}

function isModuleResponse(response: RegistraInitResponse): response is RegistraInitModuleResponse {
  return 'module' in response;
}

async function resolveMode(options: InitOptions): Promise<'link' | 'create'> {
  if (options.link) return 'link';
  if (options.create) return 'create';

  return promptSelect(
    {
      message: 'Que souhaitez-vous faire ?',
      choices: [
        { name: 'Lier ce projet a un software/module AppStation existant', value: 'link' as const },
        { name: 'Creer un nouveau software/module sur AppStation', value: 'create' as const },
      ],
    },
    '--link ou --create',
  );
}

export async function initCommand(options: InitOptions): Promise<void> {
  assertOneOf(options.type, ['software', 'module'], '--type');
  assertOneOf(options.env, ['development', 'production'], '--env');

  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Vous devez etre connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const existingConfig = await readProjectConfig();

  if (existingConfig !== null && !options.yes) {
    const overwrite = await promptConfirm(
      { message: 'appstation.conf.json existe deja. Ecraser ?', default: false },
      '--yes',
    );

    if (!overwrite) {
      info('Annule. Utilisez "aps init --yes" pour ecraser sans confirmation.');
      return;
    }
  }

  const type: ProjectType = options.type ?? 'software';
  const environment: Environment = options.env ?? 'development';
  const mode = await resolveMode(options);
  const client = new AppStationClient(session.appstation.baseUrl, session.appstation.accessToken);

  const [fingerprint, detectedStack] = await Promise.all([computeProjectFingerprint(), detectStack()]);

  heading(`aps init — ${type} / ${mode} / ${environment}`);

  const { targetId, initResponse } =
    type === 'module'
      ? await initModule(client, mode, options, fingerprint, environment)
      : await initSoftware(client, mode, options, fingerprint, environment);

  const config = isModuleResponse(initResponse)
    ? buildModuleConfig(initResponse, session.appstation.baseUrl, fingerprint, detectedStack, targetId)
    : buildSoftwareConfig(initResponse, session.appstation.baseUrl, fingerprint, detectedStack, targetId);

  await writeProjectConfig(config);
  await writeLocalProjectConfig({
    auth: { apiKey: initResponse.registra.apiKey },
    signingSecret: initResponse.signingSecret,
  });
  const patched = await ensureGitignorePatched();

  ok('appstation.conf.json ecrit.');
  ok('appstation.conf.local.json ecrit (secret, non versionne).');
  if (patched) ok('.gitignore mis a jour.');

  printIntegrationInstructions(environment, initResponse.registra.baseUrl);
}

async function initSoftware(
  client: AppStationClient,
  mode: 'link' | 'create',
  options: InitOptions,
  fingerprint: string,
  environment: Environment,
): Promise<{ targetId: number; initResponse: RegistraInitResponse }> {
  let software: AppStationSoftware;

  if (mode === 'link') {
    if (options.softwareId) {
      software = { id: parsePositiveId(options.softwareId, '--software-id'), name: '', slug: '', status: '' };
    } else {
      const softwares = await withSpinner('Chargement de vos softwares AppStation...', () => client.listSoftwares());

      if (softwares.length === 0) {
        throw new CliError('Aucun software trouve sur votre compte. Utilisez "aps init --create".', ExitCode.Generic);
      }

      const chosenId = await promptSelect(
        {
          message: 'Software AppStation a lier ?',
          choices: softwares.map((s) => ({ name: `${s.name} (${s.status})`, value: s.id })),
        },
        '--software-id <id>',
      );

      software = softwares.find((s) => s.id === chosenId)!;
    }

    software = await linkWithRetry(
      'software',
      (force) => client.linkSoftware(software.id, fingerprint, force),
      options.forceLink ?? false,
    );
  } else {
    const name = options.name ?? (await promptName());
    const tagline = options.tagline;
    software = await withSpinner('Creation du software sur AppStation...', () => client.createSoftware({ name, tagline }));
    software = await linkWithRetry('software', (force) => client.linkSoftware(software.id, fingerprint, force), true);
  }

  const initResponse = await withSpinner('Recuperation de la cle Registra...', () =>
    client.registraInit({ type: 'software', id: software.id, environment, project_fingerprint: fingerprint }),
  );

  return { targetId: software.id, initResponse };
}

async function initModule(
  client: AppStationClient,
  mode: 'link' | 'create',
  options: InitOptions,
  fingerprint: string,
  environment: Environment,
): Promise<{ targetId: number; initResponse: RegistraInitResponse }> {
  let pkg: AppStationPackage;

  if (mode === 'link') {
    if (options.packageId) {
      pkg = { id: parsePositiveId(options.packageId, '--package-id'), name: '', slug: '', status: '' };
    } else {
      const packages = await withSpinner('Chargement de vos modules AppStation...', () => client.listPackages());

      if (packages.length === 0) {
        throw new CliError('Aucun module trouve sur votre compte. Utilisez "aps init --create --type module".', ExitCode.Generic);
      }

      const chosenId = await promptSelect(
        {
          message: 'Module AppStation a lier ?',
          choices: packages.map((p) => ({
            name: `${p.name} (parent: ${p.software?.name ?? '?'}, ${p.status})`,
            value: p.id,
          })),
        },
        '--package-id <id>',
      );

      pkg = packages.find((p) => p.id === chosenId)!;
    }

    pkg = await linkWithRetry('module', (force) => client.linkPackage(pkg.id, fingerprint, force), options.forceLink ?? false);
  } else {
    const parentId = await resolveParentSoftwareId(client, options);
    const name = options.name ?? (await promptName());
    pkg = await withSpinner('Creation du module sur AppStation...', () => client.createPackage({ software_id: parentId, name }));
    pkg = await linkWithRetry('module', (force) => client.linkPackage(pkg.id, fingerprint, force), true);
  }

  const initResponse = await withSpinner('Recuperation de la cle Registra...', () =>
    client.registraInit({ type: 'module', id: pkg.id, environment, project_fingerprint: fingerprint }),
  );

  return { targetId: pkg.id, initResponse };
}

type LinkResult<T> = { data: T; registra_dev_sync_error: string | null };

/**
 * Flow de liaison partage entre software et module : lie, previent d'un
 * conflit de fingerprint (409) et propose de forcer la liaison.
 */
async function linkWithRetry<T>(
  resourceLabel: 'software' | 'module',
  link: (force: boolean) => Promise<LinkResult<T>>,
  force: boolean,
): Promise<T> {
  try {
    const result = await withSpinner(`Liaison du projet au ${resourceLabel} AppStation...`, () => link(force));
    if (result.registra_dev_sync_error) {
      warn(`Sync Registra dev : ${result.registra_dev_sync_error}`);
    }
    return result.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && !force) {
      const retry = await promptConfirm(
        { message: `Ce ${resourceLabel} est deja lie a un autre repo local. Forcer la liaison ?`, default: false },
        '--force-link',
      );

      if (!retry) {
        throw new CliError('Liaison annulee.', ExitCode.Generic);
      }

      const result = await withSpinner('Liaison forcee du projet...', () => link(true));
      return result.data;
    }

    throw error;
  }
}

async function resolveParentSoftwareId(client: AppStationClient, options: InitOptions): Promise<number> {
  if (options.parentSoftwareId) {
    return parsePositiveId(options.parentSoftwareId, '--parent-software-id');
  }

  const softwares = await withSpinner('Chargement de vos softwares AppStation...', () => client.listSoftwares());

  if (softwares.length === 0) {
    throw new CliError(
      'Aucun software parent disponible. Creez d\'abord un software ("aps init --create --type software").',
      ExitCode.Generic,
    );
  }

  return promptSelect(
    {
      message: 'Software parent du module ?',
      choices: softwares.map((s) => ({ name: `${s.name} (${s.status})`, value: s.id })),
    },
    '--parent-software-id <id>',
  );
}

async function promptName(): Promise<string> {
  const detected = await detectProjectName();

  // En mode non-interactif, pas de prompt bloquant : le nom detecte (ou un
  // repli generique) suffit, --name reste le moyen explicite de le fixer.
  if (isNonInteractive()) {
    return detected ?? 'Nouveau projet';
  }

  return promptInput(
    {
      message: 'Nom du software/module',
      default: detected ?? undefined,
      validate: (value) => (value.trim().length > 0 ? true : 'Requis'),
    },
    '--name <name>',
  );
}

function buildSoftwareConfig(
  response: RegistraInitResponse,
  appstationBaseUrl: string,
  fingerprint: string,
  detectedStack: string | null,
  softwareId: number,
): SoftwareProjectConfig {
  if (isModuleResponse(response)) {
    throw new Error('Reponse module inattendue pour un software.');
  }

  return {
    $schema: 'https://appstation.dev/schemas/appstation.conf.v1.json',
    version: 1,
    type: 'software',
    environment: response.registra.environment,
    software: { token: response.software.token, name: response.software.name },
    api: { baseUrl: response.registra.baseUrl },
    auth: { apiKeySource: 'env', apiKeyEnvVar: resolveApiKeyEnvVar(response.registra.environment) },
    integration: { detectedStack },
    appstation: { baseUrl: appstationBaseUrl, softwareId, projectFingerprint: fingerprint },
  };
}

function buildModuleConfig(
  response: RegistraInitModuleResponse,
  appstationBaseUrl: string,
  fingerprint: string,
  detectedStack: string | null,
  packageId: number,
): ModuleProjectConfig {
  return {
    $schema: 'https://appstation.dev/schemas/appstation.conf.v1.json',
    version: 1,
    type: 'module',
    environment: response.registra.environment,
    module: { token: response.module.token, slug: response.module.slug, name: response.module.name },
    parentSoftware: { token: response.parentSoftware.token, name: response.parentSoftware.name },
    api: { baseUrl: response.registra.baseUrl },
    auth: { apiKeySource: 'env', apiKeyEnvVar: resolveApiKeyEnvVar(response.registra.environment) },
    integration: { detectedStack },
    appstation: {
      baseUrl: appstationBaseUrl,
      packageId,
      parentSoftwareId: response.parentSoftware.id,
      projectFingerprint: fingerprint,
    },
  };
}

function printIntegrationInstructions(environment: Environment, registraBaseUrl: string): void {
  const envVar = resolveApiKeyEnvVar(environment);

  nextSteps('Prochaine etape', [
    'aps doctor   — verifier que tout fonctionne',
    '',
    `Variables d'environnement pour votre projet :`,
    `  REGISTRA_BASE_URL=${registraBaseUrl}`,
    `  ${envVar}=<voir appstation.conf.local.json>`,
  ]);
}
