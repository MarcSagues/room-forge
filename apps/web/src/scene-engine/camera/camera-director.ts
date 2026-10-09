import { CameraControlsImpl } from '@react-three/drei/core/CameraControls';
import type { EditorSession, ViewMode } from '@roomforge/core';
import { Box3, type OrthographicCamera, type PerspectiveCamera, Vector3 } from 'three';
import {
  type Bounds,
  constrainPose,
  fitPerspective,
  fitTop,
  type OrbitLimits,
  orbitLimits,
  overheadPose,
  type Pose,
  sceneBounds,
  type Vec3,
  type Viewport,
} from './framing';
import { TRANSITION_MS, type ViewState, viewFromPose } from './transition';
import { createTransitionRunner } from './transition-runner';

export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 200;

/** The plan view may zoom out to a quarter of the fitted scale and in to sixteen times it. */
const ZOOM_OUT = 4;
const ZOOM_IN = 16;
const DAMPING_SECONDS = 0.25;
const DRAGGING_DAMPING_SECONDS = 0.125;

export interface CameraSnapshot {
  view: ViewMode;
  position: Vec3;
  target: Vec3;
  /** Orthographic zoom (px per metre); 1 for the perspective camera. */
  zoom: number;
  /** Distance from the camera to its target. */
  distance: number;
  transitioning: boolean;
}

/** What the host (app, tests) can ask of the camera. */
export interface CameraHandle {
  /** Frames the whole scene in the current view. */
  fit(): void;
  snapshot(): CameraSnapshot;
  /** Turns the perspective camera like a drag would, within its limits (tests and dev tools). */
  orbit(azimuth: number, polar: number): void;
  /** Moves the perspective camera along its line of sight, within its limits (tests and dev tools). */
  dolly(distance: number): void;
  /** Ignores user camera input while true (an object is being dragged). */
  setInputBlocked(blocked: boolean): void;
}

export interface DirectorDeps {
  session: EditorSession;
  cameras: { perspective: PerspectiveCamera; orthographic: OrthographicCamera };
  controls: { perspective: CameraControlsImpl; orthographic: CameraControlsImpl };
  /** Makes this camera the one the renderer draws with. */
  setActiveCamera(camera: PerspectiveCamera | OrthographicCamera): void;
  invalidate(): void;
  size(): Viewport;
  now(): number;
  reducedMotion(): boolean;
}

export interface CameraDirector extends CameraHandle {
  /** Call every frame, before the controls update. Does nothing while no transition runs. */
  step(): void;
  /** The viewport changed: resize both frusta and refresh the limits. */
  resize(): void;
  dispose(): void;
}

const emptyView = (): ViewState => ({ position: [0, 0, 0], target: [0, 0, 0], zoom: 1 });

/**
 * Drives the two cameras (orbiting perspective, orthographic plan view) and their controls: view
 * switches, fit, limits that follow the rooms. Plain TypeScript with no React, so it is testable
 * without WebGL. All camera writes happen here, outside React, and every change asks for a frame.
 */
export function createCameraDirector(deps: DirectorDeps): CameraDirector {
  const { session, cameras, controls } = deps;
  const { ACTION } = CameraControlsImpl;
  const runner = createTransitionRunner();
  const scratch = emptyView();
  const reading = emptyView();
  const vector = new Vector3();
  const boundaryBox = new Box3();

  let active: ViewMode = 'perspective';
  let onArrive: (() => void) | undefined;
  let lastPerspective: ViewState | undefined;
  let boundsCache: { rooms: unknown; bounds: Bounds } | undefined;

  const controlsFor = (view: ViewMode) =>
    view === 'top' ? controls.orthographic : controls.perspective;

  function bounds(): Bounds {
    const rooms = session.getState().document.rooms;
    if (boundsCache?.rooms !== rooms) {
      boundsCache = { rooms, bounds: sceneBounds(Object.values(rooms)) };
    }
    return boundsCache.bounds;
  }

  const aspect = () => {
    const { width, height } = deps.size();
    return height > 0 ? width / height : 1;
  };

  function configureControls() {
    const smooth = deps.reducedMotion() ? 0 : DAMPING_SECONDS;
    const smoothDragging = deps.reducedMotion() ? 0 : DRAGGING_DAMPING_SECONDS;
    for (const view of ['perspective', 'top'] as const) {
      const c = controlsFor(view);
      c.smoothTime = smooth;
      c.draggingSmoothTime = smoothDragging;
      // The left button stays free for selecting and moving things.
      c.mouseButtons.left = ACTION.NONE;
      c.mouseButtons.middle = ACTION.TRUCK;
    }
    const orbit = controls.perspective;
    orbit.mouseButtons.right = ACTION.ROTATE;
    orbit.mouseButtons.wheel = ACTION.DOLLY;
    orbit.touches.one = ACTION.TOUCH_ROTATE;
    orbit.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    orbit.touches.three = ACTION.TOUCH_TRUCK;

    const plan = controls.orthographic;
    plan.mouseButtons.right = ACTION.TRUCK;
    plan.mouseButtons.wheel = ACTION.ZOOM;
    plan.touches.one = ACTION.TOUCH_TRUCK;
    plan.touches.two = ACTION.TOUCH_ZOOM_TRUCK;
    plan.touches.three = ACTION.TOUCH_TRUCK;
  }

  function readView(view: ViewMode, out: ViewState) {
    const c = controlsFor(view);
    c.getPosition(vector);
    out.position[0] = vector.x;
    out.position[1] = vector.y;
    out.position[2] = vector.z;
    c.getTarget(vector);
    out.target[0] = vector.x;
    out.target[1] = vector.y;
    out.target[2] = vector.z;
    out.zoom = view === 'top' ? cameras.orthographic.zoom : 1;
  }

  function writeView(view: ViewMode, state: ViewState) {
    const c = controlsFor(view);
    void c.setLookAt(...state.position, ...state.target, false);
    if (view === 'top') {
      void c.zoomTo(state.zoom, false);
      // The controls copy their zoom to the camera on the next frame; reads in between (a quick
      // second view switch) must already see it.
      cameras.orthographic.zoom = Math.min(c.maxZoom, Math.max(c.minZoom, state.zoom));
      cameras.orthographic.updateProjectionMatrix();
    }
  }

  const topView = (fit: { pose: Pose; zoom: number }) => viewFromPose(fit.pose, fit.zoom);
  const perspectiveView = () =>
    viewFromPose(fitPerspective(bounds(), { fov: CAMERA_FOV, aspect: aspect() }));

  // Two independent reasons to ignore input: a running view transition and an object drag.
  let transitionLocked = false;
  let inputBlocked = false;
  function applyEnabled() {
    const free = !transitionLocked && !inputBlocked;
    controls.perspective.enabled = free && active === 'perspective';
    controls.orthographic.enabled = free && active === 'top';
  }
  function lock(locked: boolean) {
    transitionLocked = locked;
    applyEnabled();
  }

  /** Makes `view` the rendering camera at `state` (a cut, not an animation). */
  function activate(view: ViewMode, state: ViewState) {
    active = view;
    writeView(view, state);
    deps.setActiveCamera(view === 'top' ? cameras.orthographic : cameras.perspective);
    lock(false);
    deps.invalidate();
  }

  /** Moves the active camera to `to`: animated, or at once under reduced motion. */
  function moveTo(to: ViewState, arrive?: () => void) {
    if (deps.reducedMotion()) {
      writeView(active, to);
      arrive?.();
      deps.invalidate();
      return;
    }
    readView(active, reading);
    onArrive = arrive;
    lock(true);
    runner.start(reading, to, deps.now(), TRANSITION_MS);
    deps.invalidate();
  }

  function goTo(view: ViewMode) {
    const resting = !runner.active;
    runner.cancel();
    onArrive = undefined;
    lock(false);

    if (view === 'top') {
      if (active === 'top') return;
      if (resting) {
        lastPerspective = emptyView();
        readView('perspective', lastPerspective);
      }
      const fit = fitTop(bounds(), deps.size());
      const overhead = overheadPose(fit.pose.target, fit.zoom, CAMERA_FOV, deps.size().height);
      moveTo(viewFromPose(overhead), () => activate('top', topView(fit)));
      return;
    }

    if (active === 'top') {
      // Swap to the perspective camera at the equivalent overhead pose (no visible jump), then tilt.
      readView('top', reading);
      const overhead = overheadPose(reading.target, reading.zoom, CAMERA_FOV, deps.size().height);
      activate('perspective', viewFromPose(overhead));
    }
    moveTo(lastPerspective ?? perspectiveView());
  }

  function fit() {
    // Cancelling a view switch half-way would leave the camera out of step with the session's view.
    if (runner.active) return;
    if (active === 'top') moveTo(topView(fitTop(bounds(), deps.size())));
    else moveTo(perspectiveView());
  }

  function applyLimits() {
    const limits: OrbitLimits = orbitLimits(bounds());
    const orbit = controls.perspective;
    orbit.minDistance = limits.minDistance;
    orbit.maxDistance = limits.maxDistance;
    orbit.minPolarAngle = limits.minPolarAngle;
    orbit.maxPolarAngle = limits.maxPolarAngle;

    boundaryBox.min.set(...limits.boundary.min);
    boundaryBox.max.set(...limits.boundary.max);
    orbit.setBoundary(boundaryBox);
    const plan = controls.orthographic;
    plan.setBoundary(boundaryBox);
    const { zoom } = fitTop(bounds(), deps.size());
    plan.minZoom = zoom / ZOOM_OUT;
    plan.maxZoom = zoom * ZOOM_IN;

    // A smaller room can leave the resting perspective camera outside the new limits.
    if (active === 'perspective' && !runner.active) {
      readView('perspective', reading);
      const pose: Pose = { position: reading.position, target: reading.target };
      const constrained = constrainPose(pose, limits);
      if (constrained !== pose) {
        writeView('perspective', viewFromPose(constrained));
        deps.invalidate();
      }
    }

    // setBoundary flags the controls as changed, and on their next frame drei would request one more.
    // Consuming the flag now lets it coalesce with the frame the room change already asked for, so
    // a document change keeps costing exactly one frame.
    controls.perspective.update(0);
    controls.orthographic.update(0);
  }

  function resize() {
    const { width, height } = deps.size();
    cameras.perspective.aspect = height > 0 ? width / height : 1;
    cameras.perspective.updateProjectionMatrix();
    const ortho = cameras.orthographic;
    ortho.left = -width / 2;
    ortho.right = width / 2;
    ortho.top = height / 2;
    ortho.bottom = -height / 2;
    ortho.updateProjectionMatrix();
    applyLimits();
    deps.invalidate();
  }

  // Start: frustums and limits first, then the pose of the session's current view.
  configureControls();
  resize();
  activate('perspective', perspectiveView());
  if (session.getState().view === 'top') activate('top', topView(fitTop(bounds(), deps.size())));

  const stopView = session.subscribe((state) => state.view, goTo);
  const stopRooms = session.subscribe((state) => state.document.rooms, applyLimits);

  return {
    step() {
      if (!runner.active) return;
      const arrived = runner.step(deps.now(), scratch);
      writeView(active, scratch);
      if (!arrived) {
        deps.invalidate();
        return;
      }
      const callback = onArrive;
      onArrive = undefined;
      lock(false);
      callback?.();
    },
    resize,
    fit,
    setInputBlocked(blocked) {
      inputBlocked = blocked;
      applyEnabled();
    },
    snapshot() {
      readView(active, reading);
      const [px, py, pz] = reading.position;
      const [tx, ty, tz] = reading.target;
      return {
        view: active,
        position: [px, py, pz],
        target: [tx, ty, tz],
        zoom: reading.zoom,
        distance: Math.hypot(px - tx, py - ty, pz - tz),
        transitioning: runner.active,
      };
    },
    orbit(azimuth, polar) {
      if (active !== 'perspective') return;
      void controls.perspective.rotate(azimuth, polar, false);
      deps.invalidate();
    },
    dolly(distance) {
      if (active !== 'perspective') return;
      void controls.perspective.dolly(distance, false);
      deps.invalidate();
    },
    dispose() {
      stopView();
      stopRooms();
      runner.cancel();
    },
  };
}
