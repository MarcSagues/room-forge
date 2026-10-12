import { describe, expect, it } from 'vitest';
import {
  formatRenderInfo,
  type GpuContextLike,
  type RendererInfoLike,
  readGpu,
  readRenderInfo,
} from './render-info';

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

describe('readGpu', () => {
  const context = (debug: boolean, names: Record<number, unknown>): GpuContextLike => ({
    RENDERER: 1,
    getExtension: () => (debug ? { UNMASKED_RENDERER_WEBGL: 2 } : null),
    getParameter: (name) => names[name],
  });

  it('prefers the unmasked renderer, and falls back to the plain one', () => {
    expect(readGpu(context(true, { 1: 'WebKit WebGL', 2: 'ANGLE (Test GPU)' }))).toBe(
      'ANGLE (Test GPU)',
    );
    expect(readGpu(context(false, { 1: 'WebKit WebGL' }))).toBe('WebKit WebGL');
  });

  it('says nothing when the browser does not tell, or fails', () => {
    expect(readGpu(context(false, { 1: '' }))).toBeUndefined();
    expect(
      readGpu({
        RENDERER: 1,
        getExtension: () => {
          throw new Error('lost');
        },
        getParameter: () => null,
      }),
    ).toBeUndefined();
  });
});
