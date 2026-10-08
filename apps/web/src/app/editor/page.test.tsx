import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EditorPage from './page';

describe('EditorPage', () => {
  it('renders the placeholder and shows the core package is wired in', () => {
    render(<EditorPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByText(/@roomforge\/core/)).toBeInTheDocument();
  });
});
