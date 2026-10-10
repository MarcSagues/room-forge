import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_QUALITIES,
  IMAGE_SCALES,
  MAX_IMAGE_PIXELS,
  MAX_SAMPLED_PIXELS,
  planImage,
} from './image-plan';

const GPU = { maxSide: 8192, maxSamples: 8 };

describe('planImage', () => {
  it('multiplies the viewport by the scale when it fits', () => {
    expect(
      planImage({
        viewport: { width: 1280, height: 720 },
        scale: 2,
        quality: 'standard',
        limits: GPU,
      }),
    ).toEqual({
      width: 2560,
      height: 1440,
      requestedWidth: 2560,
      requestedHeight: 1440,
      clamped: false,
      samples: 4,
    });
  });

  it('degrades to the longest side the GPU supports, keeping the aspect', () => {
    const plan = planImage({
      viewport: { width: 1200, height: 600 },
      scale: 4,
      quality: 'standard',
      limits: { maxSide: 2048, maxSamples: 4 },
    });
    expect(plan).toMatchObject({ width: 2048, height: 1024, clamped: true });
    expect(plan.requestedWidth).toBe(4800);
  });

  it('keeps within the pixel budget', () => {
    const plan = planImage({
      viewport: { width: 1920, height: 1080 },
      scale: 4,
      quality: 'standard',
      limits: GPU,
    });
    expect(plan.clamped).toBe(true);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
    expect(plan.width / plan.height).toBeCloseTo(1920 / 1080, 2);
  });

  it('maps quality to MSAA samples within what the GPU has', () => {
    const at = (quality: 'draft' | 'standard' | 'high', maxSamples: number) =>
      planImage({
        viewport: { width: 800, height: 600 },
        scale: 1,
        quality,
        limits: { maxSide: 4096, maxSamples },
      }).samples;
    expect(at('draft', 8)).toBe(0);
    expect(at('standard', 8)).toBe(4);
    expect(at('high', 8)).toBe(8);
    expect(at('high', 4)).toBe(4);
    expect(at('standard', 0)).toBe(0);
  });

  it('lowers the samples of very large images', () => {
    const plan = planImage({
      viewport: { width: 1024, height: 1024 },
      scale: 4,
      quality: 'high',
      limits: GPU,
    });
    expect(plan.samples).toBe(2);
  });

  it('always gives a whole size within every limit (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.constantFrom(...IMAGE_SCALES),
        fc.constantFrom(...IMAGE_QUALITIES),
        fc.integer({ min: 1, max: 16384 }),
        fc.integer({ min: 0, max: 16 }),
        (w, h, scale, quality, maxSide, maxSamples) => {
          const plan = planImage({
            viewport: { width: w, height: h },
            scale,
            quality,
            limits: { maxSide, maxSamples },
          });
          expect(Number.isInteger(plan.width) && Number.isInteger(plan.height)).toBe(true);
          expect(plan.width).toBeGreaterThanOrEqual(1);
          expect(plan.height).toBeGreaterThanOrEqual(1);
          expect(plan.width).toBeLessThanOrEqual(maxSide);
          expect(plan.height).toBeLessThanOrEqual(maxSide);
          expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
          expect(plan.samples).toBeLessThanOrEqual(maxSamples);
          expect(plan.width * plan.height * plan.samples).toBeLessThanOrEqual(MAX_SAMPLED_PIXELS);
          expect(plan.clamped).toBe(
            plan.width < plan.requestedWidth || plan.height < plan.requestedHeight,
          );
        },
      ),
    );
  });
});
