/**
 * Turns what WebGL reads back (rows from the bottom, colour premultiplied by alpha by the blending
 * over a transparent clear) into what `ImageData` wants (rows from the top, straight alpha), in
 * place: an export can be tens of megabytes, so no second copy is made.
 */
export function toImageRows(pixels: Uint8Array, width: number, height: number): void {
  const stride = width * 4;
  const row = new Uint8Array(stride);
  for (let top = 0, bottom = height - 1; top < bottom; top += 1, bottom -= 1) {
    const a = top * stride;
    const b = bottom * stride;
    row.set(pixels.subarray(a, a + stride));
    pixels.copyWithin(a, b, b + stride);
    pixels.set(row, b);
  }
  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i] as number;
    if (alpha === 255 || alpha === 0) continue;
    const scale = 255 / alpha;
    pixels[i - 3] = Math.min(255, Math.round((pixels[i - 3] as number) * scale));
    pixels[i - 2] = Math.min(255, Math.round((pixels[i - 2] as number) * scale));
    pixels[i - 1] = Math.min(255, Math.round((pixels[i - 1] as number) * scale));
  }
}
