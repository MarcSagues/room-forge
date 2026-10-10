'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { markOverlay } from '../canvas/overlay';
import { useSceneCatalog, useSceneSession, useTransientStore } from '../canvas/scene-context';
import { useEntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import { handleRadius, handleTarget, knobPosition } from './rotate-handle';
import { toDegrees } from './rotation';
import { tokenColor } from './token-color';

/** Just above the floor (and the wall guide) so the ring does not z-fight with it. */
const LIFT = 0.02;
const KNOB_RADIUS = 0.07;
/** The knob grows while it is being dragged. */
const KNOB_ACTIVE = 1.4;

/** Unit ring and knob lying on the floor, scaled per object; shared by every handle. */
let ringGeometry: RingGeometry | undefined;
let knobGeometry: CircleGeometry | undefined;
const geometries = () => {
  ringGeometry ??= new RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2);
  knobGeometry ??= new CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  return { ring: ringGeometry, knob: knobGeometry };
};

const centre = new Vector3();
const projected = new Vector3();
const knobXZ: [number, number] = [0, 0];

/**
 * The rotation handle (P3-05): a ring around the selected object with a knob in front of it,
 * and, while it is dragged, the angle next to the knob. Everything is moved by `useFrame` from the
 * object's `Object3D` and the transient store, so it follows a drag without React state; it stays
 * mounted and is shown or hidden with `visible` / `display` (AGENTS rule 7).
 */
export function RotationHandle() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const registry = useEntityRegistry();
  const transient = useTransientStore();
  const canvas = useThree((state) => state.gl.domElement);

  const parts = useMemo(() => {
    const accent = new Color(tokenColor('--accent', '#ff7a45'));
    const danger = new Color(tokenColor('--danger', '#f2555a'));
    const { ring, knob } = geometries();
    const make = (geometry: RingGeometry | CircleGeometry, opacity: number) =>
      new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
    const group = markOverlay(new Group());
    const ringMesh = make(ring, 0.8);
    const knobMesh = make(knob, 1);
    ringMesh.position.y = LIFT;
    knobMesh.position.y = LIFT;
    group.add(ringMesh, knobMesh);
    group.visible = false;
    return { group, ringMesh, knobMesh, accent, danger };
  }, []);

  // The angle readout is a plain element beside the canvas, written by useFrame (no React state).
  const label = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('div');
    element.className =
      'pointer-events-none absolute top-0 left-0 z-10 rounded-sm border border-control bg-elevated px-2 py-0.5 font-medium text-fg text-xs tabular-nums';
    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
    return element;
  }, []);

  useEffect(() => {
    const host = canvas.parentElement;
    if (!label || !host) return;
    host.appendChild(label);
    return () => {
      // The geometries are shared: only what this component made is disposed.
      label.remove();
      parts.ringMesh.material.dispose();
      parts.knobMesh.material.dispose();
    };
  }, [canvas, label, parts]);

  useFrame(({ camera, size }) => {
    const { group, ringMesh, knobMesh } = parts;
    const state = session.getState();
    const id = handleTarget(state);
    const object = id ? state.document.objects[id] : undefined;
    const node = id ? registry.get(id) : undefined;
    const drag = transient.drag();
    // A move drag has no use for the ring; a turn drag keeps it, with the readout.
    if (!id || !object || !node || (drag && drag.kind === 'move')) {
      group.visible = false;
      if (label && label.style.display !== 'none') label.style.display = 'none';
      return;
    }

    const radius = handleRadius(objectSize(catalog, object.catalogId), object.transform.scale);
    node.getWorldPosition(centre);
    ringMesh.position.x = centre.x;
    ringMesh.position.z = centre.z;
    ringMesh.scale.set(radius, 1, radius);
    knobPosition(centre.x, centre.z, node.rotation.y, radius, knobXZ);
    knobMesh.position.x = knobXZ[0];
    knobMesh.position.z = knobXZ[1];

    const turning = drag?.kind === 'rotate';
    const scale = KNOB_RADIUS * (turning ? KNOB_ACTIVE : 1);
    knobMesh.scale.set(scale, 1, scale);
    const colour = turning && drag && !drag.valid ? parts.danger : parts.accent;
    knobMesh.material.color.copy(colour);
    ringMesh.material.color.copy(colour);
    group.visible = true;

    if (!label) return;
    if (!turning || !drag) {
      if (label.style.display !== 'none') label.style.display = 'none';
      return;
    }
    projected.set(knobXZ[0], LIFT, knobXZ[1]).project(camera);
    const x = ((projected.x + 1) / 2) * size.width + 14;
    const y = ((1 - projected.y) / 2) * size.height - 30;
    const text = `${toDegrees(drag.rotationY)}°`;
    if (label.textContent !== text) label.textContent = text;
    label.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    if (label.style.display !== 'block') label.style.display = 'block';
  });

  return <primitive object={parts.group} />;
}
