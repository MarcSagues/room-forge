/** Public API of the ui module: other modules import only from here (no deep imports). */
export { CatalogPanel, type CatalogPanelItem, type CatalogPlacement } from './catalog';
export { Button, buttonVariants } from './components/button';
export { UiKit } from './dev/ui-kit';
export { DEFAULT_LOCALE, type Locale, type MessageKey, translate } from './i18n';
export { SelectionSummary } from './properties';
export { Providers } from './providers';
export { EditorShell } from './shell';
export { ThemeToggle } from './theme-toggle';
