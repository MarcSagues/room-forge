import { MAX_REPORT_URL_LENGTH, REPORT_ISSUES_URL } from '../resilience/report';

export type FeedbackKind = 'bug' | 'idea' | 'other';
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['bug', 'idea', 'other'];

/** The issue form each kind opens (`.github/ISSUE_TEMPLATE/`); they carry the triage labels. */
export const FEEDBACK_TEMPLATES: Readonly<Record<FeedbackKind, string>> = {
  bug: 'beta-bug.yml',
  idea: 'beta-idea.yml',
  other: 'beta-idea.yml',
};

const TITLE_PREFIX: Readonly<Record<FeedbackKind, string>> = {
  bug: '[Beta bug]',
  idea: '[Beta idea]',
  other: '[Beta feedback]',
};

/** What "include technical details" adds. Never anything from the project itself. */
export interface TechnicalDetails {
  appVersion: string;
  browser: string;
  gpu?: string | undefined;
  quality?: string | undefined;
  /** A one-line summary of `renderer.info`. */
  render?: string | undefined;
  /** The last entries of the local error log, one line each, oldest first. */
  errors?: readonly string[] | undefined;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Present only when the person ticked "include technical details". */
  details?: TechnicalDetails | undefined;
}

export interface FeedbackLink {
  url: string;
  /** The message or the details had to be cut for the address to fit. */
  clipped: boolean;
}

const TITLE_MAX = 80;
const ERROR_LINE_MAX = 200;
export const FEEDBACK_ERROR_LINES = 5;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function feedbackTitle(kind: FeedbackKind, message: string): string {
  const firstLine = message.trim().split('\n')[0]?.trim() ?? '';
  return `${TITLE_PREFIX[kind]} ${clip(firstLine, TITLE_MAX)}`.trim();
}

/** The counters of `renderer.info` worth a triage, on one line. */
export function renderSummary(info: {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}): string {
  return `calls ${info.calls} · triangles ${info.triangles} · geometries ${info.geometries} · textures ${info.textures} · programs ${info.programs}`;
}

/** The last error-log entries as single lines, without their stacks (the address is short). */
export function errorLines(
  entries: readonly { time: string; source: string; where?: string; message: string }[],
  count = FEEDBACK_ERROR_LINES,
): string[] {
  return entries.slice(-count).map((entry) => {
    const place = entry.where ? ` ${entry.where}` : '';
    return clip(`${entry.time} [${entry.source}]${place}: ${entry.message}`, ERROR_LINE_MAX);
  });
}

/** The details as the person sees them in the dialog and as they reach the issue. */
export function detailsText(details: TechnicalDetails, errorCount = FEEDBACK_ERROR_LINES): string {
  const lines = [`- RoomForge: ${details.appVersion}`, `- Browser: ${details.browser}`];
  if (details.gpu) lines.push(`- GPU: ${details.gpu}`);
  if (details.quality) lines.push(`- Graphics quality: ${details.quality}`);
  if (details.render) lines.push(`- Renderer: ${details.render}`);
  const errors = errorCount > 0 ? (details.errors ?? []).slice(-errorCount) : [];
  if (errors.length > 0) lines.push('- Recent errors:', ...errors.map((line) => `  - ${line}`));
  return lines.join('\n');
}

function compose(input: FeedbackInput, messageMax: number, errorCount: number): string {
  const query = new URLSearchParams({
    template: FEEDBACK_TEMPLATES[input.kind],
    title: feedbackTitle(input.kind, input.message),
    // Issue forms fill a field from the parameter named as its id.
    message: clip(input.message.trim(), messageMax),
  });
  if (input.details) query.set('details', detailsText(input.details, errorCount));
  return `${REPORT_ISSUES_URL}?${query.toString()}`;
}

/**
 * The address of a new GitHub issue with the feedback filled in. It is a navigation, not a
 * request: nothing leaves the browser until the person submits the form on GitHub. It takes only
 * the kind, the message and (if asked for) the technical details, so the project cannot travel
 * with it. Errors go first, then the message is cut, until the address fits.
 */
export function buildFeedbackUrl(input: FeedbackInput): FeedbackLink {
  const full = input.message.trim().length;
  for (const errorCount of [FEEDBACK_ERROR_LINES, 2, 0]) {
    const url = compose(input, Number.POSITIVE_INFINITY, errorCount);
    if (url.length <= MAX_REPORT_URL_LENGTH)
      return { url, clipped: errorCount < (input.details?.errors?.length ?? 0) };
  }
  for (let max = Math.min(full, 3000); max > 0; max = Math.floor(max * 0.7)) {
    const url = compose(input, max, 0);
    if (url.length <= MAX_REPORT_URL_LENGTH) return { url, clipped: true };
  }
  return { url: compose({ kind: input.kind, message: '' }, 0, 0), clipped: true };
}

/** The whole feedback as plain text, for the clipboard: nothing is cut. */
export function feedbackText(input: FeedbackInput): string {
  const parts = [feedbackTitle(input.kind, input.message), '', input.message.trim()];
  if (input.details) parts.push('', 'Technical details', detailsText(input.details));
  return parts.join('\n');
}
