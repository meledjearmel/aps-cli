import { describeFetchError } from './errors.js';
import type {
  AppStationPackage,
  AppStationSoftware,
  Environment,
  ProjectType,
  RegistraInitResponse,
  ReleaseResource,
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
  meta?: { current_page: number; last_page: number };
}

/** Garde-fou : evite une boucle infinie si un serveur renvoie des `meta` incoherents. */
const MAX_PAGES = 50;

export class AppStationClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
  ) {}

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${pathname}`;
    // FormData (upload multipart) : ne jamais fixer Content-Type nous-memes,
    // fetch/undici doit generer le boundary lui-meme a partir du corps.
    const isFormData = init.body instanceof FormData;
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

  /**
   * `GET /api/v1/developer/{softwares|packages}` pagine (`paginate(20)`
   * cote AppStation) — sans ceci, un compte editeur avec plus de 20
   * entrees en perdait silencieusement au-dela de la premiere page (le
   * picker `aps init --link` et `aps promote` pouvaient rater un
   * software/module pourtant existant).
   */
  private async fetchAllPages<T>(pathname: string): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const separator = pathname.includes('?') ? '&' : '?';
      const result = await this.request<Paginated<T>>(`${pathname}${separator}page=${page}`);
      items.push(...result.data);

      const currentPage = result.meta?.current_page ?? page;
      const lastPage = result.meta?.last_page ?? currentPage;

      if (currentPage >= lastPage) {
        break;
      }

      page += 1;
    }

    return items;
  }

  async listSoftwares(): Promise<AppStationSoftware[]> {
    return this.fetchAllPages<AppStationSoftware>('/api/v1/developer/softwares');
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
    return this.fetchAllPages<AppStationPackage>('/api/v1/developer/packages');
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

  /**
   * `/api/v1/publisher/{softwares|packages}/{id}/releases` — voir
   * app-station/docs/api-publisher-releases.md. Meme middleware/policy que
   * `updateSoftware`/`updatePackage`.
   */
  async createSoftwareRelease(id: number, form: FormData): Promise<ReleaseResource> {
    const result = await this.request<{ data: ReleaseResource }>(`/api/v1/publisher/softwares/${id}/releases`, {
      method: 'POST',
      body: form,
    });
    return result.data;
  }

  async createPackageRelease(id: number, form: FormData): Promise<ReleaseResource> {
    const result = await this.request<{ data: ReleaseResource }>(`/api/v1/publisher/packages/${id}/releases`, {
      method: 'POST',
      body: form,
    });
    return result.data;
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
