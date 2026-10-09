import { describe, expect, it } from 'vitest';
import { LIMITS } from '../domain';
import {
  copyProjectName,
  normalizeProjectName,
  RepositoryError,
  uniqueProjectName,
} from './project-repository';

describe('copyProjectName', () => {
  it('appends the suffix', () => {
    expect(copyProjectName('Office')).toBe('Office (copy)');
  });

  it('cuts a long name so that the copy still fits the limit', () => {
    const copy = copyProjectName('a'.repeat(LIMITS.maxNameLength));
    expect(copy).toHaveLength(LIMITS.maxNameLength);
    expect(copy.endsWith(' (copy)')).toBe(true);
    expect(normalizeProjectName(copy)).toBe(copy);
  });

  it('does not leave a space before the suffix when the cut falls on one', () => {
    const name = `${'a'.repeat(72)} bbbbbbb`;
    expect(copyProjectName(name)).toBe(`${'a'.repeat(72)} (copy)`);
  });
});

describe('RepositoryError', () => {
  it('is an Error that carries its code and cause', () => {
    const cause = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const error = new RepositoryError('QUOTA_EXCEEDED', 'Out of space', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RepositoryError');
    expect(error.code).toBe('QUOTA_EXCEEDED');
    expect(error.message).toBe('Out of space');
    expect(error.cause).toBe(cause);
  });

  it('has no cause when none is given', () => {
    expect(new RepositoryError('NOT_FOUND', 'x').cause).toBeUndefined();
  });
});

describe('normalizeProjectName', () => {
  it('trims the name', () => {
    expect(normalizeProjectName('  My room \n')).toBe('My room');
  });

  it('collapses nothing else: inner spaces and unicode are kept', () => {
    expect(normalizeProjectName('Despacho  de Zoë 🎮')).toBe('Despacho  de Zoë 🎮');
  });

  it.each(['', '   ', '\t\n'])('rejects the empty name %j', (name) => {
    expect(() => normalizeProjectName(name)).toThrowError(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
  });

  it('accepts the longest name and rejects one character more', () => {
    const longest = 'a'.repeat(LIMITS.maxNameLength);
    expect(normalizeProjectName(longest)).toBe(longest);
    expect(() => normalizeProjectName(`${longest}a`)).toThrowError(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
  });

  it('measures the length after trimming', () => {
    const padded = ` ${'a'.repeat(LIMITS.maxNameLength)} `;
    expect(normalizeProjectName(padded)).toHaveLength(LIMITS.maxNameLength);
  });

  it('rejects control characters', () => {
    expect(() => normalizeProjectName('a\u0000b')).toThrowError(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
  });
});

describe('uniqueProjectName', () => {
  it('keeps the base name when it is free', () => {
    expect(uniqueProjectName('Untitled project', ['Office'])).toBe('Untitled project');
  });

  it('numbers it from 2 when taken, ignoring case and spaces around', () => {
    expect(uniqueProjectName('Untitled project', ['  untitled PROJECT '])).toBe(
      'Untitled project 2',
    );
  });

  it('skips the numbers that are taken too', () => {
    expect(
      uniqueProjectName('Untitled project', [
        'Untitled project',
        'Untitled project 2',
        'Untitled project 4',
      ]),
    ).toBe('Untitled project 3');
  });

  it('accepts any iterable', () => {
    expect(uniqueProjectName('A', new Set(['A']))).toBe('A 2');
  });
});
