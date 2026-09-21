import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLoopPublishGates,
  buildLoopPublishPayload,
  payloadExposesMaster,
  playbackAssetIsReady,
  type LoopPublishGateInput,
} from "./loop-publish.ts";

function gates(over: Partial<LoopPublishGateInput> = {}): LoopPublishGateInput {
  return {
    titleExists: true,
    qcPassed: true,
    rightsApproved: true,
    rightsEvidenced: true,
    territoryAllowed: true,
    windowActive: true,
    publishingPermission: true,
    playbackKey: "bridge/x/title/playback/film.mp4",
    masterKey: "bridge/x/title/master/film.mov",
    playbackMime: "video/mp4",
    ...over,
  };
}

test("catalog publish fails closed without QC, rights, window, or playback", () => {
  assert.throws(() => assertLoopPublishGates(gates({ qcPassed: false })), /QC not approved/);
  assert.throws(() => assertLoopPublishGates(gates({ rightsApproved: false })), /rights invalid/);
  assert.throws(() => assertLoopPublishGates(gates({ windowActive: false })), /window inactive/);
  assert.throws(() => assertLoopPublishGates(gates({ playbackKey: null })), /not READY/);
});

test("master and mov mezzanine are not playback READY", () => {
  const master = "bridge/x/title/master/PRANAYAM.mov";
  assert.equal(playbackAssetIsReady({ playbackKey: master, masterKey: master, playbackMime: "video/quicktime" }), false);
  assert.equal(
    playbackAssetIsReady({
      playbackKey: "films/videos/e68/PRANAYAM 1947_FULL MOVIE.mov",
      masterKey: "other",
      playbackMime: "video/quicktime",
    }),
    false,
  );
  assert.equal(
    playbackAssetIsReady({
      playbackKey: "bridge/x/title/playback/pranayam-1947.h264.mp4",
      masterKey: master,
      playbackMime: "video/mp4",
    }),
    true,
  );
});

test("payload never carries the private master as playback", () => {
  const master = "bridge/x/title/master/film.mov";
  const payload = buildLoopPublishPayload({
    bridge_title_id: "abc12345",
    loop_title_id: null,
    title: "Sample",
    synopsis: "",
    content_type: "Film",
    year: 2024,
    languages: ["Malayalam"],
    artwork: "bridge/x/title/poster/p.jpg",
    trailer: "bridge/x/title/trailer/t.mp4",
    genres: ["Drama"],
    cast_credits: "",
    maturity_rating: "U",
    availability_territory: "IN",
    rights_start: "2026-01-01",
    rights_end: "2027-01-01",
    monetization_mode: "svod",
    price_plan_eligibility: "svod",
    playback_asset_reference: "bridge/x/title/playback/film.mp4",
  });
  assert.equal(payload.source, "crayons-bridge");
  assert.equal(payloadExposesMaster(payload, master), false);
});
