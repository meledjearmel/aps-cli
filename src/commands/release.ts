import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AppStationClient } from '../lib/appstationApi.js';
import { readProjectConfig } from '../lib/config.js';
import { resolveSession } from '../lib/session.js';
import { withSpinner } from '../lib/spinner.js';
import { assertMaxLength, assertOneOf } from '../lib/validate.js';
import type { Platform, ReleaseChannel } from '../types.js';
import { CliError, ExitCode, nextSteps, ok, warn } from '../lib/ui.js';

export interface ReleaseOptions {
  version?: string;
  channel?: ReleaseChannel;
  platform?: Platform;
  notes?: string;
  minSoftwareVersion?: string;
  maxSoftwareVersion?: string;
}

const CHANNELS: ReleaseChannel[] = ['stable', 'beta', 'rc', 'nightly'];
const PLATFORMS: Platform[] = ['windows', 'macos', 'linux', 'android', 'ios', 'universal'];

/**
 * Publie une release (upload de fichier) pour le software/module lie, via
 * `POST /api/v1/publisher/{softwares|packages}/{id}/releases` — voir
 * app-station/docs/api-publisher-releases.md. Meme validation que le
 * formulaire AppStation officiel (ReleaseUploadRules cote serveur).
 */
export async function releaseCommand(file: string, options: ReleaseOptions): Promise<void> {
  assertOneOf(options.channel, CHANNELS, '--channel');
  assertOneOf(options.platform, PLATFORMS, '--platform');

  if (!options.version) {
    throw new CliError('--version est requis.', ExitCode.Usage);
  }

  assertMaxLength(options.version, 20, '--version');
  if (options.notes !== undefined) assertMaxLength(options.notes, 10000, '--notes');

  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  if (config.type !== 'module' && (options.minSoftwareVersion !== undefined || options.maxSoftwareVersion !== undefined)) {
    throw new CliError('--min-software-version/--max-software-version ne sont disponibles que pour un module.', ExitCode.Usage);
  }

  let fileStat;

  try {
    fileStat = await stat(file);
  } catch {
    throw new CliError(`Fichier introuvable : ${file}`, ExitCode.Usage);
  }

  if (!fileStat.isFile()) {
    throw new CliError(`N'est pas un fichier : ${file}`, ExitCode.Usage);
  }

  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Vous devez etre connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const client = new AppStationClient(session.appstation.baseUrl, session.appstation.accessToken);

  const form = new FormData();
  form.append('version', options.version);
  form.append('channel', options.channel ?? 'stable');
  if (options.platform) form.append('platform', options.platform);
  if (options.notes !== undefined) form.append('release_notes', options.notes);
  if (options.minSoftwareVersion !== undefined) form.append('min_software_version', options.minSoftwareVersion);
  if (options.maxSoftwareVersion !== undefined) form.append('max_software_version', options.maxSoftwareVersion);

  const buffer = await readFile(file);
  form.append('release_file', new Blob([buffer]), path.basename(file));

  const release = await withSpinner(`Publication de la release ${options.version}...`, () =>
    config.type === 'module'
      ? client.createPackageRelease(config.appstation.packageId, form)
      : client.createSoftwareRelease(config.appstation.softwareId, form),
  );

  ok(`Release ${release.version}${release.platform ? ` (${release.platform})` : ''} publiee (${release.channel}).`);

  if (release.signature === null) {
    warn('Signature indisponible pour le moment (aucun signingSecret genere pour ce software) — sera calculee retroactivement.');
  }

  nextSteps('Details', [`Checksum  : ${release.checksum}`, `Signature : ${release.signature ?? '(en attente)'}`]);
}
