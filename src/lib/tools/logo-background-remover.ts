export type BackgroundRemovalOptions = { tolerance: number };

/**
 * Removes edge-connected pixels that match colours sampled from the image border.
 * This supports both flat backgrounds and checkerboards with multiple border colours.
 * The caller owns the ImageData; the input is not mutated.
 */
export function removeLogoBackground(
  source: ImageData,
  options: BackgroundRemovalOptions,
): ImageData {
  const { width, height, data } = source;
  if (!width || !height || data.length !== width * height * 4) {
    throw new Error("Invalid image data");
  }

  const tolerance = Math.max(0, Math.min(255, Math.round(options.tolerance)));
  const pixelCount = width * height;
  const output = { data: new Uint8ClampedArray(data), width, height } as ImageData;
  const pixels = output.data;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const edgeColours: Array<[number, number, number]> = [];

  const addEdgeColour = (index: number) => {
    const offset = index * 4;
    const colour: [number, number, number] = [data[offset], data[offset + 1], data[offset + 2]];
    if (!edgeColours.some(([r, g, b]) =>
      Math.abs(r - colour[0]) <= 2 &&
      Math.abs(g - colour[1]) <= 2 &&
      Math.abs(b - colour[2]) <= 2
    )) edgeColours.push(colour);
  };

  for (let x = 0; x < width; x++) {
    addEdgeColour(x);
    addEdgeColour((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    addEdgeColour(y * width);
    addEdgeColour(y * width + width - 1);
  }

  const matchesBackground = (index: number) => {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    return edgeColours.some(([er, eg, eb]) =>
      Math.max(Math.abs(r - er), Math.abs(g - eg), Math.abs(b - eb)) <= tolerance
    );
  };

  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (visited[index] || !matchesBackground(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = index * 4;
    pixels[offset + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return output;
}
