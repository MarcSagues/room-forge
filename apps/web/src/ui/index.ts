/** Public API of the ui module: other modules import only from here (no deep imports). */
export { CatalogPanel, type CatalogPanelItem, type CatalogPlacement } from './catalog';
export { Button, buttonVariants } from './components/button';
export { UiKit } from './dev/ui-kit';
export {
  ProjectStatusProvider,
  type ShareOutcome,
  useProjectStatus,
} from './editor/project-status';
export { ProjectUnavailable, type ProjectUnavailableReason } from './editor/project-unavailable';
export { ReadOnlyNotice } from './editor/read-only-notice';
export { SaveNotice, type SaveProblem } from './editor/save-notice';
export type { SaveIndicator } from './editor/save-status';
export { SharedLinkUnavailable, SharedViewBanner } from './editor/shared-view';
export { showBackupReminder, showStorageWarning } from './editor/storage-toasts';
export { DEFAULT_LOCALE, type Locale, type MessageKey, translate } from './i18n';
export { RoomMaterialsPanel } from './materials';
export { LazySceneOutliner, SceneOutliner } from './outliner';
export { type ProjectFiles, ProjectsScreen, type ProjectsScreenProps } from './projects';
export { SelectionSummary } from './properties';
export { Providers } from './providers';
export {
  ContextNotice,
  type ContextState,
  downloadText,
  ErrorBoundary,
  FailureScreen,
  PanelFallback,
} from './resilience';
export { RoomSizePanel } from './room';
export { formatBytes, SettingsButton, type StorageInfo } from './settings/settings-dialog';
export { EditorShell } from './shell';
export {
  Landing,
  LegalPage,
  LicensesPage,
  PUBLIC_PAGES,
  type PublicPage,
  privacyPolicy,
  type SiteMessages,
  SitePage,
  siteMessages,
  termsOfUse,
} from './site';
export { ThemeToggle } from './theme-toggle';
