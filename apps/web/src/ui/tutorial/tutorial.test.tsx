import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorialButton } from './tutorial-button';
import {
  markTutorialSeen,
  TUTORIAL_SEEN_KEY,
  TUTORIAL_STEPS,
  tutorialSeen,
} from './tutorial-steps';
import { placeCard, TutorialTour } from './tutorial-tour';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const card = () => screen.getByRole('dialog');

describe('tutorial storage', () => {
  it('is unseen until it is marked, and then stays seen', () => {
    expect(tutorialSeen()).toBe(false);
    markTutorialSeen();
    expect(tutorialSeen()).toBe(true);
    expect(localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe('1');
  });

  it('counts blocked storage as seen and never throws', () => {
    const throwing = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing });
    expect(tutorialSeen()).toBe(true);
    expect(() => markTutorialSeen()).not.toThrow();
  });
});

describe('TutorialTour', () => {
  it('walks every step, announcing progress and moving the focus to each heading', async () => {
    const onClose = vi.fn();
    render(<TutorialTour onClose={onClose} />);
    expect(card()).toHaveAccessibleName('Add furniture');
    expect(card()).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByText('Step 1 of 6')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('heading', { name: 'Add furniture' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    for (let step = 2; step <= TUTORIAL_STEPS.length; step += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText(`Step ${step} of 6`)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(card()).toHaveAccessibleName('Light it up');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape without letting the editor see the key', async () => {
    const onClose = vi.fn();
    const editorKeys = vi.fn();
    window.addEventListener('keydown', editorKeys);
    render(<TutorialTour onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', editorKeys);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editorKeys).not.toHaveBeenCalled();
  });

  it('highlights the target of the step, and only moves when motion is welcome', () => {
    const target = document.createElement('div');
    target.dataset.tour = 'catalog';
    target.getBoundingClientRect = () => new DOMRect(0, 48, 280, 700);
    document.body.append(target);
    render(<TutorialTour onClose={() => {}} />);
    const highlight = screen.getByTestId('tutorial-highlight');
    expect(highlight).toHaveStyle({ left: '0px', top: '48px', width: '280px' });
    expect(highlight.className).toContain('motion-safe:transition-all');
    expect(highlight.className).not.toMatch(/(^| )transition/);
    target.remove();
  });

  it('gives the focus back to what had it', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { unmount } = render(<TutorialTour onClose={() => {}} />);
    expect(before).not.toHaveFocus();
    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });
});

describe('placeCard', () => {
  const view = { width: 1400, height: 900 };
  it('goes beside a side panel, above the bottom bar, and centred without a target', () => {
    expect(placeCard({ left: 0, top: 48, width: 280, height: 800 }, view)).toMatchObject({
      left: 292,
    });
    expect(placeCard({ left: 1100, top: 48, width: 300, height: 800 }, view)).toMatchObject({
      left: 1100 - 320 - 12,
    });
    expect(placeCard({ left: 0, top: 856, width: 1400, height: 44 }, view)).toMatchObject({
      bottom: 900 - 856 + 12,
    });
    expect(placeCard(null, view)).toEqual({ left: 540, top: 335 });
  });
});

describe('TutorialButton', () => {
  it('opens the tour by itself on the first visit only, and remembers it was closed', async () => {
    const { unmount } = render(<TutorialButton />);
    expect(await screen.findByRole('dialog', { name: 'Add furniture' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip the tour' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tutorialSeen()).toBe(true);
    unmount();

    render(<TutorialButton />);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(await screen.findByRole('dialog', { name: 'Add furniture' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close the tour' }));
    expect(screen.getByRole('button', { name: 'Take the tour' })).toHaveFocus();
  });
});
