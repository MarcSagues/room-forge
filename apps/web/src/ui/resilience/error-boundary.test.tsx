import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React reports a caught render error to the console; it is the expected noise here.
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('kaboom');
  return <p>all fine</p>;
}

describe('ErrorBoundary', () => {
  it('shows its children while nothing is wrong', () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Bomb armed={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all fine')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('shows the fallback with the error when a child throws, and reports it', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError} fallback={({ error }) => <p>failed: {error.message}</p>}>
        <Bomb armed />
      </ErrorBoundary>,
    );
    expect(screen.getByText('failed: kaboom')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]?.[1]).toHaveProperty('componentStack');
  });

  it('does not take the rest of the page down: siblings keep working', () => {
    render(
      <>
        <ErrorBoundary fallback={() => <p>left failed</p>}>
          <Bomb armed />
        </ErrorBoundary>
        <ErrorBoundary fallback={() => <p>right failed</p>}>
          <Bomb armed={false} />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByText('left failed')).toBeInTheDocument();
    expect(screen.getByText('all fine')).toBeInTheDocument();
  });

  it('tries again when the fallback asks to reset, and shows the children if they work now', async () => {
    function Harness() {
      const [armed, setArmed] = useState(true);
      return (
        <ErrorBoundary
          fallback={({ reset }) => (
            <button
              type="button"
              onClick={() => {
                setArmed(false);
                reset();
              }}
            >
              retry
            </button>
          )}
        >
          <Bomb armed={armed} />
        </ErrorBoundary>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByText('all fine')).toBeInTheDocument();
  });

  it('shows the fallback again if the retry fails too', async () => {
    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button type="button" onClick={reset}>
            retry
          </button>
        )}
      >
        <Bomb armed />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('tries again by itself when its reset keys change', () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={['a']} fallback={() => <p>fallback</p>}>
        <Bomb armed />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeInTheDocument();
    rerender(
      <ErrorBoundary resetKeys={['a']} fallback={() => <p>fallback</p>}>
        <Bomb armed={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeInTheDocument(); // same keys: stays
    rerender(
      <ErrorBoundary resetKeys={['b']} fallback={() => <p>fallback</p>}>
        <Bomb armed={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all fine')).toBeInTheDocument();
  });

  it('turns anything thrown into an Error for the fallback', () => {
    function Thrower(): never {
      throw 'a plain string';
    }
    render(
      <ErrorBoundary fallback={({ error }) => <p>{error.message}</p>}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('a plain string')).toBeInTheDocument();
  });
});
