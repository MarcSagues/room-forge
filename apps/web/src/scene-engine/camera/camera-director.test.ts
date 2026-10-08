import { CameraControlsImpl } from '@react-three/drei/core/CameraControls';
import { createEditorSession, createEmptyDocument, createRoom, resizeRoom } from '@roomforge/core';
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  type CameraSnapshot,
  createCameraDirector,
} from './camera-director';
import { boundsDiagonal, fitTop, MAX_POLAR_ANGLE, sceneBounds } from './framing';
import { TRANSITION_MS } from './transition';

const VIEWPORT = { width: 1280, height: 720 };

beforeAll(() => {
  // What drei's <CameraControls> does when it mounts.
  CameraControlsImpl.install({
    THREE: {
      Box3,
      MathUtils: { clamp: MathUtils.clamp },
      Matrix4,
      Quaternion,
      Raycaster,
      Sphere,
      Spherical,
      Vector2,
      Vector3,
      Vector4,
    },
  });
});

function setup(options: { reducedMotion?: boolean; width?: number; depth?: number } = {}) {
  const { reducedMotion = false, width = 4, depth = 4.5 } = options;
  const session = createEditorSession({
    initialDocument: createEmptyDocument(),
    catalog: { getItem: () => undefined },
  });
  session.execute(createRoom({ name: 'Room', width, depth, height: 2.6 }));

  const perspective = new PerspectiveCamera(
    CAMERA_FOV,
    VIEWPORT.width / VIEWPORT.height,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  const orthographic = new OrthographicCamera(
    -VIEWPORT.width / 2,
    VIEWPORT.width / 2,
    VIEWPORT.height / 2,
    -VIEWPORT.height / 2,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  const controls = {
    perspective: new CameraControlsImpl(perspective),
    orthographic: new CameraControlsImpl(orthographic),
  };
  const rendering = { camera: perspective as PerspectiveCamera | OrthographicCamera };
  const invalidate = vi.fn();
  let clock = 1000;
  let reduced = reducedMotion;
  const director = createCameraDirector({
    session,
    cameras: { perspective, orthographic },
    controls,
    setActiveCamera: (camera) => {
      rendering.camera = camera;
    },
    invalidate,
    size: () => VIEWPORT,
    now: () => clock,
    reducedMotion: () => reduced,
  });
  /** Runs frames every 16 ms for `ms` milliseconds, like the render loop would. */
  const run = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      clock += Math.min(16, ms - elapsed);
      director.step();
    }
  };
  const finish = () => run(TRANSITION_MS + 50);
  return {
    session,
    director,
    controls,
    rendering,
    perspective,
    orthographic,
    invalidate,
    run,
    finish,
    setReducedMotion: (value: boolean) => {
      reduced = value;
    },
  };
}

const near = (a: readonly number[], b: readonly number[], digits = 5) => {
  for (let axis = 0; axis < 3; axis += 1) {
    expect(a[axis]).toBeCloseTo(b[axis] as number, digits);
  }
};

describe('initial framing', () => {
  it('starts in perspective, looking at the middle of the room from above', () => {
    const { director, rendering, perspective } = setup();
    const snapshot = director.snapshot();
    expect(snapshot.view).toBe('perspective');
    expect(rendering.camera).toBe(perspective);
    near(snapshot.target, [0, 1.3, 0]);
    expect(snapshot.position[1]).toBeGreaterThan(snapshot.target[1]);
    expect(snapshot.transitioning).toBe(false);
  });

  it('keeps the room fully inside the view cone', () => {
    const { director, session } = setup({ width: 12, depth: 12 });
    const bounds = sceneBounds(Object.values(session.getState().document.rooms));
    const { distance } = director.snapshot();
    const halfVertical = (CAMERA_FOV * Math.PI) / 360;
    expect(Math.asin(boundsDiagonal(bounds) / 2 / distance)).toBeLessThan(halfVertical);
  });
});

describe('view switching', () => {
  it('animates to the plan view within 600 ms and swaps to the orthographic camera at the end', () => {
    const { director, session, rendering, orthographic, perspective, run, finish } = setup();

    session.setView('top');
    expect(director.snapshot().transitioning).toBe(true);
    expect(rendering.camera).toBe(perspective);

    run(TRANSITION_MS / 2);
    expect(director.snapshot().transitioning).toBe(true);

    run(TRANSITION_MS / 2 + 16);
    const snapshot = director.snapshot();
    expect(snapshot.transitioning).toBe(false);
    expect(TRANSITION_MS).toBeLessThanOrEqual(600);
    expect(snapshot.view).toBe('top');
    expect(rendering.camera).toBe(orthographic);

    const bounds = sceneBounds(Object.values(session.getState().document.rooms));
    const fit = fitTop(bounds, VIEWPORT);
    expect(snapshot.zoom).toBeCloseTo(fit.zoom, 6);
    near(snapshot.target, fit.pose.target, 6);
    finish();
  });

  it('looks straight down in the plan view', () => {
    const { director, session, finish } = setup();
    session.setView('top');
    finish();
    const { position, target } = director.snapshot();
    expect(Math.hypot(position[0] - target[0], position[2] - target[2])).toBeLessThan(0.01);
    expect(position[1]).toBeGreaterThan(target[1] + 5);
  });

  it('returns to the exact perspective framing the user had', () => {
    const { director, session, rendering, perspective, finish } = setup();
    director.orbit(0.6, -0.25);
    director.dolly(1);
    const before = director.snapshot();

    session.setView('top');
    finish();
    session.setView('perspective');
    finish();

    const after = director.snapshot();
    expect(after.view).toBe('perspective');
    expect(rendering.camera).toBe(perspective);
    near(after.position, before.position, 4);
    near(after.target, before.target, 4);
  });

  it('cuts to the perspective camera at once when leaving the plan view, then tilts', () => {
    const { director, session, rendering, perspective, finish } = setup();
    session.setView('top');
    finish();

    session.setView('perspective');

    expect(rendering.camera).toBe(perspective);
    const { position, target, transitioning } = director.snapshot();
    expect(transitioning).toBe(true);
    // Still hovering straight above: the swap must not make the picture jump.
    expect(Math.hypot(position[0] - target[0], position[2] - target[2])).toBeLessThan(0.01);
    finish();
  });

  it('turns the user input off while a switch runs and on afterwards for the active camera only', () => {
    const { session, controls, finish } = setup();
    expect(controls.perspective.enabled).toBe(true);
    expect(controls.orthographic.enabled).toBe(false);

    session.setView('top');
    expect(controls.perspective.enabled).toBe(false);
    expect(controls.orthographic.enabled).toBe(false);

    finish();
    expect(controls.perspective.enabled).toBe(false);
    expect(controls.orthographic.enabled).toBe(true);
  });

  it('survives being interrupted by the opposite switch', () => {
    const { director, session, rendering, perspective, run, finish } = setup();
    const before = director.snapshot();

    session.setView('top');
    run(150);
    session.setView('perspective');
    finish();

    const after = director.snapshot();
    expect(after.view).toBe('perspective');
    expect(rendering.camera).toBe(perspective);
    near(after.position, before.position, 4);
  });

  it('cuts without animating under reduced motion', () => {
    const { director, session, rendering, orthographic, invalidate } = setup({
      reducedMotion: true,
    });
    invalidate.mockClear();

    session.setView('top');

    expect(director.snapshot().transitioning).toBe(false);
    expect(rendering.camera).toBe(orthographic);
    expect(director.snapshot().view).toBe('top');
    expect(invalidate).toHaveBeenCalled();
  });

  it('honours a session that already starts in the plan view', () => {
    const session = createEditorSession({
      initialDocument: createEmptyDocument(),
      catalog: { getItem: () => undefined },
    });
    session.execute(createRoom({ name: 'Room', width: 3, depth: 3, height: 2.5 }));
    session.setView('top');
    const perspective = new PerspectiveCamera(CAMERA_FOV, 16 / 9, CAMERA_NEAR, CAMERA_FAR);
    const orthographic = new OrthographicCamera(-640, 640, 360, -360, CAMERA_NEAR, CAMERA_FAR);
    let rendering: PerspectiveCamera | OrthographicCamera = perspective;
    const director = createCameraDirector({
      session,
      cameras: { perspective, orthographic },
      controls: {
        perspective: new CameraControlsImpl(perspective),
        orthographic: new CameraControlsImpl(orthographic),
      },
      setActiveCamera: (camera) => {
        rendering = camera;
      },
      invalidate: () => {},
      size: () => VIEWPORT,
      now: () => 0,
      reducedMotion: () => false,
    });
    expect(director.snapshot().view).toBe('top');
    expect(rendering).toBe(orthographic);
  });
});

describe('fit', () => {
  it('brings the camera back to the framing of the whole room', () => {
    const { director, run, finish } = setup();
    const start = director.snapshot();
    director.orbit(1.2, 0.3);
    director.dolly(-4);
    expect(director.snapshot().distance).not.toBeCloseTo(start.distance, 1);

    director.fit();
    expect(director.snapshot().transitioning).toBe(true);
    run(TRANSITION_MS + 50);
    finish();

    const after = director.snapshot();
    near(after.position, start.position, 4);
    near(after.target, start.target, 4);
  });

  it('is ignored while a view switch is running', () => {
    const { director, session, run } = setup();
    session.setView('top');
    run(100);
    director.fit();
    run(TRANSITION_MS);
    expect(director.snapshot().view).toBe('top');
  });

  it('refits the plan view', () => {
    const { director, session, controls, finish } = setup();
    session.setView('top');
    finish();
    const fitted = director.snapshot();

    void controls.orthographic.zoomTo(fitted.zoom * 4, false);
    controls.orthographic.update(1 / 60); // what the next rendered frame does
    expect(director.snapshot().zoom).toBeCloseTo(fitted.zoom * 4, 6);
    director.fit();
    finish();

    expect(director.snapshot().zoom).toBeCloseTo(fitted.zoom, 6);
  });
});

describe('limits', () => {
  const polarOf = ({ position, target, distance }: CameraSnapshot) =>
    Math.acos((position[1] - target[1]) / distance);

  it('never lets the camera go through the floor, however hard it is dragged', () => {
    const { director } = setup();
    director.orbit(0, 10);
    const snapshot = director.snapshot();
    expect(snapshot.position[1]).toBeGreaterThan(0);
    expect(polarOf(snapshot)).toBeLessThanOrEqual(MAX_POLAR_ANGLE + 1e-6);
  });

  it('never lets the camera move farther than 4 room diagonals away', () => {
    const { director, session } = setup({ width: 12, depth: 12 });
    director.dolly(-10_000);
    const bounds = sceneBounds(Object.values(session.getState().document.rooms));
    expect(director.snapshot().distance).toBeLessThanOrEqual(4 * boundsDiagonal(bounds) + 1e-6);
  });

  it('does not let the camera sit on top of its target', () => {
    const { director } = setup();
    director.dolly(10_000);
    expect(director.snapshot().distance).toBeGreaterThanOrEqual(0.3 - 1e-6);
  });

  it('follows the size of the rooms', () => {
    const { session, controls } = setup();
    const small = controls.perspective.maxDistance;
    const roomId = session.getState().document.roomOrder[0];
    if (!roomId) throw new Error('no room');
    session.execute(resizeRoom(roomId, { width: 12, depth: 12, height: 4 }));
    expect(controls.perspective.maxDistance).toBeGreaterThan(small);
  });

  it('pulls a far camera back in when the room shrinks', () => {
    const { director, session } = setup({ width: 12, depth: 12 });
    director.dolly(-10_000);
    const far = director.snapshot().distance;
    const roomId = session.getState().document.roomOrder[0];
    if (!roomId) throw new Error('no room');
    session.execute(resizeRoom(roomId, { width: 2, depth: 2, height: 2.2 }));
    const after = director.snapshot().distance;
    expect(after).toBeLessThan(far);
    const bounds = sceneBounds(Object.values(session.getState().document.rooms));
    expect(after).toBeLessThanOrEqual(4 * boundsDiagonal(bounds) + 1e-6);
  });

  it('leaves nothing pending in the controls after a room change (it would cost an extra frame)', () => {
    const { session, controls } = setup();
    const roomId = session.getState().document.roomOrder[0];
    if (!roomId) throw new Error('no room');
    session.execute(resizeRoom(roomId, { width: 8, depth: 8, height: 3 }));

    const woken = vi.fn();
    controls.perspective.addEventListener('update', woken);
    controls.orthographic.addEventListener('update', woken);
    controls.perspective.update(1 / 60); // what the next rendered frame does
    controls.orthographic.update(1 / 60);

    expect(woken).not.toHaveBeenCalled();
  });

  it('limits plan-view zoom around the fitted scale', () => {
    const { director, session, controls, finish } = setup();
    session.setView('top');
    finish();
    const { zoom } = director.snapshot();
    expect(controls.orthographic.minZoom).toBeCloseTo(zoom / 4, 6);
    expect(controls.orthographic.maxZoom).toBeCloseTo(zoom * 16, 6);
  });
});

describe('frames', () => {
  it('asks for a frame while moving and nothing once settled', () => {
    const { session, invalidate, run, finish, director } = setup();
    session.setView('top');
    invalidate.mockClear();
    run(100);
    expect(invalidate).toHaveBeenCalled();

    finish();
    invalidate.mockClear();
    director.step();
    director.step();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('stops reacting to the session after dispose', () => {
    const { director, session } = setup();
    director.dispose();
    session.setView('top');
    expect(director.snapshot().view).toBe('perspective');
    expect(director.snapshot().transitioning).toBe(false);
  });
});

describe('controls mapping', () => {
  it('keeps the left button free and uses the right one to orbit (perspective) or pan (plan)', () => {
    const { controls } = setup();
    const { ACTION } = CameraControlsImpl;
    expect(controls.perspective.mouseButtons.left).toBe(ACTION.NONE);
    expect(controls.perspective.mouseButtons.right).toBe(ACTION.ROTATE);
    expect(controls.perspective.mouseButtons.middle).toBe(ACTION.TRUCK);
    expect(controls.orthographic.mouseButtons.left).toBe(ACTION.NONE);
    expect(controls.orthographic.mouseButtons.right).toBe(ACTION.TRUCK);
    expect(controls.orthographic.mouseButtons.wheel).toBe(ACTION.ZOOM);
  });

  it('removes the damping under reduced motion', () => {
    const { controls } = setup({ reducedMotion: true });
    expect(controls.perspective.smoothTime).toBe(0);
    expect(controls.orthographic.draggingSmoothTime).toBe(0);
  });
});
