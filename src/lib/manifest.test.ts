import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildManifestPayload, canonicalJson, MANIFEST_SCHEMA, signManifest, verifyManifest } from './manifest.js';
import type { ModuleProjectConfig, SoftwareProjectConfig } from '../types.js';

const softwareConfig: SoftwareProjectConfig = {
  $schema: 'https://appstation.dev/schemas/appstation.conf.v1.json',
  version: 1,
  type: 'software',
  environment: 'development',
  software: { token: 'tok-software', name: 'Mon Logiciel' },
  api: { baseUrl: 'https://registra.test/api' },
  auth: { apiKeySource: 'env', apiKeyEnvVar: 'REGISTRA_DEV_API_KEY' },
  integration: { detectedStack: 'node' },
  appstation: { baseUrl: 'https://appstation.test', softwareId: 1, projectFingerprint: 'f'.repeat(64) },
};

const moduleConfig: ModuleProjectConfig = {
  $schema: 'https://appstation.dev/schemas/appstation.conf.v1.json',
  version: 1,
  type: 'module',
  environment: 'development',
  module: { token: 'tok-module', slug: 'reporting', name: 'Module Reporting' },
  parentSoftware: { token: 'tok-parent', name: 'Mon Logiciel' },
  api: { baseUrl: 'https://registra.test/api' },
  auth: { apiKeySource: 'env', apiKeyEnvVar: 'REGISTRA_DEV_API_KEY' },
  integration: { detectedStack: 'node' },
  appstation: { baseUrl: 'https://appstation.test', packageId: 2, parentSoftwareId: 1, projectFingerprint: 'f'.repeat(64) },
};

const apiKey = 'plain-key-123';
const signingSecret = 'signing-secret-abc';

describe('canonicalJson', () => {
  it('sorts object keys alphabetically, recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('produces the same output regardless of input key order', () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it('strips a top-level "signature" field', () => {
    expect(canonicalJson({ a: 1, signature: 'ignored' })).toBe('{"a":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });
});

describe('buildManifestPayload', () => {
  it('builds a software payload with an apiKeyFingerprint but never the plain key', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);

    expect(payload.schema).toBe(MANIFEST_SCHEMA);
    expect(payload).toMatchObject({
      software: { token: 'tok-software', name: 'Mon Logiciel' },
      registra: { baseUrl: 'https://registra.test/api', environment: 'development' },
      project: { fingerprint: 'f'.repeat(64), stack: 'node' },
    });
    expect(JSON.stringify(payload)).not.toContain(apiKey);
    expect((payload as { registra: { apiKeyFingerprint: string } }).registra.apiKeyFingerprint).toBe(
      createHash('sha256').update(apiKey, 'utf8').digest('hex'),
    );
  });

  it('builds a module payload with module + parentSoftware, no "software" field', () => {
    const payload = buildManifestPayload(moduleConfig, apiKey);

    expect(payload).toMatchObject({
      module: { token: 'tok-module', slug: 'reporting', name: 'Module Reporting' },
      parentSoftware: { token: 'tok-parent', name: 'Mon Logiciel' },
    });
    expect('software' in payload).toBe(false);
  });
});

describe('signManifest / verifyManifest', () => {
  it('produces a signature that verifies successfully with the same secret', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const signed = signManifest(payload, signingSecret);

    const result = verifyManifest(signed, signingSecret);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a manifest signed with a different secret', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const signed = signManifest(payload, signingSecret);

    const result = verifyManifest(signed, 'wrong-secret');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Signature'));
  });

  it('rejects a manifest whose payload was tampered with after signing', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const signed = signManifest(payload, signingSecret);

    const tampered = {
      ...signed,
      payload: { ...signed.payload, project: { ...signed.payload.project, fingerprint: 'a'.repeat(64) } },
    };
    const result = verifyManifest(tampered, signingSecret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Signature'));
  });

  it('rejects an unexpected schema value', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const signed = signManifest(payload, signingSecret);
    const badSchema = { ...signed, payload: { ...signed.payload, schema: 'other.v2' as typeof MANIFEST_SCHEMA } };

    const resigned = signManifest(badSchema.payload, signingSecret);
    const result = verifyManifest(resigned, signingSecret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Schema'));
  });

  it('rejects a manifest older than the configured max age', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const old = { ...payload, generatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() };
    const signed = signManifest(old, signingSecret);

    const result = verifyManifest(signed, signingSecret, { maxAgeDays: 30 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('trop ancien'));
  });

  it('accepts a manifest within a custom max age window', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const recent = { ...payload, generatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() };
    const signed = signManifest(recent, signingSecret);

    const result = verifyManifest(signed, signingSecret, { maxAgeDays: 30 });
    expect(result.valid).toBe(true);
  });

  it('rejects an invalid "generatedAt" value', () => {
    const payload = buildManifestPayload(softwareConfig, apiKey);
    const invalid = { ...payload, generatedAt: 'not-a-date' };
    const signed = signManifest(invalid, signingSecret);

    const result = verifyManifest(signed, signingSecret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('generatedAt'));
  });
});
