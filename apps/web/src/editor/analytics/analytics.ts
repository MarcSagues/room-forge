/**
 * Respectful product analytics (P8-01, ADR-0011): off unless a build sets an endpoint, cookieless,
 * and blind to people and projects. What can be sent is a fixed list of event names, nothing else:
 * no project content, no URL (a shared view's fragment is the project), no identifier, no
 * timestamp finer than the server's own clock. Each event is sent at most once per page load, so
 * the numbers count visits that did something, not people or clicks.
 */
export const ANALYTICS_EVENTS = [
  'editor_opened',
  'first_object_placed',
  'light_changed',
  'export_png',
  'export_json',
  'share_link_created',
  'project_saved',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** The whole body of a request: `{"event":"export_json"}`. */
export interface AnalyticsPayload {
  readonly event: AnalyticsEvent;
}

export interface Analytics {
  /** False when there is no endpoint or the browser asked not to be tracked. */
  readonly enabled: boolean;
  track(event: AnalyticsEvent): void;
}

/**
 * Where events go, from `NEXT_PUBLIC_ANALYTICS_ENDPOINT` (inlined at build time). Only a same-origin
 * path (`/api/event`) or an https URL is accepted; anything else, or nothing, turns analytics off.
 */
export function readAnalyticsEndpoint(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The privacy signals a browser can send: Do Not Track and Global Privacy Control. */
export interface PrivacySignals {
  readonly doNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
}

export function optedOut(signals: PrivacySignals): boolean {
  return signals.doNotTrack === '1' || signals.globalPrivacyControl === true;
}

export type Transport = (endpoint: string, body: string) => void;

/** `fetch` without credentials, kept alive so an event sent while the page closes still leaves. */
export const fetchTransport: Transport = (endpoint, body) => {
  void fetch(endpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    keepalive: true,
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  }).catch(() => {
    // Analytics never gets in the way: a lost event is fine.
  });
};

export function createAnalytics(options: {
  endpoint: string | null;
  signals: PrivacySignals;
  transport?: Transport;
}): Analytics {
  const { endpoint, signals, transport = fetchTransport } = options;
  const enabled = endpoint !== null && !optedOut(signals);
  const sent = new Set<AnalyticsEvent>();
  return {
    enabled,
    track(event) {
      if (!enabled || endpoint === null || sent.has(event)) return;
      if (!ANALYTICS_EVENTS.includes(event)) return;
      sent.add(event);
      const payload: AnalyticsPayload = { event };
      transport(endpoint, JSON.stringify(payload));
    },
  };
}

/** Does nothing: what tests and builds without an endpoint get. */
export const noAnalytics: Analytics = { enabled: false, track: () => {} };
