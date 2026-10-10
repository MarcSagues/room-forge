import ReactThreeTestRenderer from '@react-three/test-renderer';
import { createEditorSession, type PlacedObject, type SceneDocument } from '@roomforge/core';
import { buildDocument, buildObject, buildRoom } from '@roomforge/core/testing';
import { BufferGeometry, type Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SceneCatalog } from '../canvas/scene-catalog';
import { SceneSessionProvider } from '../canvas/scene-context';
import { MaterialsProvider } from '../materials/materials-context';
import type { ModelPart } from '../resources/model-registry';
import { ModelsProvider } from '../resources/models-context';
import { EntityRegistryProvider } from './entity-registry';
import { ObjectList } from './object-views';

const { act, create } = ReactThreeTestRenderer;

const DESK = 'desk.test';
const catalog: SceneCatalog = {
  getItem: (id) =>
    id === DESK
      ? {
          id,
          size: { w: 1.4, h: 0.75, d: 0.7 },
          placement: { surfaces: ['floor'] },
          slots: [
            { id: 'top', default: { presetId: 'paint.satin', tint: '#c6a47d' } },
            { id: 'frame', default: { presetId: 'paint.satin', tint: '#252c39' } },
          ],
        }
      : undefined,
  colorOf: () => '#c6a47d',
  modelUrlOf: (id) => (id === DESK ? '/assets/models/desk.test.glb' : undefined),
};

function documentWith(objects: PlacedObject[]): SceneDocument {
  const room = buildRoom({ shape: { kind: 'rect', width: 6, depth: 6 }, origin: [0, 0] });
  return {
    ...buildDocument(),
    rooms: { [room.id]: room },
    roomOrder: [room.id],
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    objectOrder: objects.map((o) => o.id),
  };
}

const desk = (id: string, x: number, materials: PlacedObject['materials'] = {}) =>
  buildObject({
    id,
    catalogId: DESK,
    transform: { position: [x, 0, 1], rotationY: 0 },
    materials,
  });

async function mount(objects: PlacedObject[], load: (url: string) => Promise<ModelPart[]>) {
  const session = createEditorSession({ initialDocument: documentWith(objects), catalog });
  const renderer = await create(
    <SceneSessionProvider session={session} catalog={catalog}>
      <MaterialsProvider>
        <ModelsProvider load={load}>
          <EntityRegistryProvider>
            <ObjectList />
          </EntityRegistryProvider>
        </ModelsProvider>
      </MaterialsProvider>
    </SceneSessionProvider>,
  );
  const meshes = () =>
    renderer.scene.findAll((node) => node.type === 'Mesh').map((node) => node.instance as Mesh);
  return { renderer, session, meshes };
}

const parts = (): ModelPart[] => [
  { slot: 'top', geometry: new BufferGeometry() },
  { slot: 'frame', geometry: new BufferGeometry() },
];

describe('ModelBody', () => {
  it('shows the placeholder until the model arrives, then the model with shared resources', async () => {
    let resolve: (value: ModelPart[]) => void = () => {};
    const load = vi.fn(() => new Promise<ModelPart[]>((done) => (resolve = done)));
    const { meshes } = await mount(
      [desk('a', 1), desk('b', 3), desk('c', 5, { top: { presetId: 'wood.oak' } })],
      load,
    );
    expect(load).toHaveBeenCalledTimes(1); // three objects, one download
    expect(meshes().map((mesh) => mesh.visible)).toEqual([true, true, true]);

    const model = parts();
    await act(async () => resolve(model));
    const visible = meshes().filter((mesh) => mesh.visible);
    expect(visible).toHaveLength(6); // two parts per desk; the placeholders are hidden
    expect(meshes()).toHaveLength(9);
    const tops = visible.filter((mesh) => mesh.geometry === model[0]?.geometry);
    expect(tops).toHaveLength(3); // one geometry for every desk
    const [a, b, c] = tops.map((mesh) => mesh.material);
    expect(a).toBe(b); // same look, same material
    expect(c).not.toBe(a); // the override in PlacedObject.materials
  });

  it('keeps the placeholder when the model cannot be loaded', async () => {
    const { meshes } = await mount([desk('a', 1)], () => Promise.reject(new Error('404')));
    await act(async () => {});
    expect(meshes()).toHaveLength(1);
    expect(meshes()[0]?.visible).toBe(true);
  });

  it('frees the geometries when the last object showing them goes', async () => {
    const model = parts();
    const disposed = model.map((part) => vi.spyOn(part.geometry, 'dispose'));
    const { session } = await mount([desk('a', 1), desk('b', 3)], async () => model);
    await act(async () => {});
    const remove = (id: string) => ({
      type: 'test/remove',
      label: 'Remove',
      apply(draft: SceneDocument) {
        delete draft.objects[id as never];
        draft.objectOrder = draft.objectOrder.filter((other) => other !== id);
      },
    });
    await act(async () => void session.execute(remove('a')));
    expect(disposed.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    await act(async () => void session.execute(remove('b')));
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
