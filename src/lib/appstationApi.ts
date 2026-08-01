import { describeFetchError } from './errors.js';
import type {
  AppStationPackage,
  AppStationSoftware,
  Environment,
  ProjectType,
  RegistraInitResponse,
} from '../types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Paginated<T> {
  data: T[];
}

export class AppStationClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
  ) {}

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${pathname}`;
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ApiError(`Impossible de contacter AppStation (${url}) : ${describeFetchError(error)}`, 0);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      if (response.status === 401 || response.status === 302 || response.redirected) {
        throw new ApiError(
          'Session AppStation invalide ou compte editeur non valide/actif. Reessayez "aps login".',
          response.status,
        );
      }

      throw new ApiError(`Reponse inattendue d'AppStation (HTTP ${response.status}, non-JSON).`, response.status);
    }

    const body = await response.json();

    if (!response.ok) {
      const message = extractErrorMessage(body) ?? `Erreur AppStation (HTTP ${response.status}).`;
      throw new ApiError(message, response.status);
    }

    return body as T;
  }

  async listSoftwares(): Promise<AppStationSoftware[]> {
    const result = await this.request<Paginated<AppStationSoftware>>('/api/v1/developer/softwares');
    return result.data;
  }

  async createSoftware(input: { name: string; tagline?: string; license_type?: string }): Promise<AppStationSoftware> {
    const result = await this.request<{ data: AppStationSoftware }>('/api/v1/developer/softwares', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return result.data;
  }

  async linkSoftware(
    id: number,
    projectFingerprint: string,
    force: boolean,
  ): Promise<{ data: AppStationSoftware; registra_dev_sync_error: string | null }> {
    return this.request(`/api/v1/developer/softwares/${id}/link`, {
      method: 'POST',
      body: JSON.stringify({ project_fingerprint: projectFingerprint, force }),
    });
  }

  async listPackages(): Promise<AppStationPackage[]> {
    const result = await this.request<Paginated<AppStationPackage>>('/api/v1/developer/packages');
    return result.data;
  }

  async createPackage(input: { software_id: number; name: string }): Promise<AppStationPackage> {
    const result = await this.request<{ data: AppStationPackage }>('/api/v1/developer/packages', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return result.data;
  }

  async linkPackage(
    id: number,
    projectFingerprint: string,
    force: boolean,
  ): Promise<{ data: AppStationPackage; registra_dev_sync_error: string | null }> {
    return this.request(`/api/v1/developer/packages/${id}/link`, {
      method: 'POST',
      body: JSON.stringify({ project_fingerprint: projectFingerprint, force }),
    });
  }

  /**
   * `/api/v1/publisher/...` : metadonnees (nom, tagline, prix, essai...),
   * distinct de `/api/v1/developer/...` utilise par `aps init`/`rotate-key`/
   * `promote`. Meme middleware d'auth (`auth:sanctum` + `publisher`).
   */
  async updateSoftware(id: number, changes: Record<string, unknown>): Promise<AppStationSoftware> {
    const result = await this.request<{ data: AppStationSoftware }>(`/api/v1/publisher/softwares/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    return result.data;
  }

  async updatePackage(id: number, changes: Record<string, unknown>): Promise<AppStationPackage> {
    const result = await this.request<{ data: AppStationPackage }>(`/api/v1/publisher/packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    return result.data;
  }

  async registraInit(input: {
    type: ProjectType;
    id: number;
    environment: Environment;
    project_fingerprint: string;
  }): Promise<RegistraInitResponse> {
    return this.request('/api/v1/developer/registra/init', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;

    if (typeof record.message === 'string') {
      return record.message;
    }

    if (record.errors && typeof record.errors === 'object') {
      const firstKey = Object.keys(record.errors as Record<string, unknown>)[0];
      const firstErrors = (record.errors as Record<string, unknown>)[firstKey ?? ''];
      if (Array.isArray(firstErrors) && typeof firstErrors[0] === 'string') {
        return firstErrors[0];
      }
    }
  }

  return null;
}
