import { AppStationClient } from '../lib/appstationApi.js';
import { readProjectConfig } from '../lib/config.js';
import { resolveSession } from '../lib/session.js';
import { withSpinner } from '../lib/spinner.js';
import { assertMaxLength, parseIntInRange, parseNonNegativeInt } from '../lib/validate.js';
import { CliError, ExitCode, ok } from '../lib/ui.js';

export interface UpdateOptions {
  name?: string;
  tagline?: string;
  description?: string;
  pricePerDay?: string;
  lifetimePrice?: string;
  trialPeriodDays?: string;
  disableTrial?: boolean;
}

const SOFTWARE_ONLY_FLAGS: Array<[keyof UpdateOptions, string]> = [
  ['tagline', '--tagline'],
  ['pricePerDay', '--price-per-day'],
  ['lifetimePrice', '--lifetime-price'],
  ['trialPeriodDays', '--trial-period-days'],
  ['disableTrial', '--disable-trial'],
];

/**
 * Met a jour les metadonnees (nom, tagline, description, prix, essai) du
 * software/module lie, via l'API `/api/v1/publisher/...` deja exposee par
 * AppStation pour la gestion de fiche (jusque-la accessible uniquement
 * depuis l'UI web). Pas de changement de statut de publication ici — cf.
 * `aps promote` pour la bascule dev -> prod.
 */
export async function updateCommand(options: UpdateOptions): Promise<void> {
  const config = await readProjectConfig();

  if (config === null) {
    throw new CliError('appstation.conf.json introuvable. Executez "aps init".', ExitCode.MissingConfig);
  }

  if (config.type === 'module') {
    const unsupported = SOFTWARE_ONLY_FLAGS.filter(([key]) => options[key] !== undefined);

    if (unsupported.length > 0) {
      throw new CliError(
        `${unsupported.map(([, flag]) => flag).join(', ')} non disponible pour un module (tagline/prix/essai sont des champs software uniquement).`,
        ExitCode.Usage,
      );
    }
  }

  if (options.trialPeriodDays !== undefined && options.disableTrial) {
    throw new CliError('--trial-period-days et --disable-trial sont contradictoires : choisissez-en un seul.', ExitCode.Usage);
  }

  if (options.name !== undefined) assertMaxLength(options.name, 120, '--name');
  if (options.description !== undefined) assertMaxLength(options.description, 10000, '--description');
  if (options.tagline !== undefined) assertMaxLength(options.tagline, 180, '--tagline');

  const changes: Record<string, unknown> = {};

  if (options.name !== undefined) changes.name = options.name;
  if (options.description !== undefined) changes.description = options.description;

  if (config.type !== 'module') {
    if (options.tagline !== undefined) changes.tagline = options.tagline;
    if (options.pricePerDay !== undefined) changes.price_per_day_xof = parseNonNegativeInt(options.pricePerDay, '--price-per-day');
    if (options.lifetimePrice !== undefined) changes.lifetime_price_xof = parseNonNegativeInt(options.lifetimePrice, '--lifetime-price');
    if (options.trialPeriodDays !== undefined) {
      changes.has_trial_mode = true;
      changes.trial_period_days = parseIntInRange(options.trialPeriodDays, 1, 365, '--trial-period-days');
    }
    if (options.disableTrial) changes.has_trial_mode = false;
  }

  if (Object.keys(changes).length === 0) {
    throw new CliError(
      'Aucun champ a mettre a jour. Utilisez --name, --description' +
        (config.type === 'module' ? '' : ', --tagline, --price-per-day, --lifetime-price, --trial-period-days, --disable-trial') +
        '.',
      ExitCode.Usage,
    );
  }

  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Vous devez etre connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const client = new AppStationClient(session.appstation.baseUrl, session.appstation.accessToken);

  const updated = await withSpinner(`Mise a jour du ${config.type} sur AppStation...`, () =>
    config.type === 'module'
      ? client.updatePackage(config.appstation.packageId, changes)
      : client.updateSoftware(config.appstation.softwareId, changes),
  );

  ok(`${config.type === 'module' ? 'Module' : 'Software'} mis a jour : ${updated.name}.`);
}
