import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ImageExporter,
  ImageExportOptions,
  ImageExportResult,
  ImageExportStage,
} from './image-export';
import { ImageExportDialog } from './image-export-dialog';

function fakeExporter(overrides: Partial<ImageExporter> = {}) {
  const calls: ImageExportOptions[] = [];
  const exporter: ImageExporter = {
    fileName: () => 'office-2026-10-10.png',
    plan: ({ scale }) =>
      scale === 4
        ? { width: 2048, height: 1152, clamped: true }
        : { width: 640 * scale, height: 360 * scale, clamped: false },
    export: async (options, onStage) => {
      calls.push(options);
      onStage('encoding');
      return { ok: true, filename: 'office-2026-10-10.png' };
    },
    ...overrides,
  };
  return { exporter, calls };
}

function Harness({
  exporter,
  onSaved = () => {},
}: {
  exporter: ImageExporter;
  onSaved?: (message: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p>open: {String(open)}</p>
      <ImageExportDialog
        open={open}
        onOpenChange={setOpen}
        load={async () => exporter}
        onSaved={onSaved}
      />
    </>
  );
}

describe('ImageExportDialog', () => {
  it('offers sizes with their pixels, background and quality, and names the file', async () => {
    const { exporter } = fakeExporter();
    render(<Harness exporter={exporter} />);
    const dialog = await screen.findByRole('dialog', { name: 'Export image' });
    expect(await screen.findByRole('radio', { name: '2× · 1280 × 720 px' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '1× · 640 × 360 px' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'As in the viewport' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(dialog).toHaveTextContent('File: office-2026-10-10.png');
  });

  it('warns when the device cannot render the size asked for', async () => {
    const user = userEvent.setup();
    const { exporter } = fakeExporter();
    render(<Harness exporter={exporter} />);
    await user.click(await screen.findByRole('radio', { name: '4× · 2048 × 1152 px' }));
    expect(await screen.findByText(/at most 2048 × 1152 px/)).toBeInTheDocument();
  });

  it('exports with the chosen options and closes', async () => {
    const user = userEvent.setup();
    const { exporter, calls } = fakeExporter();
    const onSaved = vi.fn();
    render(<Harness exporter={exporter} onSaved={onSaved} />);
    await user.click(await screen.findByRole('radio', { name: 'Transparent' }));
    await user.click(screen.getByRole('radio', { name: 'Draft (fastest, no smoothing)' }));
    await user.click(screen.getByRole('radio', { name: /^1×/ }));
    await user.click(screen.getByRole('button', { name: 'Export PNG' }));
    await waitFor(() => expect(screen.getByText('open: false')).toBeInTheDocument());
    expect(calls).toEqual([{ scale: 1, quality: 'draft', background: { kind: 'transparent' } }]);
    expect(onSaved).toHaveBeenCalledWith('Image saved as office-2026-10-10.png.');
  });

  it('picking a colour chooses the solid background', async () => {
    const user = userEvent.setup();
    const { exporter, calls } = fakeExporter();
    render(<Harness exporter={exporter} />);
    const picker = await screen.findByLabelText('Background colour');
    // A colour input cannot be typed into: set it as the picker would.
    picker.focus();
    fireEvent.change(picker, { target: { value: '#112233' } });
    expect(screen.getByRole('radio', { name: 'Solid colour' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Export PNG' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.background).toEqual({ kind: 'color', color: '#112233' });
  });

  it('shows progress, cannot be closed while busy, and explains a failure', async () => {
    const user = userEvent.setup();
    let finish: (result: ImageExportResult) => void = () => {};
    let stage: (stage: ImageExportStage) => void = () => {};
    const { exporter } = fakeExporter({
      export: (_options, onStage) => {
        stage = onStage;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    render(<Harness exporter={exporter} />);
    await user.click(await screen.findByRole('button', { name: 'Export PNG' }));
    expect(screen.getByRole('status')).toHaveTextContent('Rendering the image…');
    expect(screen.getByRole('progressbar', { name: 'Export progress' })).toHaveAttribute(
      'value',
      '1',
    );
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByText('open: true')).toBeInTheDocument();

    act(() => stage('encoding'));
    expect(screen.getByRole('status')).toHaveTextContent('Saving the PNG…');
    act(() => finish({ ok: false, reason: 'too-large' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This device cannot make an image that large.',
    );
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    const { exporter, calls } = fakeExporter();
    render(<Harness exporter={exporter} />);
    const two = await screen.findByRole('radio', { name: /^2×/ });
    two.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /^4×/ })).toBeChecked();
    await user.keyboard('{Escape}');
    expect(screen.getByText('open: false')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('cannot export without a view, and asks again when it is reopened', async () => {
    const user = userEvent.setup();
    const empty = fakeExporter({ plan: () => null }).exporter;
    const ready = fakeExporter().exporter;
    const load = vi.fn().mockResolvedValueOnce(empty).mockResolvedValue(ready);
    function Reopen() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            reopen
          </button>
          <ImageExportDialog open={open} onOpenChange={setOpen} load={load} onSaved={() => {}} />
        </>
      );
    }
    render(<Reopen />);
    await screen.findByRole('radio', { name: '2× · – × – px' });
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'reopen' }));
    expect(await screen.findByRole('radio', { name: '2× · 1280 × 720 px' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
