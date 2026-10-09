'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { useTransientStore } from '../canvas/scene-context';
import { placeholderResources } from '../objects/placeholder-resources';
import { outlineGeometry } from './outline-geometry';
import { tokenColor } from './token-color';

/** The edges are drawn a little larger than the fill so the two do not z-fight. */
const INFLATE = 1.01;

/**
 * The ghost of an item being dragged in from the catalog: a translucent box in the item's own
 * colour with accent edges, at the floor position `PlaceController` solved; red when the item
 * cannot be placed there. Fill and edges are two shared-geometry objects stretched and moved every
 * rendered frame from the transient store, and shown or hidden with `visible` (AGENTS rule 7).
 */
export function PlacementGhost() {
  const transient = useTransientStore();
  const parts = useMemo(() => {
    const accent = new Color(tokenColor('--accent', '#ff7a45'));
    const danger = new Color(tokenColor('--danger', '#f2555a'));
    const fillMaterial = new MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const edgeMaterial = new LineBasicMaterial({ color: accent, depthTest: false });
    const fill = new Mesh(placeholderResources().geometry, fillMaterial);
    const edges = new LineSegments(outlineGeometry(), edgeMaterial);
    fill.renderOrder = 5;
    edges.renderOrder = 10;
    const group = new Group();
    group.add(fill, edges);
    group.visible = false;
    // The item's colour, parsed again only when it changes.
    return {
      group,
      fill,
      edges,
      fillMaterial,
      edgeMaterial,
      accent,
      danger,
      itemColor: new Color(),
    };
  }, []);

  useEffect(
    () => () => {
      parts.fillMaterial.dispose();
      parts.edgeMaterial.dispose();
    },
    [parts],
  );

  const shownColor = useRef<string | null | undefined>(undefined);
  useFrame(() => {
    const { group, fill, edges, fillMaterial, edgeMaterial } = parts;
    const ghost = transient.ghost();
    if (!ghost?.visible) {
      group.visible = false;
      return;
    }
    group.position.set(ghost.x, 0, ghost.z);
    group.rotation.y = ghost.rotationY;
    fill.scale.set(ghost.w, ghost.h, ghost.d);
    edges.scale.set(ghost.w * INFLATE, ghost.h * INFLATE, ghost.d * INFLATE);
    if (ghost.color !== shownColor.current) {
      shownColor.current = ghost.color;
      if (ghost.color) parts.itemColor.set(ghost.color);
    }
    const base = ghost.color ? parts.itemColor : parts.accent;
    fillMaterial.color.copy(ghost.valid ? base : parts.danger);
    edgeMaterial.color.copy(ghost.valid ? parts.accent : parts.danger);
    group.visible = true;
  });

  return <primitive object={parts.group} />;
}
