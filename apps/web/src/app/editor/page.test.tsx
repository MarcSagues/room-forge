import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EditorPage from './page';

describe('EditorPage', () => {
  it('loads the editor shell on the client', async () => {
    render(<EditorPage />);
    expect(await screen.findByRole('main', { name: 'Viewport' })).toBeInTheDocument();
  });
});
