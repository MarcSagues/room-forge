import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextNotice } from './context-notice';

describe('ContextNotice', () => {
  it('shows nothing while the graphics context is fine', () => {
    const { container } = render(<ContextNotice state="ok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns, as an alert, that the view is being restored', () => {
    render(<ContextNotice state="lost" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The graphics context was lost. Trying to restore the view…',
    );
  });

  it('says politely that the view is back, without taking over', () => {
    render(<ContextNotice state="restored" />);
    expect(screen.getByRole('status')).toHaveTextContent('The view is back.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
