'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { type EntityId, type ObjectId, type OpeningId, toggleDoor } from '@roomforge/core';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  type Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { useSceneCatalog, useSceneSession, useTransientStore } from '../canvas/scene-context';
import { useEntityRegistry } from '../objects/entity-registry';
import { objectSize } from '../objects/placeholder-resources';
import { FRAME_PROUD } from '../room/opening-parts';
import { WALL_THICKNESS } from '../room/room-geometry';
import { MoveController } from './move-controller';
import { attachNudge } from './nudge-controller';
import { OpeningController } from './opening-controller';
import { outlineGeometry } from './outline-geometry';
import { type PickProxy, pickEntity } from './pick';
import { attachPicking } from './picking-controller';
import { RotateController } from './rotate-controller';
import { handleRadius, handleTarget, hitsHandle } from './rotate-handle';
import { attachRotateKeys } from './rotate-keys';
import { FINE_STEP_DEG } from './rotation';
import { tokenColor } from './token-color';

const raycaster = new Raycaster();
const ndc = new Vector2();

/** Arrow keys move the selection one snap step (Shift ×10); `R` / `Shift+R` turn it. */
export function ObjectKeys() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const transient = useTransientStore();
  useEffect(() => {
    const stopNudge = attachNudge({ session, catalog, transient });
    const stopRotate = attachRotateKeys({ session, catalog, transient });
    return () => {
      stopNudge();
      stopRotate();
    };
  }, [session, catalog, transient]);
  return null;
}

/**
 * Click, hover and drag (P3-03, P3-04). Rays are tested against one invisible box per object;
 * hidden and locked objects are skipped, and walls, floor and ceiling are never candidates, so
 * clicking through a faded wall reaches the objects behind it. Nothing here touches React state.
 */
export function Picking() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const registry = useEntityRegistry();
  const transient = useTransientStore();
  const element = useThree((state) => state.gl.domElement);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    // Reused between picks: one proxy object per entity, refreshed in place.
    const cache = new Map<EntityId, PickProxy>();
    const proxies: PickProxy[] = [];
    const proxyOf = (id: EntityId, object3d: Object3D) => {
      let proxy = cache.get(id);
      if (!proxy) {
        proxy = { id, matrixWorld: object3d.matrixWorld, size: { w: 0, h: 0, d: 0 } };
        cache.set(id, proxy);
      }
      proxy.matrixWorld = object3d.matrixWorld;
      return proxy;
    };
    const pick = (x: number, y: number): EntityId | null => {
      const { objects, openings } = session.getState().document;
      proxies.length = 0;
      for (const [id, object3d] of registry.entries()) {
        const object = objects[id as ObjectId];
        const opening = object ? undefined : openings[id as OpeningId];
        if (object && !object.hidden && !object.locked) {
          const proxy = proxyOf(id, object3d);
          proxy.size = objectSize(catalog, object.catalogId);
          proxies.push(proxy);
        } else if (opening && shown(object3d)) {
          // Doors and windows of a faded wall are hidden: clicks go through them.
          const proxy = proxyOf(id, object3d);
          openingSize(opening, proxy.size);
          proxies.push(proxy);
        }
      }
      return pickEntity(rayAt(x, y), proxies)?.id ?? null;
    };
    const rayAt = (x: number, y: number) => {
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, get().camera);
      return raycaster.ray;
    };
    const mover = new MoveController({ session, catalog, registry, transient, invalidate });
    const rotator = new RotateController({ session, catalog, registry, transient, invalidate });
    const slider = new OpeningController({ session, registry, transient, invalidate });
    const handleCentre = new Vector3();
    return attachPicking({
      element,
      pick,
      onHover: (id) => session.setHover(id),
      onClick: (id, additive) => {
        if (id) session.select([id], additive ? 'toggle' : 'replace');
        else if (!additive) session.select([]);
      },
      // Double-clicking a door opens or closes it: one command, so one history entry.
      onDoubleClick: (id) => {
        const opening = id ? session.getState().document.openings[id as OpeningId] : undefined;
        if (opening?.kind === 'door') session.execute(toggleDoor(opening.id));
      },
      drag: {
        start: (id, x, y) => {
          // Doors and windows slide along their wall; objects move over the floor.
          const opening = Object.hasOwn(session.getState().document.openings, id);
          const started = opening
            ? slider.begin(id as OpeningId, rayAt(x, y))
            : mover.begin(id as ObjectId, rayAt(x, y));
          if (!started) return false;
          // Dragging selects what is dragged, so the outline follows it.
          if (!session.getState().selection.includes(id)) session.select([id], 'replace');
          return true;
        },
        move: (x, y, free) => {
          if (slider.active) slider.update(rayAt(x, y), free);
          else mover.update(rayAt(x, y), free);
        },
        end: () => {
          if (slider.active) slider.end();
          else mover.end();
        },
        cancel: () => {
          slider.cancel();
          mover.cancel();
        },
        turn: (steps, fine) =>
          mover.turnBy(steps, fine ? FINE_STEP_DEG : session.getState().snap.angleStepDeg),
      },
      rotate: {
        hit: (x, y) => {
          const state = session.getState();
          const id = handleTarget(state);
          const object = id ? state.document.objects[id] : undefined;
          const node = id ? registry.get(id) : undefined;
          if (!id || !object || !node) return null;
          const radius = handleRadius(
            objectSize(catalog, object.catalogId),
            object.transform.scale,
          );
          node.getWorldPosition(handleCentre);
          const under = pick(x, y);
          const grabbed = hitsHandle(
            rayAt(x, y),
            handleCentre.x,
            handleCentre.z,
            node.rotation.y,
            radius,
            under !== null && under !== id,
          );
          return grabbed ? id : null;
        },
        start: (id, x, y) => rotator.begin(id as ObjectId, rayAt(x, y)),
        move: (x, y, free) => rotator.update(rayAt(x, y), free),
        end: () => {
          rotator.end();
        },
        cancel: () => rotator.cancel(),
      },
    });
  }, [session, catalog, registry, transient, element, get, invalidate]);

  return null;
}

/** Outlines slightly larger than the object so they do not z-fight with its faces. */
const INFLATE = 1.02;
const sizeMatrix = new Matrix4();
const scratch = { w: 0, h: 0, d: 0 };

/** The box a door or window is picked and outlined with: its hole, through the wall and frame. */
function openingSize(
  opening: { width: number; height: number } | undefined,
  out: { w: number; h: number; d: number },
) {
  out.w = opening?.width ?? 0;
  out.h = opening?.height ?? 0;
  out.d = WALL_THICKNESS + 2 * FRAME_PROUD;
  return out;
}

/** Drawn: it and every ancestor are visible (an opening of a faded wall is not). */
function shown(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/**
 * Hover outline (accent at 60 %) and selection box (accent): two shared line objects moved onto
 * the target every rendered frame. A hover or selection change only requests a frame.
 */
export function SelectionOutline() {
  const session = useSceneSession();
  const catalog = useSceneCatalog();
  const registry = useEntityRegistry();
  const transient = useTransientStore();
  const invalidate = useThree((state) => state.invalidate);
  const hover = useRef<LineSegments>(null);
  const selection = useRef<LineSegments>(null);
  const lines = useMemo(() => {
    const accent = new Color(tokenColor('--accent', '#ff7a45'));
    const danger = new Color(tokenColor('--danger', '#f2555a'));
    const make = (opacity: number) => {
      const line = new LineSegments(
        outlineGeometry(),
        new LineBasicMaterial({ color: accent, transparent: true, opacity, depthTest: false }),
      );
      line.matrixAutoUpdate = false;
      line.visible = false;
      line.renderOrder = 10;
      return line;
    };
    return { hover: make(0.6), selection: make(1), accent, danger };
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
    const selectedId = selected[0] ?? null;
    // Red while the dragged pose is not legal (the drop would be refused).
    const drag = transient.drag();
    const opening = transient.opening();
    const invalid = (drag !== null && !drag.valid) || (opening !== null && !opening.valid);
    lines.selection.material.color.copy(invalid ? lines.danger : lines.accent);
    place(lines.selection, selectedId);
    place(lines.hover, hovered === selectedId ? null : hovered);

    function place(line: LineSegments, id: EntityId | null) {
      const object = id ? document.objects[id as ObjectId] : undefined;
      const opening = id ? document.openings[id as OpeningId] : undefined;
      const target = id ? registry.get(id) : undefined;
      if (!target || (object ? object.hidden : !opening || !shown(target))) {
        line.visible = false;
        return;
      }
      const size = object ? objectSize(catalog, object.catalogId) : openingSize(opening, scratch);
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
