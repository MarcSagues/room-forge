'use client';

import type { SessionState } from '@roomforge/core';
import { useStore } from 'zustand';
import { useSceneSession } from './scene-context';

/**
 * Subscribes a component inside the canvas to a *slice* of the session state. It re-renders only
 * when the selected value changes (compare with `Object.is`; wrap array/object selectors in
 * `useShallow` from `zustand/react/shallow`). This is the granular-subscription rule of ADR-0006:
 * never select the whole state.
 */
export function useSessionState<T>(selector: (state: SessionState) => T): T {
  return useStore(useSceneSession().store, selector);
}
