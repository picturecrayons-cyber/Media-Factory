import assert from "node:assert/strict";
import test from "node:test";
import { removeConnectedBackground } from "./logo-background-removal.ts";

function grid(width: number, height: number, color: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(color, i * 4);
  return pixels;
}

function pixel(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
}

test("removes edge-connected flat background and preserves enclosed logo pixels", () => {
  const width = 5, height = 5;
  const source = grid(width, height, [255, 255, 255, 255]);
  source.set([20, 40, 180, 255], (2 * width + 2) * 4);
  const output = removeConnectedBackground(source, width, height, [[255, 255, 255]], 0);
  assert.equal(pixel(output, width, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, width, 2, 2), [20, 40, 180, 255]);
});

test("removes checkerboard background when both corner colours are sampled", () => {
  const width = 5, height = 5;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    source.set((x + y) % 2 ? [245, 245, 245, 255] : [220, 220, 220, 255], (y * width + x) * 4);
  }
  source.set([15, 60, 160, 255], (2 * width + 2) * 4);
  const output = removeConnectedBackground(source, width, height, [[220, 220, 220], [245, 245, 245]], 0);
  assert.equal(pixel(output, width, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, width, 2, 2), [15, 60, 160, 255]);
});

test("tolerance removes connected near-background pixels only when threshold allows", () => {
  const width = 3, height = 3;
  const source = grid(width, height, [100, 100, 100, 255]);
  source.set([106, 106, 106, 255], (1 * width + 1) * 4);
  const strict = removeConnectedBackground(source, width, height, [[100, 100, 100]], 0);
  const soft = removeConnectedBackground(source, width, height, [[100, 100, 100]], 10);
  assert.equal(pixel(strict, width, 1, 1)[3], 255);
  assert.equal(pixel(soft, width, 1, 1)[3], 0);
});

test("does not mutate the source pixel buffer", () => {
  const source = grid(2, 2, [255, 255, 255, 255]);
  const before = new Uint8ClampedArray(source);
  removeConnectedBackground(source, 2, 2, [[255, 255, 255]], 0);
  assert.deepEqual(source, before);
});
