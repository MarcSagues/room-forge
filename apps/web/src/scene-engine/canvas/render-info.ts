/** The part of `WebGLRenderer.info` we read (structural, so it is testable without WebGL). */
export interface RendererInfoLike {
  readonly render: {
    readonly frame: number;
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  };
  readonly memory: { readonly geometries: number; readonly textures: number };
  readonly programs?: ReadonlyArray<unknown> | null | undefined;
}

/** Counters used by the E2E hook and the dev overlay to verify rendering budgets (ADR-0006). */
export interface RenderInfo {
  /** Increases once per rendered frame: constant while the scene is idle. */
  frame: number;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  /** Compiled shader programs: must not grow when only parameters change (light pool, ADR-0006). */
  programs: number;
}

export function readRenderInfo(info: RendererInfoLike): RenderInfo {
  return {
    frame: info.render.frame,
    calls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  };
}

export function formatRenderInfo(info: RenderInfo): string {
  const tris = info.triangles >= 1000 ? `${(info.triangles / 1000).toFixed(1)}k` : info.triangles;
  return `frame ${info.frame} · calls ${info.calls} · tris ${tris} · geo ${info.geometries} · tex ${info.textures} · prog ${info.programs}`;
}

/** The part of a WebGL context `readGpu` uses. */
export interface GpuContextLike {
  readonly RENDERER: number;
  getExtension(name: 'WEBGL_debug_renderer_info'): { UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(name: number): unknown;
}

/** The graphics card as the browser names it (for bug reports); undefined where it does not say. */
export function readGpu(context: GpuContextLike): string | undefined {
  try {
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const name = context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER);
    return typeof name === 'string' && name !== '' ? name.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}
