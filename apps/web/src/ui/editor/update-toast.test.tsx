import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { showUpdateAvailable } from './update-toast';

describe('update toast', () => {
  it('says a new version is ready and reloads only when asked', async () => {
    render(<Toaster />);
    const onReload = vi.fn();
    showUpdateAvailable({ onReload });

    const title = await screen.findByText('Update available');
    expect(onReload).not.toHaveBeenCalled();
    const item = title.closest('li') as HTMLElement;
    await userEvent.click(within(item).getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
