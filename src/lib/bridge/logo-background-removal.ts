export type BackgroundSample = readonly [number, number, number];

export function removeConnectedBackground(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  samples: readonly BackgroundSample[],
  tolerance: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      source.length !== width * height * 4) {
    throw new Error("Invalid image pixel buffer.");
  }
  const pixels = new Uint8ClampedArray(source);
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const limit = Math.max(0, Math.min(100, tolerance)) ** 2 * 3;
  const matches = (index: number) => {
    const offset = index * 4;
    if (pixels[offset + 3] === 0) return true;
    return samples.some(([r, g, b]) => {
      const dr = pixels[offset] - r;
      const dg = pixels[offset + 1] - g;
      const db = pixels[offset + 2] - b;
      return dr * dr + dg * dg + db * db <= limit;
    });
  };
  const add = (index: number) => {
    if (index < 0 || index >= count || visited[index] || !matches(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (index >= width) add(index - width);
    if (index + width < count) add(index + width);
  }
  for (let i = 0; i < count; i++) {
    if (visited[i]) pixels[i * 4 + 3] = 0;
  }
  return pixels;
}
