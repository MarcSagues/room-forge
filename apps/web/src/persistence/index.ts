/** Public API of the persistence module (ADR-0004): where projects are stored. */
export {
  createIndexedDbProjectRepository,
  type IndexedDbProjectRepository,
  type IndexedDbRepositoryOptions,
  type StorageManagerLike,
} from './indexeddb-repository';
export { createMemoryProjectRepository, type MemoryRepositoryOptions } from './memory-repository';
export { type OpenedRepository, openProjectRepository } from './open-repository';
