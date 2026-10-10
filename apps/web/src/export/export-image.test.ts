import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureError, type CaptureRequest, type SceneImageApi } from '@/scene-engine';
import { ImageExportError, renderPng } from './export-image';

function fakeSource(capture?: SceneImageApi['capture']) {
  const requests: CaptureRequest[] = [];
  const source: SceneImageApi = {
    viewportSize: () => ({ width: 300, height: 200 }),
    limits: () => ({ maxSide: 4096, maxSamples: 4 }),
    backdrop: () => 'rgb(1, 2, 3)',
    capture:
      capture ??
      (async (request) => {
        requests.push(request);
        return {
          width: request.width,
          height: request.height,
          data: new Uint8ClampedArray(request.width * request.height * 4),
        };
      }),
  };
  return { source, requests };
}

/** happy-dom has no 2D canvas: record what is drawn instead. */
function fakeCanvas() {
  const calls: string[] = [];
  const context = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    putImageData: () => calls.push('put'),
    fillRect: () => calls.push(`fill ${context.fillStyle} ${context.globalCompositeOperation}`),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['png'], { type: 'image/png' })),
  );
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderPng', () => {
  it('renders the planned size, then encodes it over the viewport backdrop', async () => {
    const calls = fakeCanvas();
    const { source, requests } = fakeSource();
    const stages: string[] = [];
    const image = await renderPng(
      source,
      { scale: 2, quality: 'standard', background: { kind: 'viewport' } },
      (stage) => stages.push(stage),
    );
    expect(requests).toEqual([
      { width: 600, height: 400, samples: 4, transparent: false, lighting: 'current' },
    ]);
    expect(stages).toEqual(['rendering', 'encoding']);
    expect(image).toMatchObject({ width: 600, height: 400 });
    expect(image.blob.type).toBe('image/png');
    expect(calls).toEqual(['put', 'fill rgb(1, 2, 3) destination-over']);
  });

  it('keeps transparency, or paints the chosen colour', async () => {
    const calls = fakeCanvas();
    const { source, requests } = fakeSource();
    await renderPng(source, { scale: 1, quality: 'draft', background: { kind: 'transparent' } });
    expect(requests[0]).toMatchObject({ transparent: true, samples: 0 });
    expect(calls).toEqual(['put']);

    calls.length = 0;
    await renderPng(source, {
      scale: 1,
      quality: 'high',
      background: { kind: 'color', color: '#ff0000' },
    });
    expect(calls).toEqual(['put', 'fill #ff0000 destination-over']);
  });

  it('turns a capture failure into an export error with the same reason', async () => {
    fakeCanvas();
    const { source } = fakeSource(async () => {
      throw new CaptureError('context-lost', 'lost');
    });
    await expect(
      renderPng(source, { scale: 1, quality: 'draft', background: { kind: 'viewport' } }),
    ).rejects.toMatchObject({ name: 'ImageExportError', code: 'context-lost' });

    const broken = fakeSource(async () => {
      throw new Error('boom');
    });
    await expect(
      renderPng(broken.source, { scale: 1, quality: 'draft', background: { kind: 'viewport' } }),
    ).rejects.toBeInstanceOf(ImageExportError);
  });

  it('says the image is too large when the browser cannot encode it', async () => {
    fakeCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
    const { source } = fakeSource();
    await expect(
      renderPng(source, { scale: 1, quality: 'draft', background: { kind: 'viewport' } }),
    ).rejects.toMatchObject({ code: 'too-large' });
  });
});
