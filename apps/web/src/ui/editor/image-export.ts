/** Image size relative to the viewport. */
export type ImageScale = 1 | 2 | 4;
export const IMAGE_SCALES: readonly ImageScale[] = [1, 2, 4];

export type ImageQuality = 'draft' | 'standard' | 'high';
export const IMAGE_QUALITIES: readonly ImageQuality[] = ['draft', 'standard', 'high'];

export type ImageBackground =
  | { kind: 'viewport' }
  | { kind: 'transparent' }
  | { kind: 'color'; color: string };

export interface ImageExportOptions {
  scale: ImageScale;
  quality: ImageQuality;
  background: ImageBackground;
}

/** The size an export will have on this device. */
export interface ImageExportPlan {
  width: number;
  height: number;
  /** Smaller than the scale asked for (the device's limits). */
  clamped: boolean;
}

export type ImageExportStage = 'rendering' | 'encoding';

export type ImageExportFailure = 'context-lost' | 'too-large' | 'unavailable' | 'failed';

export type ImageExportResult =
  | { ok: true; filename: string }
  | { ok: false; reason: ImageExportFailure };

/**
 * What the export dialog needs from the app (which wires it to the scene): the UI never sees the
 * renderer. `plan` is `null` while there is no view to export.
 */
export interface ImageExporter {
  fileName(): string;
  plan(options: ImageExportOptions): ImageExportPlan | null;
  /** Renders and downloads the PNG; never throws. */
  export(
    options: ImageExportOptions,
    onStage: (stage: ImageExportStage) => void,
  ): Promise<ImageExportResult>;
}

/** Loads the exporter (its code is fetched the first time an image is exported). */
export type ImageExporterLoader = () => Promise<ImageExporter>;
