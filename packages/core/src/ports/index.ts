export type {
  CatalogItem,
  CatalogProvider,
  LightCapability,
  MaterialSlot,
  PlacementSurface,
  SupportSurface,
} from './catalog';
export { type Clock, systemClock } from './clock';
export {
  copyProjectName,
  normalizeProjectName,
  type ProjectInput,
  type ProjectRepository,
  type ProjectSummary,
  RepositoryError,
  type RepositoryErrorCode,
  type StoredProject,
  uniqueProjectName,
} from './project-repository';
