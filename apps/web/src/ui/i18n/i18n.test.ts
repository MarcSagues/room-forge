import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, translate } from './index';
import { en, es } from './messages';

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
  it('uses English by default and knows both locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES).toEqual(['en', 'es']);
    expect(translate('en', 'home.openEditor')).toBe('Open the editor');
    expect(translate('es', 'home.openEditor')).toBe('Abrir el editor');
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(translate('en', 'editor.corePackage', { name: '@x/y' })).toBe('Core package: @x/y');
    expect(translate('en', 'editor.corePackage')).toBe('Core package: {name}');
  });
});
