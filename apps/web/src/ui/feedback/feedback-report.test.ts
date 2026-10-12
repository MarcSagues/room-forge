import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_REPORT_URL_LENGTH } from '../resilience/report';
import {
  buildFeedbackUrl,
  detailsText,
  errorLines,
  FEEDBACK_KINDS,
  type FeedbackInput,
  feedbackText,
  feedbackTitle,
  renderSummary,
  type TechnicalDetails,
} from './feedback-report';

const details: TechnicalDetails = {
  appVersion: '0.9.0',
  browser: 'Mozilla/5.0 Test',
  gpu: 'ANGLE (Test GPU)',
  quality: 'medium',
  render: 'calls 12 · triangles 3400',
  errors: ['2026-10-12T10:00:00.000Z [window]: TypeError: boom'],
};

function params(url: string) {
  const parsed = new URL(url);
  return Object.fromEntries(parsed.searchParams.entries());
}

describe('buildFeedbackUrl', () => {
  it('opens the beta issue form of the repository with the fields filled in', () => {
    const { url, clipped } = buildFeedbackUrl({ kind: 'bug', message: 'The lamp is black\nmore' });
    expect(url.startsWith('https://github.com/MarcSagues/room-forge/issues/new?')).toBe(true);
    expect(params(url)).toEqual({
      template: 'beta-bug.yml',
      title: '[Beta bug] The lamp is black',
      message: 'The lamp is black\nmore',
    });
    expect(clipped).toBe(false);
  });

  it('uses the idea form for ideas and for anything else', () => {
    expect(params(buildFeedbackUrl({ kind: 'idea', message: 'x' }).url).template).toBe(
      'beta-idea.yml',
    );
    const other = params(buildFeedbackUrl({ kind: 'other', message: 'x' }).url);
    expect(other.template).toBe('beta-idea.yml');
    expect(other.title).toBe('[Beta feedback] x');
  });

  it('adds the technical details only when they are given', () => {
    expect(params(buildFeedbackUrl({ kind: 'bug', message: 'x' }).url).details).toBeUndefined();
    const withDetails = params(buildFeedbackUrl({ kind: 'bug', message: 'x', details }).url);
    expect(withDetails.details).toContain('0.9.0');
    expect(withDetails.details).toContain('ANGLE (Test GPU)');
    expect(withDetails.details).toContain('TypeError: boom');
  });

  it('drops the errors first, then cuts the message, to fit the address', () => {
    const errors = Array.from({ length: 5 }, (_, i) => `${i} ${'e'.repeat(190)}`);
    const longErrors = buildFeedbackUrl({
      kind: 'bug',
      message: 'm'.repeat(6000),
      details: { ...details, errors },
    });
    expect(longErrors.url.length).toBeLessThanOrEqual(MAX_REPORT_URL_LENGTH);
    expect(longErrors.clipped).toBe(true);
    expect(params(longErrors.url).message).toHaveLength(6000);

    const long = buildFeedbackUrl({ kind: 'idea', message: 'ü'.repeat(4000) });
    expect(long.url.length).toBeLessThanOrEqual(MAX_REPORT_URL_LENGTH);
    expect(long.clipped).toBe(true);
    expect(params(long.url).message?.endsWith('…')).toBe(true);
  });

  it('always fits, whatever is typed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FEEDBACK_KINDS),
        fc.string({ maxLength: 6000, unit: 'grapheme' }),
        fc.boolean(),
        (kind, message, withDetails) => {
          const input: FeedbackInput = withDetails ? { kind, message, details } : { kind, message };
          const { url } = buildFeedbackUrl(input);
          expect(url.length).toBeLessThanOrEqual(MAX_REPORT_URL_LENGTH);
          expect(params(url).template).toMatch(/^beta-(bug|idea)\.yml$/);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('feedback texts', () => {
  it('titles with the first line, cut', () => {
    expect(feedbackTitle('idea', `  ${'a'.repeat(100)}\nsecond`)).toBe(
      `[Beta idea] ${'a'.repeat(80)}…`,
    );
    expect(feedbackTitle('bug', '')).toBe('[Beta bug]');
  });

  it('copies everything as plain text', () => {
    const text = feedbackText({ kind: 'bug', message: 'Broken', details });
    expect(text).toContain('[Beta bug] Broken');
    expect(text).toContain('Technical details');
    expect(text).toContain('- GPU: ANGLE (Test GPU)');
    expect(feedbackText({ kind: 'bug', message: 'Broken' })).not.toContain('Technical details');
  });

  it('lists only the details that are known', () => {
    expect(detailsText({ appVersion: '1', browser: 'B' })).toBe('- RoomForge: 1\n- Browser: B');
    expect(detailsText(details, 0)).not.toContain('Recent errors');
  });

  it('summarises the renderer and the last errors on one line each', () => {
    expect(
      renderSummary({ calls: 3, triangles: 10, geometries: 2, textures: 1, programs: 4 }),
    ).toBe('calls 3 · triangles 10 · geometries 2 · textures 1 · programs 4');
    const entries = Array.from({ length: 8 }, (_, i) => ({
      time: `t${i}`,
      source: 'window',
      message: i === 7 ? 'x'.repeat(400) : `m${i}`,
      ...(i === 6 ? { where: 'Viewport' } : {}),
    }));
    const lines = errorLines(entries);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('t3 [window]: m3');
    expect(lines[3]).toBe('t6 [window] Viewport: m6');
    expect(lines[4]?.length).toBe(201);
  });
});
