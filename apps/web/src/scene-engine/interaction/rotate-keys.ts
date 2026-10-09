import {
  type CatalogProvider,
  type EditorSession,
  moveObjects,
  type ObjectId,
  rotateObjects,
  type Vec3,
} from '@roomforge/core';
import { objectSize } from '../objects/placeholder-resources';
import { widgetOwnsKeys } from './key-owner';
import { FINE_STEP_DEG, type RotationResult, rotationByStep, solveRotation } from './rotation';
import type { TransientStore } from './transient-store';

export interface RotateKeysDeps {
  session: EditorSession;
  catalog: CatalogProvider;
  transient: TransientStore;
  /** Where keys are listened to (the window). */
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * `R` turns the selected floor objects one step (15°), `Shift+R` the other way and `Alt` uses the
 * fine step (1°). Each object turns around its own centre; one that would cross a wall is pushed
 * inwards, one that cannot fit turned stays as it is. All in one command, so a run of presses is
 * a single undo entry (the history coalesces them). While an object is being dragged the drag
 * turns it instead (see `attachPicking`). Returns the cleanup that removes the listener.
 */
export function attachRotateKeys(deps: RotateKeysDeps): () => void {
  const keyTarget = deps.keyTarget ?? (typeof window === 'undefined' ? undefined : window);
  const solved: RotationResult = { position: [0, 0], rotationY: 0, valid: true };

  const onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey) return;
    if (widgetOwnsKeys(event.target) || deps.transient.drag()) return;
    const { selection, document } = deps.session.getState();
    if (selection.length === 0) return;
    event.preventDefault();
    if (event.repeat) return; // a held key is one press, not a spin

    const stepDeg = event.altKey ? FINE_STEP_DEG : deps.session.getState().snap.angleStepDeg;
    const direction = event.shiftKey ? -1 : 1;
    const turns: { id: ObjectId; rotationY: number; position: Vec3 }[] = [];
    let pushed = false;
    for (const id of selection) {
      const object = document.objects[id as ObjectId];
      const room = object ? document.rooms[object.roomId] : undefined;
      if (!object || !room || object.parentId !== null || object.locked || object.hidden) continue;
      const size = objectSize(deps.catalog, object.catalogId);
      const [sx, , sz] = object.transform.scale ?? [1, 1, 1];
      const [x, y, z] = object.transform.position;
      solveRotation(
        {
          room: { width: room.shape.width, depth: room.shape.depth },
          size: { w: size.w * sx, d: size.d * sz },
          position: [x, z],
          rotationY: rotationByStep(object.transform.rotationY, direction, stepDeg),
        },
        solved,
      );
      if (!solved.valid) continue;
      if (solved.position[0] !== x || solved.position[1] !== z) pushed = true;
      turns.push({
        id: object.id,
        rotationY: solved.rotationY,
        position: [solved.position[0], y, solved.position[1]],
      });
    }
    if (turns.length === 0) return;
    deps.session.execute(
      pushed
        ? moveObjects(turns)
        : rotateObjects(turns.map(({ id, rotationY }) => ({ id, rotationY }))),
    );
  };

  keyTarget?.addEventListener('keydown', onKey as EventListener);
  return () => keyTarget?.removeEventListener('keydown', onKey as EventListener);
}
