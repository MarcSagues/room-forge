import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, loadLocale, translate } from './index';
import { en } from './messages';
import { es } from './messages-es';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('messages', () => {
  it('Spanish provides exactly the English keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings and the same placeholders in every locale', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim(), `en.${key}`).not.toBe('');
      expect(es[key].trim(), `es.${key}`).not.toBe('');
      expect(placeholders(es[key]), `placeholders of ${key}`).toEqual(placeholders(en[key]));
    }
  });
});

describe('translate', () => {
  it('uses English by default, and Spanish once it is loaded', async () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES).toEqual(['en', 'es']);
    expect(translate('en', 'projects.new')).toBe('New project');
    // Until its dictionary arrives a locale falls back to English instead of failing.
    expect(translate('es', 'projects.new')).toBe('New project');
    await loadLocale('es');
    await loadLocale('es');
    expect(translate('es', 'projects.new')).toBe('Nuevo proyecto');
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(translate('en', 'editor.corePackage', { name: '@x/y' })).toBe('Core package: @x/y');
    expect(translate('en', 'editor.corePackage')).toBe('Core package: {name}');
  });
});
