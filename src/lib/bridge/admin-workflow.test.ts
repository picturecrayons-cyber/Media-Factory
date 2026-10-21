import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQcPrerequisites, evaluateLoopHandoffState } from "./admin-workflow-policy.ts";

test("evaluateQcPrerequisites blocks QC submission when required metadata is missing", () => {
  const title = {
    name: "",
    synopsis: "Some synopsis",
    language: "Malayalam",
    contentType: "FEATURE",
    year: 2024,
    status: "PREPARING",
  };
  const assets = [
    { kind: "master", s3_key: "titles/1/master.mov", verified: true },
    { kind: "poster_vertical", s3_key: "titles/1/poster.jpg", verified: true },
  ];

  const result = evaluateQcPrerequisites(title, assets);
  assert.equal(result.canProceed, false);
  assert.ok(result.blockers.some((b) => b.includes("Title name is required")));
});

test("evaluateQcPrerequisites blocks QC submission when verified master video is missing", () => {
  const title = {
    name: "Jananam 1947 Pranayam Thudarunnu",
    synopsis: "A poignant romantic drama about late-life companionship.",
    language: "Malayalam",
    contentType: "FEATURE",
    year: 2024,
    status: "PREPARING",
  };
  const assets = [
    { kind: "poster_vertical", s3_key: "titles/1/poster.jpg", verified: true },
  ];

  const result = evaluateQcPrerequisites(title, assets);
  assert.equal(result.canProceed, false);
  assert.ok(result.blockers.some((b) => b.includes("master video asset is required")));
});

test("evaluateQcPrerequisites blocks QC submission when verified poster artwork is missing", () => {
  const title = {
    name: "Jananam 1947 Pranayam Thudarunnu",
    synopsis: "A poignant romantic drama about late-life companionship.",
    language: "Malayalam",
    contentType: "FEATURE",
    year: 2024,
    status: "PREPARING",
  };
  const assets = [
    { kind: "master", s3_key: "titles/1/master.mov", verified: true },
  ];

  const result = evaluateQcPrerequisites(title, assets);
  assert.equal(result.canProceed, false);
  assert.ok(result.blockers.some((b) => b.includes("poster artwork asset is required")));
});

test("evaluateQcPrerequisites allows QC submission when all metadata and verified assets are present", () => {
  const title = {
    name: "Jananam 1947 Pranayam Thudarunnu",
    synopsis: "A poignant romantic drama about late-life companionship.",
    language: "Malayalam",
    contentType: "FEATURE",
    year: 2024,
    masterKey: "titles/1/master.mov",
    posterKey: "titles/1/poster.jpg",
    status: "PREPARING",
  };
  const assets = [
    { kind: "master", s3_key: "titles/1/master.mov", verified: true },
    { kind: "poster_vertical", s3_key: "titles/1/poster.jpg", verified: true },
  ];

  const result = evaluateQcPrerequisites(title, assets);
  assert.equal(result.canProceed, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.assets.hasMaster, true);
  assert.equal(result.assets.hasPoster, true);
});

test("evaluateLoopHandoffState returns NOT_READY when QC has not passed", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: false,
    grantValid: true,
    hasMasterKey: true,
    hasPosterKey: true,
  });

  assert.equal(result.state, "NOT_READY");
  assert.ok(result.blockers.some((b) => b.includes("QC approval is required")));
});

test("evaluateLoopHandoffState returns NOT_READY when distribution rights grant is missing or invalid", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: true,
    grantValid: false,
    hasMasterKey: true,
    hasPosterKey: true,
  });

  assert.equal(result.state, "NOT_READY");
  assert.ok(result.blockers.some((b) => b.includes("valid distribution rights grant is required")));
});

test("evaluateLoopHandoffState returns READY_FOR_REVIEW when all prerequisites are satisfied", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: true,
    grantValid: true,
    hasMasterKey: true,
    hasPosterKey: true,
  });

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(result.blockers.length, 0);
});

test("evaluateLoopHandoffState returns ACKNOWLEDGED when Loop publication is active and acknowledged", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: true,
    grantValid: true,
    hasMasterKey: true,
    hasPosterKey: true,
    pubStatus: "authorized",
    loopPublished: true,
  });

  assert.equal(result.state, "ACKNOWLEDGED");
});

test("evaluateLoopHandoffState returns FAILED when Loop publication encountered failure", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: true,
    grantValid: true,
    hasMasterKey: true,
    hasPosterKey: true,
    pubStatus: "failed",
    loopPublished: false,
  });

  assert.equal(result.state, "FAILED");
});

test("evaluateLoopHandoffState returns SUBMITTED when Loop publication is pending approval", () => {
  const result = evaluateLoopHandoffState({
    qcPassed: true,
    grantValid: true,
    hasMasterKey: true,
    hasPosterKey: true,
    pubStatus: "pending_approval",
    loopPublished: false,
  });

  assert.equal(result.state, "SUBMITTED");
});
