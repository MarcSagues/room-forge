import type { CommandResult } from '@roomforge/core';
import type { Ray } from 'three';
import { type Camera, Raycaster, Vector2 } from 'three';

/** What the placement API needs from `PlaceController` (structural, so tests can stand in for it). */
export interface PlacementTarget {
  begin(catalogId: string): boolean;
  update(ray: Ray | null, free: boolean): void;
  end(): CommandResult | null;
  cancel(): void;
  placeAtCenter(catalogId: string, ray: Ray | null): CommandResult | null;
}

/**
 * What the host (the catalog panel) can do with the scene to place an item: the drag starts
 * outside the canvas, so everything here speaks page coordinates (`clientX/Y`).
 */
export interface PlacementApi {
  /** Starts dragging `catalogId` in; false when there is nowhere to place it (no room). */
  begin(catalogId: string): boolean;
  /** The pointer moved; `free` = Alt held. Applied at most once per animation frame. */
  move(clientX: number, clientY: number, free: boolean): void;
  /** The pointer was released; true when an object was created (over a floor in the canvas). */
  end(clientX: number, clientY: number): boolean;
  cancel(): void;
  /** Click or Enter on an item: places it where the centre of the view looks. */
  placeAtCenter(catalogId: string): boolean;
}

export interface PlacementApiDeps {
  controller: PlacementTarget;
  canvas: HTMLElement;
  /** The camera that renders right now (it changes with the view). */
  getCamera(): Camera;
  /** The element under a page point; the canvas itself when nothing covers it. */
  elementAt?: (clientX: number, clientY: number) => Element | null;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export function createPlacementApi(deps: PlacementApiDeps): PlacementApi {
  const { controller, canvas } = deps;
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const elementAt = deps.elementAt ?? ((x, y) => document.elementFromPoint(x, y));
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let pendingX = 0;
  let pendingY = 0;
  let pendingFree = false;
  let scheduled: number | null = null;

  /** The ray under a page point, or null when the point is not on the canvas. */
  const rayAt = (clientX: number, clientY: number): Ray | null => {
    const rect = canvas.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom &&
      rect.width > 0 &&
      rect.height > 0;
    // A panel or dialog floating over the canvas is not the viewport.
    if (!inside || elementAt(clientX, clientY) !== canvas) return null;
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, deps.getCamera());
    return raycaster.ray;
  };

  const flush = () => {
    scheduled = null;
    controller.update(rayAt(pendingX, pendingY), pendingFree);
  };
  const unschedule = () => {
    if (scheduled !== null) cancelFrame(scheduled);
    scheduled = null;
  };

  return {
    begin: (catalogId) => controller.begin(catalogId),
    move(clientX, clientY, free) {
      pendingX = clientX;
      pendingY = clientY;
      pendingFree = free;
      scheduled ??= requestFrame(flush);
    },
    end(clientX, clientY) {
      // Drop where the pointer was released, even if that position has not had its frame yet.
      unschedule();
      controller.update(rayAt(clientX, clientY), pendingFree);
      return controller.end()?.ok === true;
    },
    cancel() {
      unschedule();
      controller.cancel();
    },
    placeAtCenter(catalogId) {
      ndc.set(0, 0);
      raycaster.setFromCamera(ndc, deps.getCamera());
      return controller.placeAtCenter(catalogId, raycaster.ray)?.ok === true;
    },
  };
}
