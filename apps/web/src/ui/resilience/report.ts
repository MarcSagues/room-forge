/** Where "Report a problem" opens a new issue. */
export const REPORT_ISSUES_URL = 'https://github.com/MarcSagues/room-forge/issues/new';

/** Browsers and GitHub refuse very long URLs: stay well under the usual 8 000 characters. */
export const MAX_REPORT_URL_LENGTH = 7000;

export interface ReportInput {
  /** What went wrong, as the error log would write it. */
  message: string;
  stack?: string;
  /** The panel or area it happened in. */
  where?: string;
  appVersion: string;
  userAgent: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function compose(input: ReportInput, messageMax: number, stackMax: number) {
  const title = input.where ? `Problem in ${input.where}` : 'Problem in the editor';
  const lines = [
    '**What happened**',
    '<!-- Describe what you were doing when this happened. -->',
    '',
    '**Error**',
    '```',
    clip(input.message, messageMax),
    '```',
  ];
  if (input.stack && stackMax > 0) lines.push('', '```', clip(input.stack, stackMax), '```');
  lines.push(
    '',
    '**Environment**',
    `- RoomForge: ${input.appVersion}`,
    `- Browser: ${input.userAgent}`,
    '',
    '_Project data is not included. If it would help, export a copy of your project and attach it here._',
  );
  const query = new URLSearchParams({ title, body: lines.join('\n') });
  return `${REPORT_ISSUES_URL}?${query.toString()}`;
}

/**
 * The address that opens a new issue with what went wrong filled in. It takes only the error, its
 * place and the environment: there is no parameter that could carry the project, so nothing of
 * the person's work leaves the browser unless they attach it themselves. Long messages and stacks
 * are cut until the address fits.
 */
export function buildReportUrl(input: ReportInput): string {
  const safe: ReportInput = {
    message: input.message,
    appVersion: input.appVersion,
    userAgent: input.userAgent,
    ...(input.stack ? { stack: input.stack } : {}),
    ...(input.where ? { where: input.where } : {}),
  };
  for (const [messageMax, stackMax] of [
    [500, 2000],
    [500, 800],
    [300, 0],
    [120, 0],
  ] as const) {
    const url = compose(safe, messageMax, stackMax);
    if (url.length <= MAX_REPORT_URL_LENGTH) return url;
  }
  return compose({ ...safe, userAgent: clip(safe.userAgent, 200) }, 60, 0);
}
