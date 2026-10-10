import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, loadLocale, translate } from './index';
import { en } from './messages';
import { es } from './messages-es';
import { imageMessages, translateImage } from './messages-image';

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
    expect(translate('en', 'home.openEditor')).toBe('Open the editor');
    // Until its dictionary arrives a locale falls back to English instead of failing.
    expect(translate('es', 'home.openEditor')).toBe('Open the editor');
    await loadLocale('es');
    await loadLocale('es');
    expect(translate('es', 'home.openEditor')).toBe('Abrir el editor');
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(translate('en', 'editor.corePackage', { name: '@x/y' })).toBe('Core package: @x/y');
    expect(translate('en', 'editor.corePackage')).toBe('Core package: {name}');
  });
});

describe('image export messages (loaded with their dialog)', () => {
  it('has every key in both locales, non-empty and with the same placeholders', () => {
    const { en: english, es: spanish } = imageMessages;
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      expect(english[key].trim(), `en.${key}`).not.toBe('');
      expect(spanish[key].trim(), `es.${key}`).not.toBe('');
      expect(placeholders(spanish[key]), `placeholders of ${key}`).toEqual(
        placeholders(english[key]),
      );
    }
  });

  it('fills placeholders like translate', () => {
    expect(translateImage('en', 'image.file', { file: 'a.png' })).toBe('File: a.png');
    expect(translateImage('es', 'image.file', { file: 'a.png' })).toBe('Archivo: a.png');
  });
});
