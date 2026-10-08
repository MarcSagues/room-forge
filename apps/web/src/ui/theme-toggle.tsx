'use client';

import { Button } from '@/ui/components/button';
import { translate } from '@/ui/i18n';
import type { ThemePreference } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: 'theme.system' | 'theme.light' | 'theme.dark';
}> = [
  { value: 'system', label: 'theme.system' },
  { value: 'light', label: 'theme.light' },
  { value: 'dark', label: 'theme.dark' },
];

/** Segmented control for the theme preference (system / light / dark). */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <fieldset className="flex items-center gap-1 border-0 p-0">
      <legend className="sr-only">{translate('en', 'theme.label')}</legend>
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={preference === option.value ? 'secondary' : 'ghost'}
          aria-pressed={preference === option.value}
          className={preference === option.value ? 'border-control' : undefined}
          onClick={() => setPreference(option.value)}
        >
          {translate('en', option.label)}
        </Button>
      ))}
    </fieldset>
  );
}
