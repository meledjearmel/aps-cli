import { describe, expect, it } from 'vitest';
import { CliError, ExitCode } from './ui.js';
import { assertOneOf, parsePositiveId } from './validate.js';

describe('parsePositiveId', () => {
  it('parses a valid positive integer string', () => {
    expect(parsePositiveId('42', '--id')).toBe(42);
  });

  it('rejects non-numeric input', () => {
    expect(() => parsePositiveId('abc', '--software-id')).toThrow(CliError);
  });

  it('rejects zero and negative numbers', () => {
    expect(() => parsePositiveId('0', '--id')).toThrow(CliError);
    expect(() => parsePositiveId('-5', '--id')).toThrow(CliError);
  });

  it('rejects non-integer numbers', () => {
    expect(() => parsePositiveId('1.5', '--id')).toThrow(CliError);
  });

  it('throws with Usage exit code and mentions the flag name', () => {
    try {
      parsePositiveId('abc', '--software-id');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(ExitCode.Usage);
      expect((error as CliError).message).toContain('--software-id');
    }
  });
});

describe('assertOneOf', () => {
  it('allows undefined (optional flag not provided)', () => {
    expect(() => assertOneOf(undefined, ['software', 'module'], '--type')).not.toThrow();
  });

  it('allows a value present in the allowed list', () => {
    expect(() => assertOneOf('module', ['software', 'module'], '--type')).not.toThrow();
  });

  it('rejects a value outside the allowed list', () => {
    expect(() => assertOneOf('modul', ['software', 'module'], '--type')).toThrow(CliError);
  });

  it('is case-sensitive', () => {
    expect(() => assertOneOf('Software', ['software', 'module'], '--type')).toThrow(CliError);
  });
});
