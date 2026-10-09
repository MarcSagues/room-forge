/**
 * A real document of the old version and exactly what its migration must produce. Every migration
 * needs one (`migrations.test.ts` fails without it), and goldens are never edited: they are what
 * keeps old files opening.
 */
export interface GoldenCase {
  name: string;
  /** The schema version of `input`: the migration `from` that it tests. */
  from: number;
  input: unknown;
  expected: unknown;
}
