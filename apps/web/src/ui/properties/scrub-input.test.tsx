import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type Commit, type LiveValue, ScrubInput } from './scrub-input';

/** A field that behaves like the panel: a rejected commit leaves the value as it was. */
function Harness(props: {
  initial?: number;
  reject?: (value: number) => string | null;
  onCommit?: (value: number) => void;
  live?: LiveValue;
  readOnly?: boolean;
  step?: number;
}) {
  const [value, setValue] = useState(props.initial ?? 100);
  const onCommit = (next: number): Commit => {
    props.onCommit?.(next);
    const message = props.reject?.(next) ?? null;
    if (message) return { ok: false, message };
    setValue(next);
    return { ok: true };
  };
  return (
    <ScrubInput
      id="x"
      label="X"
      unit="cm"
      value={value}
      step={props.step ?? 1}
      onCommit={onCommit}
      {...(props.live ? { live: props.live } : {})}
      {...(props.readOnly ? { readOnly: true } : {})}
    />
  );
}

const field = () => screen.getByRole('spinbutton', { name: 'X' });
const label = () => screen.getByText('X');

describe('ScrubInput: typing', () => {
  it('shows the value in its unit', () => {
    render(<Harness initial={142.5} />);
    expect(field()).toHaveValue('142.5');
    expect(screen.getByText('cm')).toBeInTheDocument();
  });

  it('Enter commits what was typed; a comma works as the decimal separator', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await userEvent.clear(field());
    await userEvent.type(field(), '12,5{Enter}');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(12.5);
    expect(field()).toHaveValue('12.5');
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('Escape puts the old value back without committing', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await userEvent.type(field(), '9');
    await userEvent.keyboard('{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('100');
  });

  it('leaving the field commits a change, and does nothing when nothing changed', async () => {
    const onCommit = vi.fn();
    render(
      <>
        <Harness onCommit={onCommit} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(field());
    await userEvent.click(screen.getByText('elsewhere'));
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.clear(field());
    await userEvent.type(field(), '55');
    await userEvent.click(screen.getByText('elsewhere'));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(55);
  });

  it('flags text that is not a number, accessibly, and does not commit it', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await userEvent.clear(field());
    await userEvent.type(field(), 'abc{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number');
    expect(field()).toHaveAccessibleDescription('Enter a number');
    expect(field()).toHaveValue('abc'); // what was typed stays, so it can be fixed
  });

  it('shows why the document refused a value and keeps what was typed', async () => {
    render(<Harness reject={(value) => (value > 300 ? 'Outside the room' : null)} />);
    await userEvent.clear(field());
    await userEvent.type(field(), '900{Enter}');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Outside the room');
    expect(field()).toHaveValue('900');
    // Fixing it clears the error.
    await userEvent.clear(field());
    await userEvent.type(field(), '200{Enter}');
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Escape clears an error and shows the real value again', async () => {
    render(<Harness reject={() => 'No'} />);
    await userEvent.type(field(), '5{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field()).toHaveValue('100');
  });
});

describe('ScrubInput: arrow keys', () => {
  it('ArrowUp and ArrowDown change the value by one step, Shift by ten', async () => {
    const onCommit = vi.fn();
    render(<Harness step={2} onCommit={onCommit} />);
    await userEvent.click(field());
    await userEvent.keyboard('{ArrowUp}');
    expect(onCommit).toHaveBeenLastCalledWith(102);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(onCommit).toHaveBeenLastCalledWith(98);
    await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(onCommit).toHaveBeenLastCalledWith(118);
    expect(field()).toHaveValue('118');
  });
});

describe('ScrubInput: dragging the label', () => {
  const press = (x = 100) =>
    fireEvent.pointerDown(label(), { button: 0, clientX: x, clientY: 5, pointerId: 1 });
  const move = (x: number, init: PointerEventInit = {}) =>
    fireEvent.pointerMove(label(), { clientX: x, clientY: 5, pointerId: 1, ...init });
  const release = (x: number) =>
    fireEvent.pointerUp(label(), { button: 0, clientX: x, clientY: 5, pointerId: 1 });

  it('changes the value as the pointer moves sideways, one step per few pixels', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    press(100);
    move(112); // 12 px: 3 steps
    expect(onCommit).toHaveBeenLastCalledWith(103);
    move(80); // 20 px to the left: 5 steps down
    expect(onCommit).toHaveBeenLastCalledWith(95);
    release(80);
    expect(field()).toHaveValue('95');
  });

  it('does not commit while the pointer has not moved a whole step', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    press(100);
    move(102);
    expect(onCommit).not.toHaveBeenCalled();
    move(104);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(101);
    move(104); // no change
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Shift scrubs ten times faster', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    press(100);
    move(108, { shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(120);
  });

  it('Escape puts the starting value back', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    press(100);
    move(140);
    expect(onCommit).toHaveBeenLastCalledWith(110);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCommit).toHaveBeenLastCalledWith(100);
    move(200); // the gesture is over
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('ignores other buttons and a read-only field', () => {
    const onCommit = vi.fn();
    const { unmount } = render(<Harness onCommit={onCommit} />);
    fireEvent.pointerDown(label(), { button: 2, clientX: 100, pointerId: 1 });
    move(140);
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
    render(<Harness onCommit={onCommit} readOnly />);
    press(100);
    move(140);
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute('readonly');
  });

  it('a refused value leaves the field as it was and flags it', () => {
    render(<Harness reject={(value) => (value > 101 ? 'Outside the room' : null)} />);
    press(100);
    move(120);
    expect(screen.getByRole('alert')).toHaveTextContent('Outside the room');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ScrubInput: following a drag in the scene', () => {
  function liveSource() {
    let current: number | null = null;
    const listeners = new Set<() => void>();
    return {
      source: {
        read: () => current,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      } satisfies LiveValue,
      set(next: number | null) {
        current = next;
        for (const listener of listeners) listener();
      },
      listenerCount: () => listeners.size,
    };
  }

  it('shows the live value without re-rendering, and the real one when the drag ends', () => {
    const live = liveSource();
    let renders = 0;
    function Counted() {
      renders += 1;
      return <Harness initial={100} live={live.source} />;
    }
    render(<Counted />);
    const rendersBefore = renders;
    act(() => live.set(123.4));
    expect(field()).toHaveValue('123.4');
    act(() => live.set(150));
    expect(field()).toHaveValue('150');
    expect(renders).toBe(rendersBefore); // React did nothing
    act(() => live.set(null));
    expect(field()).toHaveValue('100');
  });

  it('does not overwrite what the person is typing', async () => {
    const live = liveSource();
    render(<Harness live={live.source} />);
    await userEvent.click(field());
    act(() => live.set(300));
    expect(field()).toHaveValue('100');
  });

  it('stops listening when it goes away', () => {
    const live = liveSource();
    const { unmount } = render(<Harness live={live.source} />);
    expect(live.listenerCount()).toBe(1);
    unmount();
    expect(live.listenerCount()).toBe(0);
  });
});

describe('ScrubInput: outside changes', () => {
  it('follows the value when it changes elsewhere (undo, another field)', () => {
    function Outside() {
      const [value, setValue] = useState(10);
      return (
        <>
          <button type="button" onClick={() => setValue(77)}>
            undo
          </button>
          <ScrubInput
            id="x"
            label="X"
            unit="cm"
            value={value}
            step={1}
            onCommit={() => ({ ok: true })}
          />
        </>
      );
    }
    render(<Outside />);
    expect(field()).toHaveValue('10');
    fireEvent.click(screen.getByText('undo'));
    expect(field()).toHaveValue('77');
  });
});
