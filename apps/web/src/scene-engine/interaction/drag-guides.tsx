'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import { useSceneSession, useTransientStore } from '../canvas/scene-context';
import { tokenColor } from './token-color';
import { type GuidePose, wallGuidePose } from './wall-guide';

const DASHES = 40;
/** Dash width on the floor (metres): GL lines are always 1 px, too thin to see. */
const DASH_WIDTH = 0.05;
/** Just above the floor so the dashes do not z-fight with it. */
const LIFT = 0.012;

/**
 * Dashes along +x over 0..1, one flat rectangle each: one shared geometry, stretched in x to each
 * wall's length (the width along z stays the same).
 */
let dashes: BufferGeometry | undefined;
const dashGeometry = () => {
  if (!dashes) {
    const half = DASH_WIDTH / 2;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < DASHES; i += 1) {
      const from = i / DASHES;
      const to = (i + 0.5) / DASHES;
      positions.push(from, 0, -half, to, 0, -half, to, 0, half, from, 0, half);
      const base = i * 4;
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    dashes = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setIndex(indices);
  }
  return dashes;
};

const pose: GuidePose = { x: 0, z: 0, length: 0, rotationY: 0 };

/**
 * While an object is dragged and snapped to a wall, a dashed accent line marks that wall's base.
 * One line object is stretched and turned onto the wall every rendered frame: nothing is mounted
 * or allocated when the drag starts or ends (AGENTS rules 3 and 7).
 */
export function DragGuides() {
  const session = useSceneSession();
  const transient = useTransientStore();
  const line = useMemo(() => {
    // Opaque and writing depth: opaque objects draw nearest-first, so without depth writes the
    // floor behind the dashes would be drawn afterwards and cover them.
    const material = new MeshBasicMaterial({
      color: tokenColor('--accent', '#ff7a45'),
      side: DoubleSide,
    });
    const guide = new Mesh(dashGeometry(), material);
    guide.visible = false;
    guide.position.y = LIFT;
    return guide;
  }, []);

  useEffect(() => () => line.material.dispose(), [line]);

  useFrame(() => {
    const drag = transient.drag();
    const { document } = session.getState();
    const object = drag?.wall ? document.objects[drag.id] : undefined;
    const room = object ? document.rooms[object.roomId] : undefined;
    if (!drag?.wall || !room) {
      line.visible = false;
      return;
    }
    const [originX, originZ] = room.origin;
    wallGuidePose(drag.wall, room.shape.width, room.shape.depth, originX, originZ, pose);
    line.position.x = pose.x;
    line.position.z = pose.z;
    line.rotation.y = pose.rotationY;
    line.scale.x = pose.length;
    line.visible = true;
  });

  return <primitive object={line} />;
}
