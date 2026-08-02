export type ProjectType = 'software' | 'module';
export type Environment = 'development' | 'production';
export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'universal';
export type ReleaseChannel = 'stable' | 'beta' | 'rc' | 'nightly';

export interface Credentials {
  appstation: {
    baseUrl: string;
    accessToken: string;
  };
}

export interface AppStationSoftware {
  id: number;
  name: string;
  slug: string;
  status: string;
  has_modules?: boolean;
}

export interface AppStationPackage {
  id: number;
  name: string;
  slug: string;
  status: string;
  software?: AppStationSoftware;
}

export interface RegistraInitSoftwareResponse {
  software: {
    id: number;
    token: string;
    name: string;
    type: 'software';
  };
  registra: {
    baseUrl: string;
    environment: Environment;
    apiKey: string;
  };
  signingSecret: string;
  projectId: string | null;
}

export interface RegistraInitModuleResponse {
  project: { type: 'module' };
  module: {
    id: number;
    token: string;
    slug: string;
    name: string;
  };
  parentSoftware: {
    id: number;
    token: string;
    name: string;
  };
  registra: {
    baseUrl: string;
    environment: Environment;
    apiKey: string;
  };
  signingSecret: string;
  projectId: string | null;
}

export type RegistraInitResponse = RegistraInitSoftwareResponse | RegistraInitModuleResponse;

interface ProjectConfigCommon {
  $schema: string;
  version: 1;
  environment: Environment;
  api: { baseUrl: string };
  auth: { apiKeySource: 'env'; apiKeyEnvVar: string };
  integration: { detectedStack: string | null };
}

export interface SoftwareProjectConfig extends ProjectConfigCommon {
  type: 'software';
  software: { token: string; name: string };
  appstation: { baseUrl: string; softwareId: number; projectFingerprint: string };
}

export interface ModuleProjectConfig extends ProjectConfigCommon {
  type: 'module';
  module: { token: string; slug: string; name: string };
  parentSoftware: { token: string; name: string };
  appstation: {
    baseUrl: string;
    packageId: number;
    parentSoftwareId: number;
    projectFingerprint: string;
  };
}

export type ProjectConfig = SoftwareProjectConfig | ModuleProjectConfig;

export interface LocalProjectConfig {
  auth: { apiKey: string };
  signingSecret: string;
}

/**
 * Reponse de `POST /api/v1/publisher/{softwares|packages}/{id}/releases`
 * (voir app-station/docs/api-publisher-releases.md). `signature` peut etre
 * `null` tant qu'aucun signingSecret n'existe encore pour ce software —
 * pas une erreur, un etat transitoire normal en debut de vie.
 */
export interface ReleaseResource {
  id: number;
  version: string;
  platform: Platform | null;
  channel: ReleaseChannel;
  release_notes: string | null;
  checksum: string;
  signature: string | null;
  file_size: number;
  is_yanked: boolean;
  published_at: string | null;
  min_software_version?: string | null;
  max_software_version?: string | null;
}
