import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveStatusPill } from './save-status';

describe('SaveStatusPill', () => {
  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['dirty', 'Unsaved changes'],
    ['error', 'Not saved'],
  ] as const)('says "%s" as "%s"', (status, text) => {
    render(<SaveStatusPill status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('is a live region, so a screen reader hears it change', () => {
    const { rerender } = render(<SaveStatusPill status="saved" />);
    const region = screen.getByRole('status');
    rerender(<SaveStatusPill status="error" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Not saved');
  });

  it('marks the failure in more than colour: the words and the data attribute', () => {
    render(<SaveStatusPill status="error" />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveAttribute('data-status', 'error');
    expect(pill).toHaveTextContent('Not saved');
  });
});
