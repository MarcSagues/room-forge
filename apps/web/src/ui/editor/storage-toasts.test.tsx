import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { showBackupReminder, showStorageWarning } from './storage-toasts';

describe('storage toasts', () => {
  it('reminds to export a copy, with "Don\'t show again"', async () => {
    render(<Toaster />);
    const onExport = vi.fn();
    const onNever = vi.fn();
    showBackupReminder({ onExport, onNever });

    expect(await screen.findByText('Time to export a copy?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    expect(onNever).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('warns that the browser may clear the projects, with an export', async () => {
    render(<Toaster />);
    const onExport = vi.fn();
    showStorageWarning({ onExport });

    const title = await screen.findByText('This browser may clear your projects.');
    const item = title.closest('li') as HTMLElement;
    await userEvent.click(within(item).getByRole('button', { name: 'Export a copy' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
