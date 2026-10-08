import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('accepts typing', async () => {
    render(<Input aria-label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.type(input, 'Desk');
    expect(input).toHaveValue('Desk');
  });

  it('reflects the invalid state for assistive technology', () => {
    render(<Input aria-label="Width" aria-invalid defaultValue="999" />);
    expect(screen.getByRole('textbox', { name: 'Width' })).toBeInvalid();
  });

  it('can be disabled and is skipped by keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Locked" disabled />);
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Locked' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Locked' })).not.toHaveFocus();
  });
});
