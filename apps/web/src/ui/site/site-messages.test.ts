import { describe, expect, it } from 'vitest';
import { siteMessages } from './site-messages';

/** The shape of a dictionary: keys and list lengths, without the texts. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, shape(v)]));
  }
  return typeof value;
}

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
}

describe('siteMessages', () => {
  it('Spanish has exactly the structure of English', () => {
    expect(shape(siteMessages.es)).toEqual(shape(siteMessages.en));
  });

  it('has no empty texts', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const text of texts(siteMessages[locale])) expect(text.trim()).not.toBe('');
    }
  });

  it('keeps the page title and description within what search results show', () => {
    for (const locale of ['en', 'es'] as const) {
      const { title, description } = siteMessages[locale].meta;
      expect(title.length, `${locale} title`).toBeLessThanOrEqual(60);
      expect(description.length, `${locale} description`).toBeLessThanOrEqual(180);
    }
  });
});
