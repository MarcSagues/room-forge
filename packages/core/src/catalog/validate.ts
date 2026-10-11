import { type CatalogCategory, type CatalogManifest, CatalogManifestSchema } from './manifest';

export interface CatalogBudget {
  readonly triangles: number;
  readonly bytes: number;
}

/** What the catalog lets in (ADR-0007): licences and per-model budgets, by category if needed. */
export interface CatalogPolicy {
  readonly licenses: readonly string[];
  readonly budgets: {
    readonly default: CatalogBudget;
    readonly byCategory?: Partial<Record<CatalogCategory, CatalogBudget>>;
  };
}

/** Licence of the models RoomForge makes itself; every other licence names its source. */
export const OWN_LICENSE = 'LicenseRef-RoomForge-Proprietary';

export const DEFAULT_CATALOG_POLICY: CatalogPolicy = {
  licenses: ['CC0-1.0', 'CC-BY-4.0', OWN_LICENSE],
  budgets: { default: { triangles: 20_000, bytes: 300_000 } },
};

/** What a model file really is, measured by the caller (the validator touches no files). */
export interface CatalogFileStats {
  readonly triangles: number;
  readonly bytes: number;
}

export type CatalogIssueCode =
  | 'schema'
  | 'duplicate-id'
  | 'duplicate-slot'
  | 'light-slot'
  | 'missing-file'
  | 'stats-mismatch'
  | 'over-budget'
  | 'license'
  | 'support';

export interface CatalogIssue {
  readonly code: CatalogIssueCode;
  /** The item at fault, or null for the manifest as a whole. */
  readonly itemId: string | null;
  readonly message: string;
}

/**
 * Everything wrong with a catalog manifest (P4-02): its shape, unique ids, that each model exists
 * and is what the manifest says, budgets and licences. Empty means it can ship. `files` measures
 * a model by its manifest path and returns undefined when there is no such file.
 */
export function validateCatalogManifest(
  input: unknown,
  files: (file: string) => CatalogFileStats | undefined,
  policy: CatalogPolicy = DEFAULT_CATALOG_POLICY,
): CatalogIssue[] {
  const parsed = CatalogManifestSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: 'schema',
      itemId: null,
      message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    }));
  }
  return checkItems(parsed.data, files, policy);
}

function checkItems(
  manifest: CatalogManifest,
  files: (file: string) => CatalogFileStats | undefined,
  policy: CatalogPolicy,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const seen = new Set<string>();
  for (const item of manifest.items) {
    const report = (code: CatalogIssueCode, message: string) =>
      issues.push({ code, itemId: item.id, message: `${item.id}: ${message}` });
    if (seen.has(item.id)) report('duplicate-id', 'the id is used by another item');
    seen.add(item.id);

    const slotIds = item.slots.map((slot) => slot.id);
    if (new Set(slotIds).size !== slotIds.length) report('duplicate-slot', 'two slots share an id');
    const glows = item.slots.some((slot) => slot.emissive);
    if (item.light && !glows) report('light-slot', 'a luminaire needs an emissive slot');
    if (!item.light && glows) report('light-slot', 'only a luminaire has an emissive slot');

    for (const support of item.supports ?? []) {
      if (!supportInside(support, item.size))
        report('support', 'a support surface is off the item');
    }

    const { file, triangles, bytes } = item.source;
    const actual = files(file);
    if (!actual) report('missing-file', `${file} does not exist`);
    else if (actual.triangles !== triangles || actual.bytes !== bytes) {
      report(
        'stats-mismatch',
        `${file} has ${actual.triangles} triangles and ${actual.bytes} bytes, the manifest says ${triangles} and ${bytes}`,
      );
    }
    const budget = policy.budgets.byCategory?.[item.category] ?? policy.budgets.default;
    const measured = actual ?? { triangles, bytes };
    if (measured.triangles > budget.triangles || measured.bytes > budget.bytes) {
      report(
        'over-budget',
        `${measured.triangles} triangles and ${measured.bytes} bytes; the budget is ${budget.triangles} and ${budget.bytes}`,
      );
    }

    const { spdx, sourceUrl } = item.license;
    if (!policy.licenses.includes(spdx)) report('license', `${spdx} is not an allowed licence`);
    else if (spdx !== OWN_LICENSE && sourceUrl === undefined) {
      report('license', 'a third-party asset needs the URL it comes from');
    }
  }
  return issues;
}

/** A support lies on the item: no higher than its top and inside its footprint (1 mm slack). */
function supportInside(
  { y, rect }: NonNullable<CatalogManifest['items'][number]['supports']>[number],
  size: { w: number; h: number; d: number },
): boolean {
  const t = 0.001;
  return (
    y <= size.h + t &&
    Math.abs(rect.x) + rect.w / 2 <= size.w / 2 + t &&
    Math.abs(rect.z) + rect.d / 2 <= size.d / 2 + t
  );
}
