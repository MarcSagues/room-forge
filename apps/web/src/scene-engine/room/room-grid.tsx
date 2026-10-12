'use client';

import { useMemo } from 'react';
import { OVERLAY_KEY } from '../canvas/overlay';
import { useLineGeometry } from './buffer-geometry';
import { buildGridLines } from './grid-lines';

/** Editing grid over the interior: fine lines every 10 cm, emphasised every metre. */
export function RoomGrid({ width, depth }: { width: number; depth: number }) {
  const lines = useMemo(() => buildGridLines(width, depth), [width, depth]);
  const minor = useLineGeometry(lines.minor);
  const major = useLineGeometry(lines.major);
  // A hair above the floor so the lines never z-fight with it; they do not write depth. It is an
  // editing aid, so an exported image leaves it out.
  return (
    <group position={[0, 0.002, 0]} userData={{ [OVERLAY_KEY]: true }}>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color="#7f889b" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color="#7f889b" transparent opacity={0.4} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
