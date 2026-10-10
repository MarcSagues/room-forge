import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatBytes, SettingsButton, type StorageInfo } from './settings-dialog';

const GB = 1024 ** 3;

async function open(info: StorageInfo) {
  const readStorage = vi.fn(async () => info);
  render(<SettingsButton readStorage={readStorage} />);
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return { dialog: await screen.findByRole('dialog', { name: 'Settings' }), readStorage };
}

describe('formatBytes', () => {
  it.each([
    [0, '0 byte'],
    [2048, '2 kB'],
    [5.5 * 1024 ** 2, '5.5 MB'],
    [2 * GB, '2 GB'],
  ])('%d → %s', (value, text) => {
    expect(formatBytes(value)).toBe(text);
  });
});

describe('SettingsButton', () => {
  it('shows the estimated usage and quota, and that the storage is protected', async () => {
    const { dialog, readStorage } = await open({
      usage: 3 * 1024 ** 2,
      quota: 2 * GB,
      persisted: true,
    });
    expect(await screen.findByText('3 MB used of 2 GB available to RoomForge')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Protected');
    expect(screen.getByRole('meter', { name: 'Storage' })).toBeInTheDocument();
    expect(readStorage).toHaveBeenCalledTimes(1);
  });

  it('says when the storage is not protected, or when the browser does not tell', async () => {
    const { dialog } = await open({ usage: null, quota: null, persisted: false });
    expect(
      await screen.findByText('This browser does not say how much space RoomForge uses.'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Not protected');
  });
});
