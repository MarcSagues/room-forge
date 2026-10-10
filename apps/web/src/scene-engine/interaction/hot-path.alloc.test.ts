import inspector from 'node:inspector';
import {
  addOpening,
  createEditorSession,
  type ObjectId,
  type OpeningId,
  type PlacementInput,
  type PlacementResult,
  type RoomId,
  solvePlacement,
} from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { Object3D, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createEntityRegistry } from '../objects/entity-registry';
import { LiveWall } from '../room/live-wall';
import { WALL_THICKNESS } from '../room/room-geometry';
import { WallOpeningsLayer } from '../room/wall-openings';
import { MoveController } from './move-controller';
import { OpeningController } from './opening-controller';
import { PlaceController } from './place-controller';
import { RotateController } from './rotate-controller';
import { hitsHandle } from './rotate-handle';
import { createTransientStore } from './transient-store';

// Drag code runs on every frame and must not allocate (AGENTS rule 3). The V8 sampling heap
// profiler, told to include objects that were already collected, samples allocations roughly once
// per `SAMPLING_INTERVAL` bytes and records the size of the object it caught. V8 boxes the odd
// double it does not inline (16 bytes, and how many depends on its inlining choices), so total
// bytes are noisy; an object, array, closure or vector is always larger. The tests therefore count
// only samples bigger than a boxed double and require them to stay near zero per call: creating
// one such object on every call would be tens of bytes per call, a wall snap that appears
// once in a few hundred calls is a fraction of a byte.

const CALLS = 50_000;
const SAMPLING_INTERVAL = 8;
const BOXED_DOUBLE_BYTES = 16;
/** Estimated bytes per call allocated in objects bigger than a boxed double. */
const BUDGET_BYTES_PER_CALL = 4;
const SLOW = 60_000;

function post<T>(session: inspector.Session, method: string, params?: object) {
  return new Promise<T>((resolve, reject) =>
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result as T))),
  );
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children: ProfileNode[];
}

/** Estimated bytes per call in objects bigger than a boxed double, and where they come from. */
async function largeBytesPerCall(step: (i: number) => void) {
  for (let i = 0; i < CALLS; i += 1) step(i); // let the JIT settle
  const session = new inspector.Session();
  session.connect();
  try {
    await post(session, 'HeapProfiler.startSampling', {
      samplingInterval: SAMPLING_INTERVAL,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    for (let i = 0; i < CALLS; i += 1) step(i);
    const { profile } = await post<{
      profile: { head: ProfileNode; samples: { size: number; nodeId: number }[] };
    }>(session, 'HeapProfiler.stopSampling');
    const where = new Map<number, string>();
    const walk = (node: ProfileNode) => {
      const { functionName, url, lineNumber } = node.callFrame;
      where.set(node.id, `${functionName || '(anonymous)'} ${url.split('/').pop()}:${lineNumber}`);
      for (const child of node.children) walk(child);
    };
    walk(profile.head);
    const large = profile.samples
      .filter((sample) => sample.size > BOXED_DOUBLE_BYTES)
      .map((sample) => ({ size: sample.size, at: where.get(sample.nodeId) ?? '?' }))
      .filter(({ at }) => !at.includes('node:')); // the profiler's own bookkeeping
    const places = new Map<string, number>();
    for (const { size, at } of large) places.set(`${size} B in ${at}`, (places.get(at) ?? 0) + 1);
    return {
      perCall: (large.length * SAMPLING_INTERVAL) / CALLS,
      sources: [...places.keys()].slice(0, 4).join('; '),
    };
  } finally {
    session.disconnect();
  }
}

/** `count` points along a line, there and back, so that walls are entered and left a few times. */
function sweep(count: number, from: number, to: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return from + (to - from) * (t < 0.5 ? 2 * t : 2 - 2 * t);
  });
}

function expectQuiet(result: { perCall: number; sources: string }) {
  expect(result.perCall, result.sources).toBeLessThan(BUDGET_BYTES_PER_CALL);
}

describe('hot path: no allocations per step', () => {
  it(
    'the measurement sees objects and arrays created per call',
    async () => {
      const kept: unknown[] = [];
      const vector = await largeBytesPerCall((i) => (kept[i & 7] = new Vector3(i, i, i)));
      const guide = await largeBytesPerCall(
        (i) => (kept[i & 7] = { kind: 'wall', from: [i, 0], to: [0, i] }),
      );
      expect(vector.perCall).toBeGreaterThan(BUDGET_BYTES_PER_CALL);
      expect(guide.perCall).toBeGreaterThan(BUDGET_BYTES_PER_CALL);
    },
    SLOW,
  );

  describe('solvePlacement with a reused result', () => {
    const along = sweep(600, -0.5, 4.5);
    const cases: [string, number[], number[], boolean, number | undefined][] = [
      ['in the open, with grid', [2.03, 2.31], [1.5, 1.74], true, 0.1],
      ['in the open, without grid', [2.03, 2.31], [1.5, 1.74], true, undefined],
      ['wall snapping disabled', [0.3, 0.33], [1.5, 1.74], false, 0.1],
      ['snapped to a wall', [0.3, 0.33], [1.5, 1.74], true, 0.1],
      ['sweeping across the room, wall to wall', along, along.map(() => 1.5), true, 0.1],
      ['sweeping along the walls', along, sweep(600, 0.2, 3), true, 0.1],
    ];
    for (const [name, xs, zs, wallSnap, gridStep] of cases) {
      it(
        name,
        async () => {
          const input: PlacementInput & { position: [number, number] } = {
            room: { width: 4, depth: 3 },
            size: { w: 1.2, d: 0.6 },
            position: [0, 0],
            rotationY: 0,
            wallSnap,
          };
          const out: PlacementResult = {
            position: [0, 0],
            rotationY: 0,
            valid: true,
            reason: null,
            wall: null,
            guides: [],
          };
          expectQuiet(
            await largeBytesPerCall((i) => {
              input.position[0] = xs[i % xs.length] as number;
              input.position[1] = zs[i % zs.length] as number;
              input.gridStep = gridStep;
              solvePlacement(input, out);
            }),
          );
        },
        SLOW,
      );
    }
  });

  describe('MoveController.update', () => {
    // Fixture room 4 × 3; desk-1 (1.2 × 0.6) at (2, 0, 1.5).
    const DESK = 'desk-1' as ObjectId;
    const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
    const rays = {
      'in the open': [down(2.3, 1.7), down(2.7, 1.9), down(2.1, 1.2)],
      'against a wall': [down(-3, 1.5), down(-3, 1.9)],
      'sweeping across the room': sweep(600, -1.5, 5.5).map((x) => down(x, 1.5)),
    };

    for (const [name, list] of Object.entries(rays)) {
      for (const free of [false, true]) {
        it(
          `${name}${free ? ' with Alt' : ''}`,
          async () => {
            const session = createEditorSession({
              initialDocument: buildDocument(),
              catalog: createFixtureCatalog(),
            });
            const registry = createEntityRegistry();
            for (const object of Object.values(session.getState().document.objects)) {
              const node = new Object3D();
              node.position.fromArray(object.transform.position);
              registry.register(object.id, node);
            }
            const transient = createTransientStore();
            transient.subscribe(() => {}); // like the camera rig, which listens during a drag
            const controller = new MoveController({
              session,
              catalog: createFixtureCatalog(),
              registry,
              transient,
              invalidate: () => {},
            });
            controller.begin(DESK, down(2, 1.5));
            expectQuiet(
              await largeBytesPerCall((i) => controller.update(list[i % list.length] as Ray, free)),
            );
            controller.cancel();
          },
          SLOW,
        );
      }
    }
  });

  describe('rotation', () => {
    const DESK = 'desk-1' as ObjectId;
    const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
    // Rays on a circle of radius 1 around the desk centre (2, 1.5), there and back.
    const circle = sweep(720, 0, 2 * Math.PI).map((angle) =>
      down(2 + Math.sin(angle), 1.5 + Math.cos(angle)),
    );

    function setup() {
      const session = createEditorSession({
        initialDocument: buildDocument(),
        catalog: createFixtureCatalog(),
      });
      const registry = createEntityRegistry();
      for (const object of Object.values(session.getState().document.objects)) {
        const node = new Object3D();
        node.position.fromArray(object.transform.position);
        registry.register(object.id, node);
      }
      const transient = createTransientStore();
      transient.subscribe(() => {});
      return { session, registry, transient };
    }

    for (const free of [false, true]) {
      it(
        `RotateController.update${free ? ' with Alt' : ''}`,
        async () => {
          const { session, registry, transient } = setup();
          const controller = new RotateController({
            session,
            catalog: createFixtureCatalog(),
            registry,
            transient,
            invalidate: () => {},
          });
          controller.begin(DESK, down(2, 2.5));
          expectQuiet(
            await largeBytesPerCall((i) =>
              controller.update(circle[i % circle.length] as Ray, free),
            ),
          );
          controller.cancel();
        },
        SLOW,
      );
    }

    it(
      'MoveController.turnBy',
      async () => {
        const { session, registry, transient } = setup();
        const controller = new MoveController({
          session,
          catalog: createFixtureCatalog(),
          registry,
          transient,
          invalidate: () => {},
        });
        controller.begin(DESK, down(2, 1.5));
        controller.update(down(2.4, 1.7), false);
        expectQuiet(await largeBytesPerCall((i) => controller.turnBy(i % 2 === 0 ? 1 : -1, 15)));
        controller.cancel();
      },
      SLOW,
    );

    it(
      'hitsHandle, on every hover frame',
      async () => {
        const rays = sweep(400, 0, 4).map((x) => down(x, 1.5 + (x % 1)));
        let grabbed = 0;
        expectQuiet(
          await largeBytesPerCall((i) => {
            if (hitsHandle(rays[i % rays.length] as Ray, 2, 1.5, i * 0.01, 1, i % 3 === 0)) {
              grabbed += 1;
            }
          }),
        );
        expect(grabbed).toBeGreaterThan(0);
      },
      SLOW,
    );
  });

  describe('PlaceController.update (an item dragged in from the catalog)', () => {
    const down = (x: number, z: number) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));
    // Across the room and out of it on both sides, so the ghost shows, snaps to walls and hides.
    const path = sweep(600, -1.5, 5.5).map((x) => down(x, 1.5));

    for (const free of [false, true]) {
      it(
        `${free ? 'with Alt' : 'with snapping'}`,
        async () => {
          const session = createEditorSession({
            initialDocument: buildDocument(),
            catalog: createFixtureCatalog(),
          });
          const transient = createTransientStore();
          transient.subscribe(() => {});
          const controller = new PlaceController({
            session,
            catalog: createFixtureCatalog(),
            transient,
            invalidate: () => {},
          });
          controller.begin('desk.basic.120');
          expectQuiet(
            await largeBytesPerCall((i) => controller.update(path[i % path.length] as Ray, free)),
          );
          controller.cancel();
        },
        SLOW,
      );
    }
  });
  describe('sliding an opening (OpeningController.update + the live wall it redraws)', () => {
    // Window-1 (0.9 wide) on the north wall of the 4 × 3 fixture room, plus a window at 2.5 so
    // the sweep goes through valid and overlapping positions and into both corners.
    const atNorth = (x: number) => new Ray(new Vector3(x, 1.5, 2), new Vector3(0, 0, -1));
    const path = sweep(600, -1, 5).map(atNorth);

    for (const free of [false, true]) {
      it(
        `${free ? 'with Alt' : 'with snapping'}`,
        async () => {
          const session = createEditorSession({
            initialDocument: buildDocument(),
            catalog: createFixtureCatalog(),
          });
          const roomId = 'room-1' as RoomId;
          session.execute(
            addOpening({
              id: 'w2',
              roomId,
              wall: 'north',
              variant: 'window.standard',
              offset: 2.5,
            }),
          );
          const registry = createEntityRegistry();
          registry.register('window-1' as OpeningId, new Object3D());
          const transient = createTransientStore();
          const layer = new WallOpeningsLayer();
          const live = new LiveWall({
            session,
            transient,
            layer,
            roomId,
            wall: 'north',
            shift: WALL_THICKNESS,
            thickness: WALL_THICKNESS,
          });
          live.length = 4 + 2 * WALL_THICKNESS;
          live.height = 2.6;
          live.surface = new Object3D();
          transient.subscribe(() => live.sync());
          const controller = new OpeningController({
            session,
            registry,
            transient,
            invalidate: () => {},
          });
          controller.begin('window-1' as OpeningId, atNorth(0.9));
          expectQuiet(
            await largeBytesPerCall((i) => controller.update(path[i % path.length] as Ray, free)),
          );
          controller.cancel();
          live.dispose();
          layer.dispose();
        },
        SLOW,
      );
    }
  });
});
