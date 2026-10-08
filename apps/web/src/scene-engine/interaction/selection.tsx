'use client';

import { useFrame, useThree } from '@react-three/fiber';
import type { ObjectId } from '@roomforge/core';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Raycaster,
  Vector2,
} from 'three';
import { useSceneCatalog, useSceneSession } from '../canvas/scene-context';
import { useEntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import { type PickProxy, pickEntity } from './pick';
import { attachPicking } from './picking-controller';

const raycaster = new Raycaster();
const ndc = new Vector2();

/**
 * Click and hover selection (P3-03). Rays are tested against one invisible box per object; hidden
 * and locked objects are skipped, and walls, floor and ceiling are never candidates, so clicking
 * through a faded wall reaches the objects behind it. Nothing here touches React state.
 */
export function Picking() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const registry = useEntityRegistry();
  const element = useThree((state) => state.gl.domElement);
  const get = useThree((state) => state.get);

  useEffect(() => {
    // Reused between picks: one proxy object per entity, refreshed in place.
    const cache = new Map<ObjectId, PickProxy>();
    const proxies: PickProxy[] = [];
    const pick = (x: number, y: number): ObjectId | null => {
      const { objects } = session.getState().document;
      proxies.length = 0;
      for (const [id, object3d] of registry.entries()) {
        const object = objects[id as ObjectId];
        if (!object || object.hidden || object.locked) continue;
        let proxy = cache.get(id as ObjectId);
        if (!proxy) {
          proxy = {
            id: id as ObjectId,
            matrixWorld: object3d.matrixWorld,
            size: { w: 0, h: 0, d: 0 },
          };
          cache.set(id as ObjectId, proxy);
        }
        proxy.matrixWorld = object3d.matrixWorld;
        proxy.size = objectSize(catalog, object.catalogId);
        proxies.push(proxy);
      }
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, get().camera);
      return pickEntity(raycaster.ray, proxies)?.id ?? null;
    };
    return attachPicking({
      element,
      pick,
      onHover: (id) => session.setHover(id),
      onClick: (id, additive) => {
        if (id) session.select([id], additive ? 'toggle' : 'replace');
        else if (!additive) session.select([]);
      },
    });
  }, [session, catalog, registry, element, get]);

  return null;
}

/** A unit box outline (bottom on the floor), scaled per object; one geometry for both outlines. */
let edges: EdgesGeometry | undefined;
const outlineGeometry = () => {
  edges ??= new EdgesGeometry(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  return edges;
};

/** Accent colour from the design tokens (`--accent`), with the dark-theme value as fallback. */
function accentColor(): string {
  if (typeof document === 'undefined') return '#ff7a45';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return value || '#ff7a45';
}

/** Outlines slightly larger than the object so they do not z-fight with its faces. */
const INFLATE = 1.02;
const sizeMatrix = new Matrix4();

/**
 * Hover outline (accent at 60 %) and selection box (accent): two shared line objects moved onto
 * the target every rendered frame. A hover or selection change only requests a frame.
 */
export function SelectionOutline() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const registry = useEntityRegistry();
  const invalidate = useThree((state) => state.invalidate);
  const hover = useRef<LineSegments>(null);
  const selection = useRef<LineSegments>(null);
  const lines = useMemo(() => {
    const color = accentColor();
    const make = (opacity: number) => {
      const line = new LineSegments(
        outlineGeometry(),
        new LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      line.matrixAutoUpdate = false;
      line.visible = false;
      line.renderOrder = 10;
      return line;
    };
    return { hover: make(0.6), selection: make(1) };
  }, []);

  useEffect(() => {
    return () => {
      lines.hover.material.dispose();
      lines.selection.material.dispose();
    };
  }, [lines]);

  // Hover and selection live in the store but no component renders them: just draw a frame.
  useEffect(
    () =>
      session.store.subscribe((state, previous) => {
        if (state.hover !== previous.hover || state.selection !== previous.selection) invalidate();
      }),
    [session, invalidate],
  );

  useFrame(() => {
    const { hover: hovered, selection: selected, document } = session.getState();
    const selectedId = (selected[0] ?? null) as ObjectId | null;
    place(lines.selection, selectedId);
    place(lines.hover, hovered === selectedId ? null : (hovered as ObjectId | null));

    function place(line: LineSegments, id: ObjectId | null) {
      const object = id ? document.objects[id] : undefined;
      const target = id ? registry.get(id) : undefined;
      if (!object || !target || object.hidden) {
        line.visible = false;
        return;
      }
      const size = objectSize(catalog, object.catalogId);
      target.updateWorldMatrix(true, false);
      line.matrix
        .copy(target.matrixWorld)
        .multiply(sizeMatrix.makeScale(size.w * INFLATE, size.h * INFLATE, size.d * INFLATE));
      line.visible = true;
    }
  });

  return (
    <>
      <primitive ref={hover} object={lines.hover} />
      <primitive ref={selection} object={lines.selection} />
    </>
  );
}
