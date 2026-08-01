import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Environment, ProjectConfig } from '../types.js';

export const MANIFEST_SCHEMA = 'appstation.manifest.v1';

interface ManifestPayloadCommon {
  schema: typeof MANIFEST_SCHEMA;
  registra: {
    baseUrl: string;
    environment: Environment;
    apiKeyFingerprint: string;
  };
  project: {
    fingerprint: string;
    stack: string | null;
  };
  generatedAt: string;
}

export interface SoftwareManifestPayload extends ManifestPayloadCommon {
  software: { token: string; name: string };
}

export interface ModuleManifestPayload extends ManifestPayloadCommon {
  module: { token: string; slug: string; name: string };
  parentSoftware: { token: string; name: string };
}

export type ManifestPayload = SoftwareManifestPayload | ModuleManifestPayload;

export interface SignedManifest {
  payload: ManifestPayload;
  signature: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Construit le manifest a partir de la config projet (appstation.conf.json)
 * et de la cle API en clair (jamais incluse elle-meme, seule son empreinte
 * SHA-256 l'est) — voir docs/appstation-cli.md §10.
 */
export function buildManifestPayload(config: ProjectConfig, apiKey: string): ManifestPayload {
  const common: ManifestPayloadCommon = {
    schema: MANIFEST_SCHEMA,
    registra: {
      baseUrl: config.api.baseUrl,
      environment: config.environment,
      apiKeyFingerprint: sha256Hex(apiKey),
    },
    project: {
      fingerprint: config.appstation.projectFingerprint,
      stack: config.integration.detectedStack,
    },
    generatedAt: new Date().toISOString(),
  };

  if (config.type === 'module') {
    return {
      ...common,
      module: { ...config.module },
      parentSoftware: { ...config.parentSoftware },
    };
  }

  return {
    ...common,
    software: { ...config.software },
  };
}

/**
 * Canonicalisation : cles triees alphabetiquement (recursif), sans espaces
 * superflus, `signature` retire si present — voir docs/appstation-cli.md
 * §10.3.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(stripSignature(value)));
}

function stripSignature(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const { signature: _signature, ...rest } = value as Record<string, unknown>;
  return rest;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sortKeysDeep(entryValue)]));
  }

  return value;
}

function computeSignature(payload: ManifestPayload, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(canonicalJson(payload), 'utf8').digest('base64');
}

export function signManifest(payload: ManifestPayload, signingSecret: string): SignedManifest {
  return { payload, signature: computeSignature(payload, signingSecret) };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export interface ManifestVerification {
  valid: boolean;
  errors: string[];
}

const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * Verifie un manifest signe : schema, signature HMAC, fraicheur de
 * `generatedAt` — voir docs/appstation-cli.md §7 (`aps verify`).
 * La coherence de `apiKeyFingerprint` avec le software attendu reste a la
 * charge de l'appelant (comparaison contextuelle, pas structurelle).
 */
export function verifyManifest(
  signed: SignedManifest,
  signingSecret: string,
  options: { maxAgeDays?: number; now?: Date } = {},
): ManifestVerification {
  const errors: string[] = [];
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const now = options.now ?? new Date();

  if (signed.payload.schema !== MANIFEST_SCHEMA) {
    errors.push(`Schema inattendu : "${signed.payload.schema}" (attendu "${MANIFEST_SCHEMA}").`);
  }

  const expectedSignature = computeSignature(signed.payload, signingSecret);
  if (!timingSafeEqualStrings(expectedSignature, signed.signature)) {
    errors.push('Signature HMAC-SHA256 invalide.');
  }

  const generatedAt = new Date(signed.payload.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    errors.push(`"generatedAt" invalide : "${signed.payload.generatedAt}".`);
  } else {
    const ageDays = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      errors.push(`Manifest trop ancien : genere il y a ${Math.floor(ageDays)} jours (max ${maxAgeDays}).`);
    } else if (ageDays < 0) {
      errors.push('"generatedAt" est dans le futur.');
    }
  }

  return { valid: errors.length === 0, errors };
}
