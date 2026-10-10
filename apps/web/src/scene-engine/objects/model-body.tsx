'use client';

import { useThree } from '@react-three/fiber';
import {
  DEFAULT_MATERIAL_PRESET_ID,
  type DeepReadonly,
  glowColor,
  lightStateOf,
  type MaterialRef,
  type ObjectId,
} from '@roomforge/core';
import { useLayoutEffect } from 'react';
import type { BufferGeometry, Material } from 'three';
import { useSceneCatalog } from '../canvas/scene-context';
import { useMaterial } from '../materials/use-material';
import { useModel } from '../resources/models-context';
import { useEntity } from './entity-hooks';
import type { ObjectSize } from './placeholder-resources';

const FALLBACK: MaterialRef = { presetId: DEFAULT_MATERIAL_PRESET_ID };

/**
 * An object drawn with its catalog model (P4-04). The placeholder box stays while the model loads
 * or when it cannot be loaded, and is hidden (not unmounted, rule 7) once the model is there.
 * Every part shares its geometry with all objects of the item and its material with all parts of
 * the same look (rule 6); an override in `PlacedObject.materials` replaces a slot's default. A
 * luminaire's light slot glows with its light state (colour, intensity, off), shared by state.
 */
export function ModelBody(props: {
  id: ObjectId;
  catalogId: string;
  url: string;
  size: ObjectSize;
  placeholder: { geometry: BufferGeometry; material: Material };
}) {
  const { id, catalogId, url, size, placeholder } = props;
  const { status, parts } = useModel(url);
  const overrides = useEntity(id, (object) => object.materials);
  const item = useSceneCatalog().getItem(catalogId);
  const slots = item?.slots;
  const light = useEntity(id, (object) => object.light);
  const glow = item?.light ? glowColor(lightStateOf({ light }, item)) : undefined;
  const invalidate = useThree((state) => state.invalidate);
  // The meshes changed outside any frame: ask for one once they are in the scene.
  useLayoutEffect(() => {
    if (status !== 'loading') invalidate();
  }, [status, invalidate]);
  return (
    <>
      <mesh
        geometry={placeholder.geometry}
        material={placeholder.material}
        scale={[size.w, size.h, size.d]}
        visible={status !== 'ready'}
        dispose={null}
      />
      {parts?.map((part) => {
        const slot = slots?.find((candidate) => candidate.id === part.slot);
        return (
          <SlotMesh
            key={part.slot}
            geometry={part.geometry}
            look={overrides?.[part.slot] ?? slot?.default ?? FALLBACK}
            emissive={slot?.emissive === true}
            glow={glow}
          />
        );
      })}
    </>
  );
}

/** One slot of a model; a luminaire's light slot glows (P4-10) in the colour of its light (P5-05). */
function SlotMesh({
  geometry,
  look,
  emissive,
  glow,
}: {
  geometry: BufferGeometry;
  look: DeepReadonly<MaterialRef>;
  emissive: boolean;
  glow: string | undefined;
}) {
  const material = useMaterial(look, { emissive }, emissive ? glow : undefined);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (material) invalidate();
  }, [material, invalidate]);
  if (!material) return null;
  return <mesh geometry={geometry} material={material} dispose={null} />;
}
