'use client';

import { CameraControls, type CameraControlsImpl } from '@react-three/drei/core/CameraControls';
import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { useSceneSession, useTransientStore } from '../canvas/scene-context';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  type CameraDirector,
  type CameraHandle,
  createCameraDirector,
} from './camera-director';
import { prefersReducedMotion } from './reduced-motion';
import { bindShiftToPan } from './shift-pan';

function createCameras() {
  // `manual` tells R3F to leave the frustum alone: it only resizes the camera it renders with,
  // while the director sizes both.
  const perspective = Object.assign(new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR), {
    manual: true,
  });
  const orthographic = Object.assign(
    new OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR),
    { manual: true },
  );
  return { perspective, orthographic };
}

/**
 * The two cameras and their controls. Everything imperative lives in the director; this component
 * only mounts the controls, hands them over, and calls `step()` once per frame (before the
 * controls update, so a running transition is applied in the same frame).
 */
export function CameraRig({ handleRef }: { handleRef: RefObject<CameraHandle | null> }) {
  const session = useSceneSession();
  const transient = useTransientStore();
  const get = useThree((state) => state.get);
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const sizeRef = useRef(size);

  const cameras = useMemo(createCameras, []);
  const perspectiveControls = useRef<CameraControlsImpl>(null);
  const orthographicControls = useRef<CameraControlsImpl>(null);
  const director = useRef<CameraDirector | null>(null);

  useEffect(() => {
    const perspective = perspectiveControls.current;
    const orthographic = orthographicControls.current;
    if (!perspective || !orthographic) return;

    const previousCamera = get().camera;
    const created = createCameraDirector({
      session,
      cameras,
      controls: { perspective, orthographic },
      setActiveCamera: (camera) => set({ camera }),
      invalidate: () => invalidate(),
      size: () => sizeRef.current,
      now: () => performance.now(),
      reducedMotion: () => prefersReducedMotion(),
    });
    director.current = created;
    handleRef.current = created;
    const unbindShift = bindShiftToPan(perspective, window);
    return () => {
      unbindShift();
      created.dispose();
      director.current = null;
      if (handleRef.current === created) handleRef.current = null;
      set({ camera: previousCamera });
    };
  }, [session, cameras, get, set, invalidate, handleRef]);

  // The camera does not orbit or pan while an object is being dragged.
  useEffect(
    () =>
      transient.subscribe(() =>
        director.current?.setInputBlocked(
          transient.drag() !== null || transient.opening() !== null,
        ),
      ),
    [transient],
  );

  useEffect(() => {
    sizeRef.current = size;
    director.current?.resize();
  }, [size]);

  useFrame(() => director.current?.step(), -2);

  return (
    <>
      <CameraControls ref={perspectiveControls} camera={cameras.perspective} />
      <CameraControls ref={orthographicControls} camera={cameras.orthographic} />
    </>
  );
}
