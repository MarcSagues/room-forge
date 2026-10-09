/** Public API of the ui module: other modules import only from here (no deep imports). */
export { Button, buttonVariants } from './components/button';
export { UiKit } from './dev/ui-kit';
export { ProjectStatusProvider } from './editor/project-status';
export { ProjectUnavailable, type ProjectUnavailableReason } from './editor/project-unavailable';
export { SaveNotice, type SaveProblem } from './editor/save-notice';
export type { SaveIndicator } from './editor/save-status';
export { DEFAULT_LOCALE, type Locale, type MessageKey, translate } from './i18n';
export { type ProjectFiles, ProjectsScreen, type ProjectsScreenProps } from './projects';
export { SelectionSummary } from './properties';
export { Providers } from './providers';
export { EditorShell } from './shell';
export { ThemeToggle } from './theme-toggle';
