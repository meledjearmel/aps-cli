import { CliError, ExitCode } from './ui.js';

export function parsePositiveId(value: string, flagName: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new CliError(`${flagName} invalide : "${value}" (attendu un identifiant numerique positif).`, ExitCode.Usage);
  }

  return id;
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
