import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTechnicalQc } from "./technical-qc.ts";

const validProbe = {
  format: { duration: "5400.25", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [
    { index: 0, codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/1" },
    { index: 1, codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" },
  ],
};

test("valid probe metadata returns PASS but explicitly retains non-metadata limitations", () => {
  const report = evaluateTechnicalQc({ assetId: "asset-12345678", policyId: "festival-default-v1", probe: validProbe });
  assert.equal(report.status, "PASS");
  assert.equal(report.summary.width, 1920);
  assert.equal(report.summary.frameRate, 25);
  assert.ok(report.limitations.some((item) => item.includes("not artistic approval")));
});

test("missing video/audio and unreadable duration fail closed", () => {
  const report = evaluateTechnicalQc({
    assetId: "asset-12345678",
    policyId: "festival-default-v1",
    probe: { format: {}, streams: [] },
  });
  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((item) => item.code === "VIDEO_STREAM_MISSING"));
  assert.ok(report.findings.some((item) => item.code === "AUDIO_STREAM_MISSING"));
  assert.ok(report.findings.some((item) => item.code === "DURATION_UNREADABLE"));
});

test("disallowed codec, undersized picture and out-of-range frame rate fail", () => {
  const report = evaluateTechnicalQc({
    assetId: "asset-12345678",
    policyId: "festival-default-v1",
    probe: {
      format: { duration: 120, format_name: "matroska" },
      streams: [
        { codec_type: "video", codec_name: "mpeg2video", width: 320, height: 240, avg_frame_rate: "240/1" },
        { codec_type: "audio", codec_name: "aac" },
      ],
    },
  });
  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((item) => item.code === "VIDEO_CODEC_NOT_ALLOWED"));
  assert.ok(report.findings.some((item) => item.code === "VIDEO_WIDTH_BELOW_MINIMUM"));
  assert.ok(report.findings.some((item) => item.code === "VIDEO_HEIGHT_BELOW_MINIMUM"));
  assert.ok(report.findings.some((item) => item.code === "FRAME_RATE_OUT_OF_RANGE"));
});

test("multiple video streams require manual review rather than automatic pass", () => {
  const report = evaluateTechnicalQc({
    assetId: "asset-12345678",
    policyId: "festival-default-v1",
    probe: {
      ...validProbe,
      streams: [
        ...validProbe.streams,
        { index: 2, codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/1" },
      ],
    },
  });
  assert.equal(report.status, "REVIEW_REQUIRED");
  assert.ok(report.findings.some((item) => item.code === "MULTIPLE_VIDEO_STREAMS"));
});

test("invalid frame-rate fractions fail closed", () => {
  const report = evaluateTechnicalQc({
    assetId: "asset-12345678",
    policyId: "festival-default-v1",
    probe: {
      ...validProbe,
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/0" },
        validProbe.streams[1],
      ],
    },
  });
  assert.equal(report.status, "FAIL");
  assert.ok(report.findings.some((item) => item.code === "FRAME_RATE_UNREADABLE"));
});
