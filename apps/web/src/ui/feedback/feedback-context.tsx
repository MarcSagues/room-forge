'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { TechnicalDetails } from './feedback-report';

/** What the page knows beyond the version and the browser: GPU, quality, renderer, errors. */
export type CollectDetails = () => Partial<Omit<TechnicalDetails, 'appVersion' | 'browser'>>;

const none: CollectDetails = () => ({});
const FeedbackDetailsContext = createContext<CollectDetails>(none);

/**
 * Lets the editor hand the feedback dialog its technical details without the shell knowing about
 * them. `collect` runs only when the dialog shows them, so nothing is read before it is asked for.
 */
export function FeedbackDetailsProvider(props: { collect: CollectDetails; children: ReactNode }) {
  return (
    <FeedbackDetailsContext.Provider value={props.collect}>
      {props.children}
    </FeedbackDetailsContext.Provider>
  );
}

export function useCollectDetails(): CollectDetails {
  return useContext(FeedbackDetailsContext);
}
