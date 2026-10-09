import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FailureScreen, PanelFallback } from './failure-screen';
import { REPORT_ISSUES_URL } from './report';

const error = Object.assign(new TypeError('cannot read properties of undefined'), {
  stack: 'TypeError: cannot read properties of undefined\n    at Thing (a.js:1:1)',
});

describe('FailureScreen', () => {
  it('says what happened and offers to try again', async () => {
    const onRetry = vi.fn();
    render(<FailureScreen error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers to export a copy and to download the log only when it can', async () => {
    const { rerender } = render(<FailureScreen error={error} onRetry={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Export a copy' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download the error log' }),
    ).not.toBeInTheDocument();

    const onExport = vi.fn();
    const onDownloadLog = vi.fn();
    rerender(
      <FailureScreen
        error={error}
        onRetry={() => {}}
        onExport={onExport}
        onDownloadLog={onDownloadLog}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export a copy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download the error log' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onDownloadLog).toHaveBeenCalledOnce();
  });

  it('links to a prefilled issue that carries the error and no project', () => {
    render(
      <FailureScreen error={error} onRetry={() => {}} where="the editor" appVersion="0.1.0" />,
    );
    const link = screen.getByRole('link', { name: 'Report a problem' });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith(REPORT_ISSUES_URL)).toBe(true);
    expect(decodeURIComponent(href.replace(/\+/g, ' '))).toContain(
      'cannot read properties of undefined',
    );
    expect(href).toContain('0.1.0');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
  });

  it('keeps the technical details one click away', async () => {
    render(<FailureScreen error={error} onRetry={() => {}} />);
    const details = screen.getByText('Technical details');
    await userEvent.click(details);
    expect(screen.getByText(/at Thing \(a\.js:1:1\)/)).toBeVisible();
  });
});

describe('PanelFallback', () => {
  it('names the panel, says the rest still works, and can retry and report', async () => {
    const onRetry = vi.fn();
    render(<PanelFallback panel="Properties" error={error} onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Properties stopped working')).toBeInTheDocument();
    expect(within(alert).getByText('The rest of the editor still works.')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(
      within(alert).getByRole('link', { name: 'Report a problem' }).getAttribute('href'),
    ).toContain('Properties');
  });
});
