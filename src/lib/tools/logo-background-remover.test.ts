import assert from "node:assert/strict";
import testCase from "node:test";
import { removeLogoBackground } from "./logo-background-remover.ts";

testCase("removes a flat edge-connected background and preserves a different centre pixel", () => {
  const image = new ImageData(3, 3);
  for (let i = 0; i < 9; i++) {
    image.data.set([240, 240, 240, 255], i * 4);
  }
  image.data.set([80, 30, 160, 255], 4 * 4);
  const result = removeLogoBackground(image, { tolerance: 34 });
  assert.equal(result.data[3], 0);
  assert.equal(result.data[4 * 4 + 3], 255);
});

testCase("removes both checkerboard colours connected to the image edge", () => {
  const image = new ImageData(4, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const offset = (y * 4 + x) * 4;
      const shade = (x + y) % 2 ? 220 : 245;
      image.data.set([shade, shade, shade, 255], offset);
    }
  }
  image.data.set([120, 40, 180, 255], (1 * 4 + 1) * 4);
  const result = removeLogoBackground(image, { tolerance: 34 });
  assert.equal(result.data[3], 0);
  assert.equal(result.data[(1 * 4 + 1) * 4 + 3], 255);
});
