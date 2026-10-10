import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { ProjectStatusProvider, type ShareOutcome } from './project-status';
import { ShareButton } from './share-button';

function renderWith(onShare?: () => Promise<ShareOutcome>, onExport = vi.fn()) {
  render(
    <ProjectStatusProvider name="Den" save="saved" onShare={onShare} onExport={onExport}>
      <Toaster />
      <ShareButton />
    </ProjectStatusProvider>,
  );
  return { onExport };
}

describe('ShareButton', () => {
  it('is a disabled placeholder without a project to share', () => {
    renderWith(undefined);
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  });

  it('copies the link and says so', async () => {
    renderWith(async () => ({ kind: 'copied', length: 1800, long: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText(/Link copied\. Anyone with it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
  });

  it('warns that a long link may be cut, with its size', async () => {
    renderWith(async () => ({ kind: 'copied', length: 6144, long: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText(/Link copied \(6\.0 KB\)\. It is long/)).toBeInTheDocument();
  });

  it('is busy while the link is made', async () => {
    renderWith(() => new Promise<ShareOutcome>(() => {}));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('button', { name: 'Making the link…' })).toBeDisabled();
  });

  it('offers the project file when the room is too big for a link', async () => {
    const { onExport } = renderWith(async () => ({ kind: 'too-large' }));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const message = await screen.findByText(/too big for a link/);
    const toast = message.closest('li') as HTMLElement;
    await userEvent.click(within(toast).getByRole('button', { name: 'Export project file' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('says when the browser cannot make links or the copy fails', async () => {
    renderWith(async () => ({ kind: 'unsupported' }));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText(/cannot make share links/)).toBeInTheDocument();
  });

  it('treats a failure to share as a failed copy', async () => {
    renderWith(() => Promise.reject(new Error('boom')));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('The link could not be copied. Try again.')).toBeInTheDocument();
  });
});
