import { en, type MessageKey } from './messages';

export type Locale = 'en' | 'es';
export const LOCALES: readonly Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

export type { MessageKey } from './messages';

/**
 * English is always there; other locales are loaded on demand, so a page only carries the
 * dictionaries it uses. Until a locale is loaded its texts fall back to English.
 */
const catalogs: Partial<Record<Locale, Record<MessageKey, string>>> = { en };

/** Makes `locale` available to `translate`. Resolves once its dictionary is in. */
export async function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return;
  if (locale === 'es') catalogs.es = (await import('./messages-es')).es;
}

/** Look up a message and fill `{placeholders}`. Unknown placeholders are left untouched. */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  return (catalogs[locale] ?? en)[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
