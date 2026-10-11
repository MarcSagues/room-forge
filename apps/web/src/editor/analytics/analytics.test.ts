import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEvent,
  createAnalytics,
  optedOut,
  readAnalyticsEndpoint,
} from './analytics';
import { installAnalyticsTracking } from './tracking';

function recorder() {
  const sent: Array<{ endpoint: string; body: unknown }> = [];
  return {
    sent,
    transport: (endpoint: string, body: string) => sent.push({ endpoint, body: JSON.parse(body) }),
  };
}

describe('readAnalyticsEndpoint', () => {
  it('accepts a same-origin path or an https URL', () => {
    expect(readAnalyticsEndpoint('/api/event')).toBe('/api/event');
    expect(readAnalyticsEndpoint(' https://stats.test/e ')).toBe('https://stats.test/e');
  });

  it('turns analytics off for anything else, or nothing', () => {
    for (const raw of [
      undefined,
      '',
      '  ',
      'http://stats.test/e',
      '//stats.test/e',
      'javascript:alert(1)',
      'https://user:pass@stats.test/e',
      'nope',
    ]) {
      expect(readAnalyticsEndpoint(raw), String(raw)).toBeNull();
    }
  });
});

describe('createAnalytics', () => {
  it('sends nothing without an endpoint (the default build)', () => {
    const { sent, transport } = recorder();
    const analytics = createAnalytics({ endpoint: null, signals: {}, transport });
    for (const event of ANALYTICS_EVENTS) analytics.track(event);
    expect(analytics.enabled).toBe(false);
    expect(sent).toEqual([]);
  });

  it('respects Do Not Track and Global Privacy Control', () => {
    expect(optedOut({ doNotTrack: '1' })).toBe(true);
    expect(optedOut({ globalPrivacyControl: true })).toBe(true);
    expect(optedOut({ doNotTrack: '0', globalPrivacyControl: false })).toBe(false);
    const { sent, transport } = recorder();
    const analytics = createAnalytics({
      endpoint: '/e',
      signals: { globalPrivacyControl: true },
      transport,
    });
    analytics.track('editor_opened');
    expect(sent).toEqual([]);
  });

  it('sends only the event name, once per page load', () => {
    const { sent, transport } = recorder();
    const analytics = createAnalytics({ endpoint: '/e', signals: {}, transport });
    analytics.track('export_json');
    analytics.track('export_json');
    analytics.track('editor_opened');
    expect(sent).toEqual([
      { endpoint: '/e', body: { event: 'export_json' } },
      { endpoint: '/e', body: { event: 'editor_opened' } },
    ]);
  });

  it('never sends more than the known event names, whatever the sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ANALYTICS_EVENTS)), (events) => {
        const { sent, transport } = recorder();
        const analytics = createAnalytics({ endpoint: '/e', signals: {}, transport });
        for (const event of events) analytics.track(event);
        expect(sent.length).toBe(new Set(events).size);
        for (const { body } of sent) {
          expect(Object.keys(body as object)).toEqual(['event']);
        }
      }),
    );
  });

  it('ignores a name outside the list', () => {
    const { sent, transport } = recorder();
    const analytics = createAnalytics({ endpoint: '/e', signals: {}, transport });
    analytics.track('page_url' as AnalyticsEvent);
    expect(sent).toEqual([]);
  });
});

describe('installAnalyticsTracking', () => {
  type DocumentListener = Parameters<
    Parameters<typeof installAnalyticsTracking>[0]['onDocumentChanged']
  >[0];

  function sources() {
    let documentListener: DocumentListener = () => {};
    let saveListener: (status: string) => void = () => {};
    const off = vi.fn();
    return {
      off,
      sources: {
        onDocumentChanged: (listener: DocumentListener) => {
          documentListener = listener;
          return off;
        },
        onSaveStatus: (listener: (status: string) => void) => {
          saveListener = listener;
          return off;
        },
      },
      change: (...args: Parameters<DocumentListener>) => documentListener(...args),
      save: (status: string) => saveListener(status),
    };
  }

  it('derives object, light and save events from edits only', () => {
    const { sent, transport } = recorder();
    const analytics = createAnalytics({ endpoint: '/e', signals: {}, transport });
    const s = sources();
    const uninstall = installAnalyticsTracking(s.sources, analytics);

    // Loading a project or undoing does not count.
    s.change({ patches: [{ op: 'add', path: ['objects', 'a'], value: {} }], source: 'load' });
    s.change({ patches: [{ op: 'add', path: ['objects', 'a'], value: {} }], source: 'undo' });
    // Moving an object is neither a placement nor a light change.
    s.change({
      patches: [{ op: 'replace', path: ['objects', 'a', 'position'] }],
      source: 'command',
    });
    expect(sent).toEqual([]);

    s.change({ patches: [{ op: 'add', path: ['objects', 'b'], value: {} }], source: 'command' });
    s.change({
      patches: [{ op: 'replace', path: ['objects', 'b', 'light', 'color'], value: '#f00' }],
      source: 'command',
    });
    s.change({ patches: [{ op: 'replace', path: ['lighting', 'mode'] }], source: 'command' });
    s.save('dirty');
    s.save('saved');
    s.save('saving');
    s.save('saved');
    expect(sent.map(({ body }) => (body as { event: string }).event)).toEqual([
      'first_object_placed',
      'light_changed',
      'project_saved',
    ]);

    uninstall();
    expect(s.off).toHaveBeenCalledTimes(2);
  });

  it('does not even listen when analytics is off', () => {
    const s = sources();
    const listen = vi.spyOn(s.sources, 'onDocumentChanged');
    installAnalyticsTracking(s.sources, createAnalytics({ endpoint: null, signals: {} }))();
    expect(listen).not.toHaveBeenCalled();
  });
});
