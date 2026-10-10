import type { SceneImageApi } from '@/scene-engine';
import {
  type ImageErrorCode,
  ImageExportError,
  type ImageOptions,
  planFor,
  renderPng,
} from './export-image';

/** Why nothing was exported: an export error, or no view to export yet. */
export type ImageExportFailure = ImageErrorCode | 'unavailable';

export type ImageExportResult =
  | { ok: true; filename: string }
  | { ok: false; reason: ImageExportFailure };

/** The PNG export as the export dialog uses it (the UI declares the same shape). */
export interface ImageExporter {
  fileName(): string;
  plan(options: ImageOptions): { width: number; height: number; clamped: boolean } | null;
  export(
    options: ImageOptions,
    onStage: (stage: 'rendering' | 'encoding') => void,
  ): Promise<ImageExportResult>;
}

export interface ImageExporterDeps {
  /** The scene's image API; `null` while no canvas is mounted. Asked again for every export. */
  imageApi: () => Promise<SceneImageApi | null>;
  /** The file name for an image made now (`slug-date.png`). */
  fileName: () => string;
  download: (blob: Blob, filename: string) => void;
}

/**
 * The PNG export the top bar offers, wired to the scene by the app. This module is loaded the
 * first time the dialog opens, so the editor starts without it. Never throws: failures are
 * results the dialog explains.
 */
export async function createImageExporter(deps: ImageExporterDeps): Promise<ImageExporter> {
  let api = await deps.imageApi();
  return {
    fileName: deps.fileName,
    plan: (options) => {
      if (!api) return null;
      const { width, height, clamped } = planFor(api, options);
      return { width, height, clamped };
    },
    export: async (options, onStage) => {
      api = await deps.imageApi();
      if (!api) return { ok: false, reason: 'unavailable' };
      try {
        const image = await renderPng(api, options, onStage);
        const filename = deps.fileName();
        deps.download(image.blob, filename);
        return { ok: true, filename };
      } catch (error) {
        return { ok: false, reason: error instanceof ImageExportError ? error.code : 'failed' };
      }
    },
  };
}
