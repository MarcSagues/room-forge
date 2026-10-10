import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureError, type SceneImageApi } from '@/scene-engine';
import { createImageExporter } from './image-exporter';

const OPTIONS = { scale: 1, quality: 'draft', background: { kind: 'transparent' } } as const;

function apiWith(capture: SceneImageApi['capture']): SceneImageApi {
  return {
    viewportSize: () => ({ width: 400, height: 300 }),
    limits: () => ({ maxSide: 4096, maxSamples: 4 }),
    backdrop: () => '#000',
    capture,
  };
}

const blankCapture: SceneImageApi['capture'] = async ({ width, height }) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

function fakeCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: () => {},
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['png'], { type: 'image/png' })),
  );
  vi.stubGlobal('ImageData', class {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createImageExporter', () => {
  it('plans from the scene and names the file as the app says', async () => {
    const exporter = await createImageExporter({
      imageApi: async () => apiWith(blankCapture),
      fileName: () => 'gaming-room-2026-10-10.png',
      download: () => {},
    });
    expect(exporter.fileName()).toBe('gaming-room-2026-10-10.png');
    expect(exporter.plan({ ...OPTIONS, scale: 2 })).toEqual({
      width: 800,
      height: 600,
      clamped: false,
    });
  });

  it('downloads the PNG it rendered', async () => {
    fakeCanvas();
    const download = vi.fn();
    const exporter = await createImageExporter({
      imageApi: async () => apiWith(blankCapture),
      fileName: () => 'office-2026-01-02.png',
      download,
    });
    const result = await exporter.export(OPTIONS, () => {});
    expect(result).toEqual({ ok: true, filename: 'office-2026-01-02.png' });
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'office-2026-01-02.png');
  });

  it('reports why nothing was exported, without throwing', async () => {
    const download = vi.fn();
    const none = await createImageExporter({
      imageApi: async () => null,
      fileName: () => 'x.png',
      download,
    });
    expect(none.plan(OPTIONS)).toBeNull();
    expect(await none.export(OPTIONS, () => {})).toEqual({ ok: false, reason: 'unavailable' });

    const lost = await createImageExporter({
      imageApi: async () =>
        apiWith(async () => {
          throw new CaptureError('context-lost', 'lost');
        }),
      fileName: () => 'x.png',
      download,
    });
    expect(await lost.export(OPTIONS, () => {})).toEqual({ ok: false, reason: 'context-lost' });
    expect(download).not.toHaveBeenCalled();
  });
});
