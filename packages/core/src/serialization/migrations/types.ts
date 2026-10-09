/**
 * One step of schema evolution (DOMAIN_MODEL §6): a pure function from a document of version
 * `from` to one of version `from + 1`. It receives untrusted data and may throw on a shape it
 * cannot read; `migrateDocument` turns that into an error. Never mutate the input.
 */
export interface Migration {
  readonly from: number;
  readonly to: number;
  migrate(document: unknown): unknown;
}
