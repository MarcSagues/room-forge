import { describe, expect, it } from 'vitest';
import { formatRenderInfo, type RendererInfoLike, readRenderInfo } from './render-info';

const info: RendererInfoLike = {
  render: { frame: 7, calls: 12, triangles: 2400, points: 0, lines: 4 },
  memory: { geometries: 5, textures: 2 },
  programs: [{}, {}, {}],
};

describe('readRenderInfo', () => {
  it('flattens the renderer counters', () => {
    expect(readRenderInfo(info)).toEqual({
      frame: 7,
      calls: 12,
      triangles: 2400,
      points: 0,
      lines: 4,
      geometries: 5,
      textures: 2,
      programs: 3,
    });
  });

  it('treats missing programs as zero', () => {
    expect(readRenderInfo({ ...info, programs: null }).programs).toBe(0);
    expect(readRenderInfo({ ...info, programs: undefined }).programs).toBe(0);
  });
});

describe('formatRenderInfo', () => {
  it('abbreviates large triangle counts', () => {
    expect(formatRenderInfo(readRenderInfo(info))).toBe(
      'frame 7 · calls 12 · tris 2.4k · geo 5 · tex 2 · prog 3',
    );
    expect(
      formatRenderInfo(readRenderInfo({ ...info, render: { ...info.render, triangles: 12 } })),
    ).toContain('tris 12 ');
  });
});
