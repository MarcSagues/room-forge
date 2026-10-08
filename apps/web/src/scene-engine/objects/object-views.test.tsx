import ReactThreeTestRenderer from '@react-three/test-renderer';
import {
  type Command,
  createEditorSession,
  type EditorSession,
  LIMITS,
  type ObjectId,
  type PlacedObject,
  type SceneDocument,
  type SessionState,
} from '@roomforge/core';
import {
  buildDocument,
  buildObject,
  buildRoom,
  createFixtureCatalog,
} from '@roomforge/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { SceneSessionProvider } from '../canvas/scene-context';
import {
  createEntityRegistry,
  type EntityRegistry,
  EntityRegistryProvider,
} from './entity-registry';
import { LIST_RENDER_KEY, ObjectList, viewRenderKey } from './object-views';
import { renderCount, startRenderCounting, stopRenderCounting } from './render-count';

const { act, create } = ReactThreeTestRenderer;

// Objects use an id the fixture catalog does not know, so floor containment (I3) does not apply.
const object = (i: number, overrides: Partial<Parameters<typeof buildObject>[0]> = {}) =>
  buildObject({
    id: `o${i}`,
    catalogId: 'test.box',
    transform: { position: [(i % 20) * 0.5, 0, Math.floor(i / 20) * 0.5], rotationY: 0 },
    ...overrides,
  });

function documentWith(objects: PlacedObject[]): SceneDocument {
  const room = buildRoom({ shape: { kind: 'rect', width: 12, depth: 12 }, origin: [-6, -6] });
  return {
    ...buildDocument(),
    rooms: { [room.id]: room },
    roomOrder: [room.id],
    openings: {},
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    objectOrder: objects.map((o) => o.id),
  };
}

async function mount(session: EditorSession, registry: EntityRegistry = createEntityRegistry()) {
  const renderer = await create(
    <SceneSessionProvider session={session}>
      <EntityRegistryProvider registry={registry}>
        <ObjectList />
      </EntityRegistryProvider>
    </SceneSessionProvider>,
  );
  return { renderer, registry };
}

const moveCommand = (id: string, x: number): Command => ({
  type: 'test/move',
  label: 'Move',
  apply(draft) {
    const target = draft.objects[id as ObjectId];
    if (target) target.transform.position[0] = x;
  },
});

const addCommand = (added: PlacedObject): Command => ({
  type: 'test/add',
  label: 'Add',
  apply(draft) {
    draft.objects[added.id] = added;
    draft.objectOrder.push(added.id);
  },
});

const removeCommand = (id: string): Command => ({
  type: 'test/remove',
  label: 'Remove',
  apply(draft) {
    delete draft.objects[id as ObjectId];
    draft.objectOrder = draft.objectOrder.filter((other) => other !== id);
  },
});

beforeEach(() => {
  startRenderCounting();
});
afterEach(() => stopRenderCounting());

/** Total renders of every ObjectView except the given ids. */
function otherViewRenders(count: number, except: string[]) {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const id = `o${i}` as ObjectId;
    if (!except.includes(id)) total += renderCount(viewRenderKey(id));
  }
  return total;
}

describe(`granular subscriptions with a real session (${LIMITS.maxObjects} objects, the domain limit)`, () => {
  const COUNT = LIMITS.maxObjects;
  let session: EditorSession;

  beforeEach(() => {
    session = createEditorSession({
      initialDocument: documentWith(Array.from({ length: COUNT - 1 }, (_, i) => object(i))),
      catalog: createFixtureCatalog(),
    });
  });

  it('mounts one view per object and registers each Object3D', async () => {
    const { registry } = await mount(session);
    expect(registry.size).toBe(COUNT - 1);
    expect(registry.get('o7' as ObjectId)?.name).toBe('o7');
    expect(renderCount(LIST_RENDER_KEY)).toBe(1);
  });

  it('moving one object re-renders exactly that view and not the list', async () => {
    const { registry } = await mount(session);
    startRenderCounting();
    await act(async () => {
      expect(session.execute(moveCommand('o42', 3.3)).ok).toBe(true);
    });
    expect(renderCount(viewRenderKey('o42' as ObjectId))).toBe(1);
    expect(otherViewRenders(COUNT - 1, ['o42'])).toBe(0);
    expect(renderCount(LIST_RENDER_KEY)).toBe(0);
    expect(registry.get('o42' as ObjectId)?.position.x).toBeCloseTo(3.3);
  });

  it('adding one object re-renders the list once and no existing view', async () => {
    await mount(session);
    startRenderCounting();
    await act(async () => {
      expect(session.execute(addCommand(object(COUNT - 1))).ok).toBe(true);
    });
    expect(renderCount(LIST_RENDER_KEY)).toBe(1);
    expect(otherViewRenders(COUNT - 1, [])).toBe(0);
    expect(renderCount(viewRenderKey(`o${COUNT - 1}` as ObjectId))).toBe(1);
  });

  it('removing an object unmounts its view and unregisters it', async () => {
    const { registry } = await mount(session);
    await act(async () => {
      session.execute(removeCommand('o3'));
    });
    expect(registry.get('o3' as ObjectId)).toBeUndefined();
    expect(registry.size).toBe(COUNT - 2);
  });
});

describe('500-entity harness (store driven directly: the domain allows 300)', () => {
  const COUNT = 500;
  let store: StoreApi<SessionState>;

  beforeEach(() => {
    // The session only builds the initial state; the harness then updates the store itself, the
    // way a command would (new document, untouched objects kept by reference).
    const seed = createEditorSession({
      initialDocument: documentWith(Array.from({ length: COUNT }, (_, i) => object(i))),
      catalog: createFixtureCatalog(),
    });
    store = createStore<SessionState>(() => seed.getState());
  });

  const harnessSession = () => ({ store }) as unknown as EditorSession;

  function setObjects(update: (objects: SceneDocument['objects']) => SceneDocument['objects']) {
    const doc = store.getState().document as SceneDocument;
    const objects = update(doc.objects);
    const objectOrder = Object.keys(objects) as ObjectId[];
    store.setState({ document: { ...doc, objects, objectOrder } });
  }

  it('moving 1 of 500 re-renders 1 view and the list 0 times', async () => {
    await mount(harnessSession());
    startRenderCounting();
    await act(async () => {
      setObjects((objects) => {
        const target = objects['o250' as ObjectId] as PlacedObject;
        return {
          ...objects,
          [target.id]: { ...target, transform: { ...target.transform, position: [1, 0, 1] } },
        };
      });
    });
    expect(renderCount(viewRenderKey('o250' as ObjectId))).toBe(1);
    expect(otherViewRenders(COUNT, ['o250'])).toBe(0);
    expect(renderCount(LIST_RENDER_KEY)).toBe(0);
  });

  it('adding 1 to 500 re-renders the list once and no existing view', async () => {
    await mount(harnessSession());
    startRenderCounting();
    await act(async () => {
      setObjects((objects) => ({ ...objects, o500: object(500) }));
    });
    expect(renderCount(LIST_RENDER_KEY)).toBe(1);
    expect(otherViewRenders(COUNT, [])).toBe(0);
  });

  // 400 commits take ~2 s alone; allow for a busy machine running the whole suite in parallel.
  it('keeps the registry size stable over 200 add/remove cycles', { timeout: 20_000 }, async () => {
    const { registry } = await mount(harnessSession());
    for (let cycle = 0; cycle < 200; cycle += 1) {
      await act(async () => {
        setObjects((objects) => ({ ...objects, extra: object(9999, { id: 'extra' }) }));
      });
      expect(registry.size).toBe(COUNT + 1);
      await act(async () => {
        setObjects((objects) => {
          const { ['extra' as ObjectId]: _, ...rest } = objects;
          return rest;
        });
      });
    }
    expect(registry.size).toBe(COUNT);
    expect(registry.get('extra' as ObjectId)).toBeUndefined();
  });
});

describe('ObjectView details', () => {
  it('places stacked objects inside their parent and does not re-render them when it moves', async () => {
    const desk = object(0, { id: 'desk' });
    const monitor = object(1, {
      id: 'monitor',
      parentId: 'desk',
      transform: { position: [0, 0.75, 0], rotationY: 0 },
    });
    const session = createEditorSession({
      initialDocument: documentWith([desk, monitor]),
      catalog: createFixtureCatalog(),
    });
    const { registry } = await mount(session);
    const deskObject = registry.get('desk' as ObjectId);
    const monitorObject = registry.get('monitor' as ObjectId);
    expect(monitorObject?.parent).toBe(deskObject);

    startRenderCounting();
    await act(async () => {
      session.execute(moveCommand('desk', 2));
    });
    expect(renderCount(viewRenderKey('desk' as ObjectId))).toBe(1);
    expect(renderCount(viewRenderKey('monitor' as ObjectId))).toBe(0);
  });

  it('offsets root objects by their room origin and hides hidden objects without unmounting', async () => {
    const session = createEditorSession({
      initialDocument: documentWith([object(0, { hidden: true })]),
      catalog: createFixtureCatalog(),
    });
    const { registry } = await mount(session);
    const view = registry.get('o0' as ObjectId);
    expect(view?.visible).toBe(false);
    expect(view?.parent?.position.toArray()).toEqual([-6, 0, -6]);
  });
});
