import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notify, toastsWanted } from '@/ui/components/toast';
import { Providers } from './providers';

describe('Providers', () => {
  it('mounts the toaster only with the first toast, and shows that toast', async () => {
    const { container } = render(
      <Providers>
        <p>page</p>
      </Providers>,
    );
    expect(toastsWanted()).toBe(false);
    // sonner's region is not there: the page did not load it.
    expect(container.ownerDocument.querySelector('[data-sonner-toaster]')).toBeNull();
    expect(screen.queryByRole('region', { name: /notifications/i })).toBeNull();

    notify((toast) => toast('Saved a copy'));

    expect(await screen.findByText('Saved a copy')).toBeInTheDocument();
    expect(toastsWanted()).toBe(true);
  });
});
