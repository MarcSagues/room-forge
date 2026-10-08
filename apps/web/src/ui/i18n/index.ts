import { en, es, type MessageKey } from './messages';

export type Locale = 'en' | 'es';
export const LOCALES: readonly Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

export type { MessageKey } from './messages';

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, es };

/** Look up a message and fill `{placeholders}`. Unknown placeholders are left untouched. */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
