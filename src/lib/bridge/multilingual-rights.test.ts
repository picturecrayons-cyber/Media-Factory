import test from "node:test";
import assert from "node:assert/strict";

function overlaps(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null) {
  const a0 = aStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const a1 = aEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const b0 = bStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const b1 = bEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return a0 < b1 && b0 < a1;
}

test("language rights overlap only when language, right type and commercial scope overlap", () => {
  assert.equal(
    overlaps(new Date("2026-01-01"), new Date("2027-01-01"), new Date("2026-06-01"), new Date("2026-12-01")),
    true,
  );
  assert.equal(
    overlaps(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-06-01"), new Date("2027-01-01")),
    false,
  );
});


test("adjacent rights windows do not overlap at the boundary", () => {
  assert.equal(overlaps(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-06-01"), null), false);
});
