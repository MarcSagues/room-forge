import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadOnlyNotice } from './read-only-notice';

describe('ReadOnlyNotice', () => {
  it('says the project is open in another tab and offers to take over', () => {
    render(<ReadOnlyNotice onTakeOver={async () => {}} />);
    const notice = screen.getByRole('status', { name: 'This project is open in another tab.' });
    expect(notice).toHaveTextContent('changes are not allowed');
    expect(screen.getByRole('button', { name: 'Take over' })).toBeEnabled();
  });

  it('is busy while taking over, and can be tried again if it fails', async () => {
    let fail: (error: Error) => void = () => {};
    const onTakeOver = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    render(<ReadOnlyNotice onTakeOver={onTakeOver} />);

    await userEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Taking over…' })).toBeDisabled();

    fail(new Error('gone'));
    expect(await screen.findByRole('button', { name: 'Take over' })).toBeEnabled();
  });
});
