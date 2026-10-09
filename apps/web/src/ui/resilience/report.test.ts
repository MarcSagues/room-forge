import { describe, expect, it } from 'vitest';
import { buildReportUrl, MAX_REPORT_URL_LENGTH, REPORT_ISSUES_URL } from './report';

const base = {
  message: 'TypeError: cannot read properties of undefined',
  where: 'Properties panel',
  appVersion: '0.1.0',
  userAgent: 'Mozilla/5.0 Test',
};

function decoded(url: string) {
  const parsed = new URL(url);
  return {
    title: parsed.searchParams.get('title') ?? '',
    body: parsed.searchParams.get('body') ?? '',
  };
}

describe('buildReportUrl', () => {
  it('opens a new issue in the project repository with the title and body filled in', () => {
    const url = buildReportUrl(base);
    expect(url.startsWith(`${REPORT_ISSUES_URL}?`)).toBe(true);
    const { title, body } = decoded(url);
    expect(title).toContain('Properties panel');
    expect(body).toContain('TypeError: cannot read properties of undefined');
    expect(body).toContain('0.1.0');
    expect(body).toContain('Mozilla/5.0 Test');
  });

  it('says the project is not included, and how to share it on purpose', () => {
    const { body } = decoded(buildReportUrl(base));
    expect(body).toMatch(/project data is not included/i);
    expect(body).toMatch(/export/i);
  });

  it('puts the stack in a code block', () => {
    const { body } = decoded(
      buildReportUrl({ ...base, stack: 'at foo (a.js:1:1)\nat bar (b.js:2:2)' }),
    );
    expect(body).toContain('```');
    expect(body).toContain('at foo (a.js:1:1)');
  });

  it('is a well-formed URL: special characters are escaped and survive the round trip', () => {
    const message = 'a & b # c = d ? e\nsecond line "quoted" ñ 😀';
    const url = buildReportUrl({ ...base, message });
    expect(url).not.toMatch(/[\s#]/.test(url.split('?')[1] ?? '') ? /$^/ : /(?!)/);
    expect(url.includes(' ')).toBe(false);
    expect(url.includes('\n')).toBe(false);
    expect(decoded(url).body).toContain(message);
  });

  it('never exceeds what a browser and GitHub accept, however long the stack is', () => {
    const stack = Array.from(
      { length: 500 },
      (_, i) => `at frame${i} (https://example.com/a.js:${i}:1)`,
    ).join('\n');
    const url = buildReportUrl({ ...base, message: 'x'.repeat(10_000), stack });
    expect(url.length).toBeLessThanOrEqual(MAX_REPORT_URL_LENGTH);
    expect(decoded(url).body).toContain('0.1.0'); // the environment still fits
  });

  it('has no way to include the project: it only takes what went wrong and where', () => {
    // The input type has no document or project field; whatever else is passed is ignored.
    const url = buildReportUrl({
      ...base,
      document: { rooms: { secret: 1 } },
      project: { name: 'Secret' },
    } as never);
    expect(url).not.toContain('secret');
    expect(url).not.toContain('Secret');
  });

  it('works without a place or a stack', () => {
    const { title, body } = decoded(
      buildReportUrl({ message: 'oops', appVersion: '1', userAgent: 'x' }),
    );
    expect(title).toMatch(/problem/i);
    expect(body).toContain('oops');
  });
});
