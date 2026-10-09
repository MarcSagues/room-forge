import { RepositoryError } from '@roomforge/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Autosave, SaveState } from '@/persistence';
import { useProjectStatus } from '@/ui';
import { SaveNoticeBridge, SaveStatusBridge } from './save-bridge';

/** An autosave whose state the test sets by hand. */
function fakeAutosave(initial: Partial<SaveState> = {}) {
  let state: SaveState = {
    status: 'saved',
    lastSavedAt: null,
    error: null,
    failures: 0,
    ...initial,
  };
  const listeners = new Set<(state: SaveState) => void>();
  const retry = vi.fn(async () => {});
  const autosave = {
    state: () => state,
    subscribe(listener: (state: SaveState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retry,
  } as unknown as Autosave;
  return {
    autosave,
    retry,
    set(patch: Partial<SaveState>) {
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener(state);
    },
    listeners: () => listeners.size,
  };
}

function Status() {
  const { name, save } = useProjectStatus();
  return (
    <p>
      {name}: {save}
    </p>
  );
}

describe('SaveStatusBridge', () => {
  it('gives the top bar the name and the save state, and follows it', () => {
    const fake = fakeAutosave();
    render(
      <SaveStatusBridge autosave={fake.autosave} name="Office">
        <Status />
      </SaveStatusBridge>,
    );
    expect(screen.getByText('Office: saved')).toBeInTheDocument();
    act(() => fake.set({ status: 'saving' }));
    expect(screen.getByText('Office: saving')).toBeInTheDocument();
    act(() => fake.set({ status: 'error' }));
    expect(screen.getByText('Office: error')).toBeInTheDocument();
  });

  it('does not re-render what is inside it when the state changes (a live field would be reset)', () => {
    const fake = fakeAutosave();
    let renders = 0;
    function Panel() {
      renders += 1;
      return <input aria-label="field" defaultValue="100" />;
    }
    const panel = <Panel />;
    render(
      <SaveStatusBridge autosave={fake.autosave} name="Office">
        {panel}
      </SaveStatusBridge>,
    );
    const field = screen.getByLabelText('field') as HTMLInputElement;
    field.value = '42'; // written to the DOM, as a drag does
    act(() => fake.set({ status: 'dirty' }));
    act(() => fake.set({ status: 'saving' }));
    act(() => fake.set({ status: 'saved' }));
    expect(renders).toBe(1);
    expect(field.value).toBe('42');
  });

  it('is a saved project, quietly, while autosave is not running yet', () => {
    render(
      <SaveStatusBridge autosave={null} name="Office">
        <Status />
      </SaveStatusBridge>,
    );
    expect(screen.getByText('Office: saved')).toBeInTheDocument();
  });

  it('stops listening when it goes away', () => {
    const fake = fakeAutosave();
    const { unmount } = render(
      <SaveStatusBridge autosave={fake.autosave} name="Office">
        <Status />
      </SaveStatusBridge>,
    );
    expect(fake.listeners()).toBe(1);
    unmount();
    expect(fake.listeners()).toBe(0);
  });
});

describe('SaveNoticeBridge', () => {
  it('shows nothing while all is well', () => {
    const fake = fakeAutosave();
    const { container } = render(
      <SaveNoticeBridge autosave={fake.autosave} storage="indexeddb" onExport={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the failure, by its code, when saving fails, and hides it when it recovers', () => {
    const fake = fakeAutosave();
    render(<SaveNoticeBridge autosave={fake.autosave} storage="indexeddb" onExport={() => {}} />);
    act(() =>
      fake.set({
        status: 'error',
        error: new RepositoryError('QUOTA_EXCEEDED', 'full'),
        failures: 1,
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('no storage left');
    act(() => fake.set({ status: 'saved', error: null, failures: 0 }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries and exports through its buttons', async () => {
    const user = userEvent.setup();
    const fake = fakeAutosave({
      status: 'error',
      error: new RepositoryError('QUOTA_EXCEEDED', 'full'),
      failures: 1,
    });
    const onExport = vi.fn();
    render(<SaveNoticeBridge autosave={fake.autosave} storage="indexeddb" onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Export a copy' }));
    expect(fake.retry).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('tells, from the start, that nothing is stored when the browser stores nothing', () => {
    const fake = fakeAutosave();
    render(<SaveNoticeBridge autosave={fake.autosave} storage="memory" onExport={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('only kept in this tab');
  });
});
