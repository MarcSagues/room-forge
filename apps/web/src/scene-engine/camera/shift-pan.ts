import { CameraControlsImpl } from '@react-three/drei/core/CameraControls';

type OrbitButtons = { mouseButtons: Pick<CameraControlsImpl['mouseButtons'], 'right'> };

/**
 * Design system §4: orbit with the right button, pan with the middle one or with Shift held.
 * camera-controls has no modifier support, so the right button swaps action while Shift is down.
 */
export function bindShiftToPan(controls: OrbitButtons, target: Window): () => void {
  const { ACTION } = CameraControlsImpl;
  const use = (panning: boolean) => {
    controls.mouseButtons.right = panning ? ACTION.TRUCK : ACTION.ROTATE;
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Shift') use(event.type === 'keydown');
  };
  const onBlur = () => use(false);

  target.addEventListener('keydown', onKey);
  target.addEventListener('keyup', onKey);
  // A key released while the window had no focus never reports its keyup.
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('keyup', onKey);
    target.removeEventListener('blur', onBlur);
    use(false);
  };
}
