import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EditorPage from './page';

// The editor is a dynamic import (three, R3F, camera controls): slow on a cold, busy worker.
const LOAD_TIMEOUT_MS = 15_000;

describe('EditorPage', () => {
  it(
    'loads the editor shell on the client',
    async () => {
      render(<EditorPage />);
      expect(
        await screen.findByRole('main', { name: 'Viewport' }, { timeout: LOAD_TIMEOUT_MS }),
      ).toBeInTheDocument();
    },
    LOAD_TIMEOUT_MS + 5_000,
  );
});
