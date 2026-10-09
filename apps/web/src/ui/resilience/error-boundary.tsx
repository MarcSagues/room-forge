'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** What to show instead of the children; `reset` tries to render them again. */
  fallback(args: { error: Error; reset(): void }): ReactNode;
  /** Called once per error, with where in the tree it came from. */
  onError?(error: Error, info: { componentStack?: string | null | undefined }): void;
  /** When any of these changes, the boundary tries again by itself. */
  resetKeys?: readonly unknown[];
}

interface State {
  error: Error | null;
}

const changed = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));

/**
 * Keeps a rendering error inside the part of the page that caused it (AGENTS: never lose the
 * work). Used for the whole editor and, separately, for each panel, so one failing panel does not
 * take the document, the other panels or the autosave with it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, { componentStack: info.componentStack });
  }

  override componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && changed(previous.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    return error ? this.props.fallback({ error, reset: this.reset }) : this.props.children;
  }
}
