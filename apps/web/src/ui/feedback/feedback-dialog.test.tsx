import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackButton } from './feedback-button';
import { FeedbackDetailsProvider } from './feedback-context';
import { FeedbackDialog } from './feedback-dialog';

function openedUrl(open: ReturnType<typeof vi.spyOn>) {
  const [url, target, features] = open.mock.calls[0] as [string, string, string];
  expect(target).toBe('_blank');
  expect(features).toContain('noopener');
  return new URL(url);
}

afterEach(() => vi.restoreAllMocks());

describe('FeedbackDialog', () => {
  const collect = () => ({ gpu: 'Test GPU', errors: ['t0 [window]: boom'] });

  it('opens a prefilled GitHub issue in a new tab with the kind and the message', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<FeedbackDialog locale="en" open onOpenChange={() => {}} collect={collect} />);
    await userEvent.click(screen.getByRole('radio', { name: 'An idea or a request' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'Dimmer for LEDs');
    await userEvent.click(screen.getByRole('button', { name: 'Open on GitHub' }));

    const url = openedUrl(open);
    expect(url.origin + url.pathname).toBe('https://github.com/MarcSagues/room-forge/issues/new');
    expect(url.searchParams.get('template')).toBe('beta-idea.yml');
    expect(url.searchParams.get('message')).toBe('Dimmer for LEDs');
    expect(url.searchParams.has('details')).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(/opened in a new tab/);
  });

  it('shows the technical details before adding them, only when asked', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<FeedbackDialog locale="en" open onOpenChange={() => {}} collect={collect} />);
    expect(screen.queryByText(/Test GPU/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include technical details' }));
    expect(screen.getByText(/GPU: Test GPU/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'Crash');
    await userEvent.click(screen.getByRole('button', { name: 'Open on GitHub' }));
    const details = openedUrl(open).searchParams.get('details') ?? '';
    expect(details).toContain('Test GPU');
    expect(details).toContain('boom');
    expect(details).toContain('Browser:');
  });

  it('asks for a message instead of sending an empty one', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<FeedbackDialog locale="en" open onOpenChange={() => {}} collect={collect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open on GitHub' }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Write a message first.');
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveAttribute('aria-invalid');
  });

  it('copies the same text to the clipboard', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog locale="en" open onOpenChange={() => {}} collect={collect} />);
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'The lamp');
    await user.click(screen.getByRole('button', { name: 'Copy text' }));
    expect(await navigator.clipboard.readText()).toContain('[Beta bug] The lamp');
    expect(screen.getByRole('status')).toHaveTextContent(/Copied/);
  });

  it('leaves out a detail that cannot be read', async () => {
    const broken = () => {
      throw new Error('no scene');
    };
    render(<FeedbackDialog locale="en" open onOpenChange={() => {}} collect={broken} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include technical details' }));
    expect(screen.getByText(/RoomForge: /)).toBeInTheDocument();
  });
});

describe('FeedbackButton', () => {
  it('loads the dialog on demand, with the details of the provider', async () => {
    render(
      <FeedbackDetailsProvider collect={() => ({ quality: 'high' })}>
        <FeedbackButton locale="en" variant="icon" />
      </FeedbackDetailsProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include technical details' }));
    expect(screen.getByText(/Graphics quality: high/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send feedback' })).toHaveFocus(),
    );
  });

  it('opens in Spanish from a Spanish footer', async () => {
    render(<FeedbackButton locale="es" variant="link" label="Enviar comentarios" />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar comentarios' }));
    expect(await screen.findByRole('dialog', { name: 'Enviar comentarios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir en GitHub' })).toBeInTheDocument();
  });
});
