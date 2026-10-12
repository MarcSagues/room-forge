import { Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { hideOverlays, markOverlay, OVERLAY_KEY } from './overlay';

describe('editor overlays', () => {
  it('marks an object as an overlay', () => {
    const group = markOverlay(new Group());
    expect(group.userData[OVERLAY_KEY]).toBe(true);
  });

  it('hides only the overlays, and puts back exactly what was visible', () => {
    const scene = new Group();
    const content = new Mesh();
    const grid = markOverlay(new Group());
    const outline = markOverlay(new Mesh());
    const hiddenGhost = markOverlay(new Group());
    hiddenGhost.visible = false;
    scene.add(content, grid, hiddenGhost);
    content.add(outline);

    const restore = hideOverlays(scene);
    expect(content.visible).toBe(true);
    expect(grid.visible).toBe(false);
    expect(outline.visible).toBe(false);
    expect(hiddenGhost.visible).toBe(false);

    restore();
    expect(grid.visible).toBe(true);
    expect(outline.visible).toBe(true);
    // It was hidden before: it stays hidden.
    expect(hiddenGhost.visible).toBe(false);
  });
});
