import { CliError, ExitCode } from './ui.js';

export function parsePositiveId(value: string, flagName: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new CliError(`${flagName} invalide : "${value}" (attendu un identifiant numerique positif).`, ExitCode.Usage);
  }

  return id;
}

/**
 * Aligne la CLI sur les limites du formulaire App Station
 * (`Livewire\Publisher\Softwares\Show::saveDetails` /
 * `Livewire\Publisher\Packages\Show::saveDetails`) — l'API
 * `/api/v1/publisher/...` que `aps update` consomme est plus permissive que
 * l'UI sur ces champs (pas de `max` cote serveur pour certains), donc la
 * CLI l'applique elle-meme pour ne jamais produire un etat que l'UI
 * officielle n'aurait pas autorise.
 */
export function assertMaxLength(value: string, max: number, flagName: string): void {
  if (value.length > max) {
    throw new CliError(`${flagName} trop long : ${value.length} caracteres (max ${max}).`, ExitCode.Usage);
  }
}

export function parseNonNegativeInt(value: string, flagName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(`${flagName} invalide : "${value}" (attendu un entier positif ou nul).`, ExitCode.Usage);
  }

  return parsed;
}

/** Alignee sur `trial_period_days` cote App Station UI : `min:1`, `max:365`. */
export function parseIntInRange(value: string, min: number, max: number, flagName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CliError(`${flagName} invalide : "${value}" (attendu un entier entre ${min} et ${max}).`, ExitCode.Usage);
  }

  return parsed;
}

export function assertOneOf<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  flagName: string,
): void {
  if (value !== undefined && !allowed.includes(value)) {
    throw new CliError(`${flagName} invalide : "${value}" (attendu : ${allowed.join(' ou ')}).`, ExitCode.Usage);
  }
}
