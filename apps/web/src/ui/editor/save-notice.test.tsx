import type { RepositoryErrorCode } from '@roomforge/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaveNotice } from './save-notice';

describe('SaveNotice: a write failed', () => {
  it('says the changes are not saved, in a persistent alert, with what to do', () => {
    render(
      <SaveNotice
        problem={{ kind: 'failed', code: 'QUOTA_EXCEEDED' }}
        onRetry={() => {}}
        onExport={() => {}}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Your latest changes are not saved.');
    expect(alert).toHaveTextContent('The browser has no storage left');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export a copy' })).toBeInTheDocument();
  });

  it.each([
    ['QUOTA_EXCEEDED', 'no storage left'],
    ['UNAVAILABLE', 'not letting RoomForge store projects'],
    ['BLOCKED', 'older version of RoomForge'],
    ['VERSION_ERROR', 'newer version of RoomForge'],
    ['FAILED', 'RoomForge keeps trying'],
    ['NOT_FOUND', 'RoomForge keeps trying'],
    ['INVALID_NAME', 'RoomForge keeps trying'],
  ] as Array<[RepositoryErrorCode, string]>)('a %s failure says what it is', (code, text) => {
    render(<SaveNotice problem={{ kind: 'failed', code }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('calls the handlers', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onExport = vi.fn();
    render(
      <SaveNotice
        problem={{ kind: 'failed', code: 'QUOTA_EXCEEDED' }}
        onRetry={onRetry}
        onExport={onExport}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Export a copy' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('shows only the buttons it can act on', () => {
    render(<SaveNotice problem={{ kind: 'failed', code: 'FAILED' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SaveNotice: the browser stores nothing', () => {
  it('tells, up front, that changes live only in this tab, and offers a copy', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<SaveNotice problem={{ kind: 'memory' }} onExport={onExport} onRetry={() => {}} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Your changes are only kept in this tab.');
    expect(notice).toHaveTextContent('private mode');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Export a copy' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('SaveNotice: nothing wrong', () => {
  it('renders nothing', () => {
    const { container } = render(<SaveNotice problem={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
