import { type CatalogProvider, type SceneDocument, type Vec2, wallPoint } from '@roomforge/core';

const MARGIN = 0.25;

/**
 * A plan of a document's first room, drawn from the document itself: walls, door and window gaps,
 * each object's footprint (luminaires in their light colour). It is the template's thumbnail, so
 * it can never fall out of date with what the template builds. Decorative: the card names it.
 */
export function TemplatePlan({
  document,
  catalog,
}: {
  document: SceneDocument;
  catalog: CatalogProvider;
}) {
  const roomId = document.roomOrder[0];
  const room = roomId === undefined ? undefined : document.rooms[roomId];
  if (room?.shape.kind !== 'rect') return null;
  const { width, depth } = room.shape;
  const box = { width, depth };
  const from: Vec2 = [0, 0];
  const to: Vec2 = [0, 0];
  return (
    <svg
      aria-hidden="true"
      viewBox={`${-MARGIN} ${-MARGIN} ${width + 2 * MARGIN} ${depth + 2 * MARGIN}`}
      className="h-28 w-full text-fg-muted"
    >
      <rect
        width={width}
        height={depth}
        className="fill-muted stroke-current"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {Object.values(document.openings)
        .filter((opening) => opening.roomId === room.id)
        .map((opening) => {
          wallPoint(box, opening.wall, opening.offset, from);
          wallPoint(box, opening.wall, opening.offset + opening.width, to);
          return (
            <line
              key={opening.id}
              x1={from[0]}
              y1={from[1]}
              x2={to[0]}
              y2={to[1]}
              className="stroke-background"
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      {document.objectOrder.map((id) => {
        const object = document.objects[id];
        const size = object && catalog.getItem(object.catalogId)?.size;
        if (!object || !size || object.roomId !== room.id || object.parentId !== null) return null;
        const [x, , z] = object.transform.position;
        // A turn about +Y is clockwise seen from above, where the plan's y axis is the room's z.
        const degrees = (-object.transform.rotationY * 180) / Math.PI;
        const light = object.light;
        return (
          <rect
            key={id}
            x={x - size.w / 2}
            y={z - size.d / 2}
            width={size.w}
            height={Math.max(size.d, 0.05)}
            transform={`rotate(${degrees} ${x} ${z})`}
            fill={light ? light.color : undefined}
            className={light ? 'stroke-current' : 'fill-card stroke-current'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
