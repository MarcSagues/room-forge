import { CameraControlsImpl } from '@react-three/drei/core/CameraControls';
import { afterEach, describe, expect, it } from 'vitest';
import { bindShiftToPan } from './shift-pan';

const { ACTION } = CameraControlsImpl;

describe('bindShiftToPan', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => {
    unbind?.();
    unbind = undefined;
  });

  const setup = () => {
    const controls = { mouseButtons: { right: ACTION.ROTATE } } as {
      mouseButtons: { right: typeof ACTION.ROTATE | typeof ACTION.TRUCK };
    };
    unbind = bindShiftToPan(controls, window);
    return controls;
  };
  const key = (type: 'keydown' | 'keyup', name: string) =>
    window.dispatchEvent(new KeyboardEvent(type, { key: name }));

  it('pans with the right button while Shift is held and orbits again after', () => {
    const controls = setup();
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
    key('keydown', 'Shift');
    expect(controls.mouseButtons.right).toBe(ACTION.TRUCK);
    key('keyup', 'Shift');
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
  });

  it('ignores other keys', () => {
    const controls = setup();
    key('keydown', 'a');
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
  });

  it('goes back to orbiting when the window loses focus with Shift down', () => {
    const controls = setup();
    key('keydown', 'Shift');
    window.dispatchEvent(new Event('blur'));
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
  });

  it('restores orbiting and stops listening on cleanup', () => {
    const controls = setup();
    key('keydown', 'Shift');
    unbind?.();
    unbind = undefined;
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
    key('keydown', 'Shift');
    expect(controls.mouseButtons.right).toBe(ACTION.ROTATE);
  });
});
