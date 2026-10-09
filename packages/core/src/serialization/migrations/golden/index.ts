import type { GoldenCase } from './types';
import { v0ToV1 } from './v0-to-v1';

export type { GoldenCase } from './types';

export const GOLDEN_CASES: readonly GoldenCase[] = [v0ToV1];
