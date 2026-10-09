import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShell } from './editor-shell';

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

beforeEach(() => {
  localStorage.clear();
  setViewportWidth(1280);
  // React reports a caught render error to the console; it is the expected noise here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function Bomb({ message = 'panel exploded' }: { message?: string }): never {
  throw new Error(message);
}

describe('EditorShell: one panel failing does not take the editor down', () => {
  it('shows a fallback in the properties panel and keeps everything else working', () => {
    const onPanelError = vi.fn();
    render(
      <EditorShell
        properties={<Bomb />}
        viewport={<p>the viewport</p>}
        onPanelError={onPanelError}
      />,
    );
    const panel = screen.getByRole('complementary', { name: 'Properties panel' });
    expect(within(panel).getByRole('alert')).toHaveTextContent('Properties stopped working');
    // The top bar, the catalog panel, the viewport and the bottom bar are all still there.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Catalog panel' })).toBeInTheDocument();
    expect(screen.getByText('the viewport')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(onPanelError).toHaveBeenCalledOnce();
    expect(onPanelError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onPanelError.mock.calls[0]?.[1]).toBe('Properties');
  });

  it('shows a fallback in the viewport when the canvas fails, with the panels still usable', async () => {
    const onPanelError = vi.fn();
    render(
      <EditorShell viewport={<Bomb message="webgl exploded" />} onPanelError={onPanelError} />,
    );
    const viewport = screen.getByRole('main', { name: 'Viewport' });
    expect(within(viewport).getByRole('alert')).toHaveTextContent('Viewport stopped working');
    expect(onPanelError.mock.calls[0]?.[1]).toBe('Viewport');
    // Panels still respond.
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the catalog panel' }));
    expect(
      screen.getByRole('complementary', { name: 'Catalog panel', hidden: true }),
    ).toHaveAttribute('inert');
  });

  it('tries the panel again from its fallback, and shows it if it works now', async () => {
    function Harness() {
      const [armed, setArmed] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setArmed(false)}>
            fix it
          </button>
          <EditorShell properties={armed ? <Bomb /> : <p>properties are back</p>} />
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'fix it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('properties are back')).toBeInTheDocument();
  });

  it('works the same in the drawer layout', async () => {
    setViewportWidth(900);
    render(<EditorShell properties={<Bomb />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Expand the properties panel' }));
    expect(
      within(screen.getByRole('complementary', { name: 'Properties panel' })).getByRole('alert'),
    ).toHaveTextContent('Properties stopped working');
  });

  it('renders normally when nothing fails', () => {
    render(<EditorShell properties={<p>fine</p>} viewport={<p>canvas</p>} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
