import assert from "node:assert/strict";
import test from "node:test";
import {
  canRequestPublishingGatewayRelease,
  initialPublishingGatewayState,
  publishingGatewayIsReady,
  type PublishingGatewayGate,
} from "./publishing-gateway-policy.ts";

const passed: PublishingGatewayGate[] = [
  { id: "ci", label: "GitHub Actions", status: "VERIFIED", detail: "Passed" },
  { id: "artifacts", label: "Build artifacts", status: "VERIFIED", detail: "Present" },
  { id: "vercel", label: "Vercel Production", status: "VERIFIED", detail: "Ready" },
  { id: "domains", label: "Custom domains", status: "VERIFIED", detail: "Attached" },
  { id: "smoke", label: "End-to-end smoke tests", status: "VERIFIED", detail: "Passed" },
];

test("gateway release defaults to HOLD", () => {
  assert.deepEqual(initialPublishingGatewayState(), {
    releaseStatus: "HOLD",
    ready: false,
    note: "Production release remains on HOLD until every required check is verified.",
  });
});

test("readiness requires every required gate to be verified", () => {
  assert.equal(publishingGatewayIsReady(passed), true);
  assert.equal(publishingGatewayIsReady([]), false);
  assert.equal(publishingGatewayIsReady(passed.map((gate) => gate.id === "smoke" ? { ...gate, status: "UNVERIFIED" as const } : gate)), false);
});

test("only a super admin with explicit approval and all verified gates may request release", () => {
  assert.equal(canRequestPublishingGatewayRelease({ role: "super_admin", explicitApproval: true, gates: passed }), true);
  assert.equal(canRequestPublishingGatewayRelease({ role: "admin", explicitApproval: true, gates: passed }), false);
  assert.equal(canRequestPublishingGatewayRelease({ role: "super_admin", explicitApproval: false, gates: passed }), false);
  assert.equal(canRequestPublishingGatewayRelease({ role: "super_admin", explicitApproval: true, gates: passed.map((gate) => gate.id === "artifacts" ? { ...gate, status: "BLOCKED" as const } : gate) }), false);
});
