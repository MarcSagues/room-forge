// Types for budgets.mjs, which the E2E specs (TypeScript) import.
export interface Budgets {
  coverage: {
    core: { lines: number; branches: number };
    web: { lines: number };
  };
  bundle: {
    /** The most a route may load: the gate, tightened as the app gets lighter. */
    initialJsGzipKb: Record<string, number>;
    /** Where a route is meant to end up; shown in the report, not enforced. */
    targetGzipKb?: Record<string, number>;
  };
  scene: {
    pattern: { objects: number; lights: number };
    limits: Record<string, number>;
  };
}

export interface BudgetRow {
  metric: string;
  value: number | undefined;
  limit: number | undefined;
  over: boolean;
  missing: boolean;
}

export interface Chunk {
  file: string;
  bytes: number;
  gzip: number;
  /** Whether the chunk contains the three.js renderer. */
  three?: boolean;
}

export interface ChunkSummary {
  chunks: Chunk[];
  totalGzip: number;
  totalBytes: number;
}

export function loadBudgets(directory?: string): Budgets;
export function gzipSize(buffer: Uint8Array): number;
export function kB(bytes: number): number;
export function compare(
  measured: Record<string, number>,
  limits: Record<string, number>,
): BudgetRow[];
export function failures(rows: BudgetRow[]): BudgetRow[];
export function describeFailures(label: string, rows: BudgetRow[]): string[];
export function summarizeChunks(files: Chunk[]): ChunkSummary;
export function renderReport(
  input: { routes: Record<string, ChunkSummary>; scene?: Record<string, number> },
  budgets: Budgets,
): string;
