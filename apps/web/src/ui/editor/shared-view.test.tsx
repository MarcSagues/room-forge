import { RepositoryError } from '@roomforge/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SharedLinkUnavailable, SharedViewBanner } from './shared-view';

describe('SharedViewBanner', () => {
  it('says the room is read-only and names it', () => {
    render(<SharedViewBanner name="Gaming den" onCopy={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'A shared room, read-only' })).toBeInTheDocument();
    expect(screen.getByText(/You are looking at “Gaming den”/)).toBeInTheDocument();
  });

  it('is busy while the copy is made', async () => {
    const onCopy = vi.fn(() => new Promise<void>(() => {}));
    render(<SharedViewBanner name="x" onCopy={onCopy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Make a copy to edit' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Making a copy…' })).toBeDisabled();
  });

  it('explains a copy that could not be saved, and allows another try', async () => {
    const onCopy = vi.fn(() => Promise.reject(new RepositoryError('UNAVAILABLE', 'no storage')));
    render(<SharedViewBanner name="x" onCopy={onCopy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Make a copy to edit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The browser does not allow storing projects here.',
    );
    expect(screen.getByRole('button', { name: 'Make a copy to edit' })).toBeEnabled();
  });
});

describe('SharedLinkUnavailable', () => {
  it.each([
    ['CORRUPT', 'The link is damaged or incomplete.'],
    ['INVALID_DOCUMENT', 'The link is damaged or incomplete.'],
    ['EMPTY', 'The link has no room in it.'],
    ['TOO_LARGE', 'The link holds more than a room can'],
    ['NEWER_VERSION', 'newer version of RoomForge'],
    ['UNSUPPORTED', 'This browser cannot open RoomForge links.'],
  ] as const)('explains %s kindly, with a way into the app', (code, text) => {
    render(<SharedLinkUnavailable code={code} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    const link = screen.getByRole('link', { name: 'Go to your projects' });
    expect(link.getAttribute('href')).toMatch(/^\/projects\/?$/);
  });
});
