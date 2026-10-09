import { RepositoryError } from '@roomforge/core';
import { describe, expect, it } from 'vitest';
import { toRepositoryError } from './errors';

const dom = (name: string, code?: number) => {
  const error = new DOMException('boom', name);
  return code === undefined ? error : Object.assign(error, { code });
};

describe('toRepositoryError', () => {
  it('leaves a RepositoryError as it is', () => {
    const error = new RepositoryError('NOT_FOUND', 'x');
    expect(toRepositoryError(error, 'operation')).toBe(error);
  });

  it.each([
    ['QuotaExceededError', 'operation'],
    ['QuotaExceededError', 'open'],
  ] as const)('maps %s to QUOTA_EXCEEDED (%s)', (name, phase) => {
    expect(toRepositoryError(dom(name), phase).code).toBe('QUOTA_EXCEEDED');
  });

  it.each([22, 1014])('recognises the legacy quota code %i by its number', (code) => {
    const error = { name: 'SomethingElse', code };
    expect(toRepositoryError(error, 'operation').code).toBe('QUOTA_EXCEEDED');
  });

  it('maps VersionError to VERSION_ERROR', () => {
    expect(toRepositoryError(dom('VersionError'), 'open').code).toBe('VERSION_ERROR');
  });

  it.each(['SecurityError', 'InvalidStateError', 'UnknownError'])(
    'maps %s while opening to UNAVAILABLE',
    (name) => {
      expect(toRepositoryError(dom(name), 'open').code).toBe('UNAVAILABLE');
    },
  );

  it('does not call an operation failure "unavailable"', () => {
    expect(toRepositoryError(dom('InvalidStateError'), 'operation').code).toBe('FAILED');
  });

  it('maps DataCloneError to FAILED with a message about the content', () => {
    const error = toRepositoryError(dom('DataCloneError'), 'operation');
    expect(error.code).toBe('FAILED');
    expect(error.message).toMatch(/cannot be stored/);
  });

  it('keeps the original error as the cause', () => {
    const original = dom('AbortError');
    expect(toRepositoryError(original, 'operation').cause).toBe(original);
  });

  it.each([undefined, null, 'text', 42, {}])('maps a thrown %j to FAILED', (thrown) => {
    expect(toRepositoryError(thrown, 'operation').code).toBe('FAILED');
    expect(toRepositoryError(thrown, 'open').code).toBe('FAILED');
  });
});
