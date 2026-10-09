import { describe, expect, it } from 'vitest';
import { matchesQuery, uniqueName } from './names';

describe('matchesQuery', () => {
  it('matches everything for an empty or blank query', () => {
    expect(matchesQuery('Office', '')).toBe(true);
    expect(matchesQuery('Office', '   ')).toBe(true);
  });

  it('ignores case, accents and surrounding spaces', () => {
    expect(matchesQuery('Despacho de Zoë', ' ZOE ')).toBe(true);
    expect(matchesQuery('Cócina', 'cocina')).toBe(true);
    expect(matchesQuery('Cocina', 'CÓCINA')).toBe(true);
  });

  it('matches anywhere in the name, and not what is not there', () => {
    expect(matchesQuery('Gaming room', 'ming r')).toBe(true);
    expect(matchesQuery('Gaming room', 'office')).toBe(false);
  });

  it('takes the query literally, not as a pattern', () => {
    expect(matchesQuery('Room (2)', '(2)')).toBe(true);
    expect(matchesQuery('Room 2', '.*')).toBe(false);
    expect(matchesQuery('a+b', 'a+b')).toBe(true);
  });
});

describe('uniqueName', () => {
  it('keeps the base name when it is free', () => {
    expect(uniqueName('Untitled project', ['Office'])).toBe('Untitled project');
  });

  it('numbers it from 2 when taken, ignoring case', () => {
    expect(uniqueName('Untitled project', ['untitled project'])).toBe('Untitled project 2');
  });

  it('skips the numbers that are taken too', () => {
    expect(
      uniqueName('Untitled project', [
        'Untitled project',
        'Untitled project 2',
        'Untitled project 4',
      ]),
    ).toBe('Untitled project 3');
  });
});
