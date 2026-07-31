import { describe, expect, it } from 'vitest';
import { describeFetchError } from './errors.js';

describe('describeFetchError', () => {
  it('appends the cause message when the error has an Error cause', () => {
    const cause = new Error('unable to verify the first certificate');
    const error = new Error('fetch failed', { cause });

    expect(describeFetchError(error)).toBe('fetch failed — unable to verify the first certificate');
  });

  it('returns just the message when there is no cause', () => {
    const error = new Error('ENOTFOUND appstation.test');
    expect(describeFetchError(error)).toBe('ENOTFOUND appstation.test');
  });

  it('ignores a non-Error cause and returns just the message', () => {
    const error = new Error('fetch failed', { cause: 'not an error object' });
    expect(describeFetchError(error)).toBe('fetch failed');
  });

  it('stringifies a non-Error thrown value', () => {
    expect(describeFetchError('boom')).toBe('boom');
  });
});
