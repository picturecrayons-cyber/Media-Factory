import { describe, expect, it } from "vitest";
import type { DeliveryTrace } from "./deliveries";

describe("delivery trace contract", () => {
  it("keeps buyer, investor and settlement roles distinct", () => {
    const row: DeliveryTrace = {
      titleId: "title-12345678",
      titleName: "Pranayam 1947",
      language: "Malayalam",
      year: 2024,
      creator: "Crayons Pictures",
      destinations: [{
        id: "delivery-1",
        buyer: "Crayons Loop",
        state: "READY",
        territories: ["WORLDWIDE"],
        languages: ["Malayalam"],
        media: ["OTT"],
        windowStart: null,
        windowEnd: null,
      }],
      investorCount: 2,
      settlementStatus: "PENDING",
    };
    expect(row.destinations[0].buyer).toBe("Crayons Loop");
    expect(row.investorCount).toBe(2);
    expect(row.settlementStatus).toBe("PENDING");
  });
});
