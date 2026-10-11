import { type Analytics, createAnalytics, readAnalyticsEndpoint } from './analytics';

export {
  ANALYTICS_EVENTS,
  type Analytics,
  type AnalyticsEvent,
  type AnalyticsPayload,
  createAnalytics,
  noAnalytics,
  optedOut,
  readAnalyticsEndpoint,
} from './analytics';
export { installAnalyticsTracking, type TrackingSources } from './tracking';

let shared: Analytics | null = null;

/**
 * The page's analytics, created on first use from the build's endpoint and the browser's privacy
 * signals. Without `NEXT_PUBLIC_ANALYTICS_ENDPOINT` it is disabled and sends nothing.
 */
export function pageAnalytics(): Analytics {
  if (shared) return shared;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  shared = createAnalytics({
    endpoint: readAnalyticsEndpoint(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT),
    signals: {
      doNotTrack: nav.doNotTrack,
      globalPrivacyControl: nav.globalPrivacyControl === true,
    },
  });
  return shared;
}
