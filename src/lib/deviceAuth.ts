import { CliError, ExitCode } from './ui.js';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface PollResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  token?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function requestDeviceCode(baseUrl: string): Promise<DeviceCodeResponse> {
  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/developer/cli/device-code`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new CliError(`Impossible de contacter AppStation (${baseUrl}) : ${(error as Error).message}`, ExitCode.Network);
  }

  if (!response.ok) {
    throw new CliError(`Impossible de demarrer la connexion navigateur (HTTP ${response.status}).`, ExitCode.Network);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

async function pollOnce(baseUrl: string, deviceCode: string): Promise<PollResponse> {
  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/developer/cli/device-token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    });
  } catch (error) {
    throw new CliError(`Impossible de contacter AppStation (${baseUrl}) : ${(error as Error).message}`, ExitCode.Network);
  }

  if (!response.ok) {
    throw new CliError(`Erreur lors de la verification de la connexion (HTTP ${response.status}).`, ExitCode.Network);
  }

  return response.json() as Promise<PollResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll /developer/cli/device-token jusqu'a approbation, refus ou expiration.
 * Reproduit le device-code flow de GitHub CLI / Docker login.
 */
export async function pollUntilResolved(
  baseUrl: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<string> {
  const deadline = Date.now() + expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    let result: PollResponse;

    try {
      result = await pollOnce(baseUrl, deviceCode);
    } catch {
      // Erreur reseau/HTTP transitoire (ex: coupure Wi-Fi pendant l'attente) :
      // le device_code reste valide jusqu'a expiresInSeconds, on retente au
      // prochain intervalle plutot que d'annuler toute la connexion.
      await sleep(intervalSeconds * 1000);
      continue;
    }

    if (result.status === 'approved' && result.token) {
      return result.token;
    }

    if (result.status === 'denied') {
      throw new CliError('Connexion refusee dans le navigateur.', ExitCode.Unauthenticated);
    }

    if (result.status === 'expired') {
      throw new CliError('Code expire. Relancez "aps login".', ExitCode.Unauthenticated);
    }

    await sleep(intervalSeconds * 1000);
  }

  throw new CliError('Delai de connexion depasse. Relancez "aps login".', ExitCode.Unauthenticated);
}
