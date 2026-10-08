import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeLayoutStorage } from './layout-storage';
import { isTypingTarget } from './use-panel-hotkeys';
import { shellModeForWidth } from './use-shell-mode';

describe('shellModeForWidth', () => {
  it.each([
    [1920, 'full'],
    [1280, 'full'],
    [1024, 'full'],
    [1023, 'compact'],
    [768, 'compact'],
    [767, 'viewer'],
    [375, 'viewer'],
  ])('%i px → %s', (width, mode) => {
    expect(shellModeForWidth(width)).toBe(mode);
  });
});

describe('isTypingTarget', () => {
  it('is true for text fields and editable content only', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('safeLayoutStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads and writes localStorage', () => {
    safeLayoutStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(safeLayoutStorage.getItem('k')).toBe('v');
  });

  it('swallows storage errors', () => {
    const throwing = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing });
    expect(() => safeLayoutStorage.setItem('k', 'v')).not.toThrow();
    expect(safeLayoutStorage.getItem('k')).toBeNull();
  });
});
