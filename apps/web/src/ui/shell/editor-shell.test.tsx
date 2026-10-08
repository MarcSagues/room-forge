import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShell } from './editor-shell';
import { SHELL_LAYOUT_ID } from './layout-storage';

/** Pretends the window is `width` px wide for every `(min-width: N)` media query. */
function setViewportWidth(width: number) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

const leftPanel = () => screen.getByRole('complementary', { name: 'Catalog panel', hidden: true });
const rightPanel = () =>
  screen.getByRole('complementary', { name: 'Properties panel', hidden: true });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
}

describe('EditorShell — docked (≥ 1024 px)', () => {
  beforeEach(() => setViewportWidth(1280));

  it('renders the five regions with both panels open', () => {
    render(<EditorShell />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Viewport' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(leftPanel()).not.toHaveAttribute('inert');
    expect(rightPanel()).not.toHaveAttribute('inert');
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('collapses and expands the catalog from the top bar', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getByRole('button', { name: 'Collapse the catalog panel' }));
    expect(leftPanel()).toHaveAttribute('inert');
    const expand = screen.getByRole('button', { name: 'Expand the catalog panel' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    await user.click(expand);
    expect(leftPanel()).not.toHaveAttribute('inert');
  });

  it('toggles the panels with [ and ] but not while typing', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.keyboard('[[');
    expect(leftPanel()).toHaveAttribute('inert');
    await user.keyboard(']');
    expect(rightPanel()).toHaveAttribute('inert');
    await user.keyboard('[[');
    expect(leftPanel()).not.toHaveAttribute('inert');

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await user.keyboard(']');
    expect(rightPanel()).toHaveAttribute('inert');
    input.remove();
  });

  it('keeps collapsed panels out of the tab order', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.keyboard('[[');
    await user.keyboard(']');
    // Tab through everything reachable and make sure focus never lands inside a collapsed panel.
    for (let i = 0; i < 15; i += 1) {
      await user.tab();
      expect(leftPanel()).not.toContainElement(document.activeElement as HTMLElement);
      expect(rightPanel()).not.toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('restores the saved layout from localStorage', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    render(<EditorShell />);
    expect(storage.getItem).toHaveBeenCalledWith(expect.stringContaining(SHELL_LAYOUT_ID));
  });

  it('still works when localStorage throws', async () => {
    const throwing = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: vi.fn(throwing), setItem: vi.fn(throwing) });
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getByRole('button', { name: 'Collapse the catalog panel' }));
    expect(leftPanel()).toHaveAttribute('inert');
  });
});

describe('EditorShell — drawers (768–1023 px)', () => {
  beforeEach(() => setViewportWidth(900));

  it('starts with both drawers closed and not focusable', () => {
    render(<EditorShell />);
    expect(leftPanel()).toHaveAttribute('inert');
    expect(rightPanel()).toHaveAttribute('inert');
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('opens one drawer at a time and closes with Escape or the close button', async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getByRole('button', { name: 'Expand the catalog panel' }));
    expect(leftPanel()).not.toHaveAttribute('inert');

    await user.keyboard(']');
    expect(leftPanel()).toHaveAttribute('inert');
    expect(rightPanel()).not.toHaveAttribute('inert');

    await user.click(
      within(rightPanel().parentElement as HTMLElement).getByRole('button', {
        name: 'Close panel',
      }),
    );
    expect(rightPanel()).toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Expand the catalog panel' }));
    act(() => screen.getByRole('button', { name: 'Close panel' }).focus());
    await user.keyboard('{Escape}');
    expect(leftPanel()).toHaveAttribute('inert');
  });
});

describe('EditorShell — viewer (< 768 px)', () => {
  beforeEach(() => setViewportWidth(500));

  it('shows only the viewport and the "open on a computer" banner', () => {
    render(<EditorShell />);
    expect(screen.getByRole('status')).toHaveTextContent('Open RoomForge on a computer to edit.');
    expect(screen.getByRole('main', { name: 'Viewport' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
