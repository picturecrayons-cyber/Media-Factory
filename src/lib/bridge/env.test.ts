import { afterEach, describe, expect, it } from "vitest";
import { bridgeEnv } from "./env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("bridgeEnv.appUrl", () => {
  it("falls back to the canonical Bridge production origin", () => {
    delete process.env.APP_URL;
    delete process.env.SITE_URL;
    expect(bridgeEnv.appUrl()).toBe("https://www.crayonspictures.in");
  });

  it("rejects retired StreamVista verification origins", () => {
    process.env.APP_URL = "https://bridge.streamvista.in";
    expect(bridgeEnv.appUrl()).toBe("https://www.crayonspictures.in");
  });

  it("normalizes an explicitly configured current origin", () => {
    process.env.APP_URL = "https://www.crayonspictures.in/";
    expect(bridgeEnv.appUrl()).toBe("https://www.crayonspictures.in");
  });
});
