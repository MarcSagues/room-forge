import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Like the E2E storage state: the first-run tour (P8-02) is already seen, so it never covers what
// a test clicks. `ui/tutorial` clears it to test the tour itself.
beforeEach(() => {
  try {
    localStorage.setItem('roomforge.tutorialSeen', '1');
  } catch {
    // No storage in this environment: the tour counts as seen anyway.
  }
});

afterEach(cleanup);
