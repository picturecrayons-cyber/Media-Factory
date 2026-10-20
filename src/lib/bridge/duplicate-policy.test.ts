import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDuplicateTitleMerge,
  normalizeTitleText,
  normalizeContentType,
  generateTitleDeduplicationKey,
  detectDuplicateGroups,
} from "./duplicate-policy.ts";

const title = (id: string, overrides: Partial<any> = {}) => ({
  id,
  name: "Jananam 1947 Pranayam Thudarunnu",
  slug: id,
  language: "Malayalam",
  status: "DRAFT",
  owner_user_id: "owner-1",
  year: 2024,
  runtime_minutes: 100,
  content_type: "FEATURE",
  ...overrides,
});

const rights = (overrides: Partial<any> = {}) => ({
  id: "r1",
  territories: ["IN"],
  languages: ["Malayalam"],
  window_start: null,
  window_end: null,
  exclusivity: "NON_EXCLUSIVE",
  status: "VALID",
  ...overrides,
});

const baseInput = () => ({
  identityCertain: true,
  canonical: title("cb8c141dc72d727a53a4f35d8851e100", { status: "PREPARING", content_type: "Film" }),
  retiring: title("6eec48a7c576789ede558e66ba18b929", {
    name: "Jananam 1947 Pranayam THudarunnu",
    status: "DRAFT",
    content_type: "FEATURE",
  }),
  canonicalRights: [rights()],
  retiringRights: [rights()],
  canonicalBuyers: [] as unknown[],
  retiringBuyers: [] as unknown[],
  canonicalAssets: [] as unknown[],
  retiringAssets: [] as unknown[],
  canonicalDeliveries: [] as unknown[],
  retiringDeliveries: [] as unknown[],
  canonicalLoopPublications: [] as unknown[],
  retiringLoopPublications: [] as unknown[],
});

test("title text normalization handles case and spacing variations", () => {
  const t1 = "Jananam 1947 Pranayam Thudarunnu";
  const t2 = "Jananam 1947 Pranayam THudarunnu";
  const t3 = "  Jananam   1947   Pranayam   Thudarunnu  ";
  const t4 = "Jananam 1947: Pranayam Thudarunnu!";

  assert.equal(normalizeTitleText(t1), "jananam 1947 pranayam thudarunnu");
  assert.equal(normalizeTitleText(t2), "jananam 1947 pranayam thudarunnu");
  assert.equal(normalizeTitleText(t3), "jananam 1947 pranayam thudarunnu");
  assert.equal(normalizeTitleText(t4), "jananam 1947 pranayam thudarunnu");
});

test("content type normalization maps synonyms to standard categories", () => {
  assert.equal(normalizeContentType("Film"), "FEATURE");
  assert.equal(normalizeContentType("FEATURE"), "FEATURE");
  assert.equal(normalizeContentType("feature"), "FEATURE");
  assert.equal(normalizeContentType("Movie"), "FEATURE");
  assert.equal(normalizeContentType("Series"), "SERIES");
  assert.equal(normalizeContentType("Short"), "SHORT");
});

test("generates identical deduplication key for Jananam records", () => {
  const canonical = {
    id: "cb8c141dc72d727a53a4f35d8851e100",
    name: "Jananam 1947 Pranayam Thudarunnu",
    language: "Malayalam",
    year: 2024,
    contentType: "Film",
  };
  const legacy = {
    id: "legacy-film-7",
    name: "Jananam 1947 Pranayam Thudarunnu",
    language: "Malayalam",
    year: 2024,
    contentType: "FEATURE",
  };
  const draft = {
    id: "6eec48a7c576789ede558e66ba18b929",
    name: "Jananam 1947 Pranayam THudarunnu",
    language: "Malayalam",
    year: 2024,
    contentType: "FEATURE",
  };

  const key1 = generateTitleDeduplicationKey(canonical);
  const key2 = generateTitleDeduplicationKey(legacy);
  const key3 = generateTitleDeduplicationKey(draft);

  assert.equal(key1, "jananam 1947 pranayam thudarunnu::malayalam::2024::FEATURE");
  assert.equal(key2, key1);
  assert.equal(key3, key1);
});

test("detectDuplicateGroups groups all 3 Jananam titles together", () => {
  const titles = [
    {
      id: "cb8c141dc72d727a53a4f35d8851e100",
      name: "Jananam 1947 Pranayam Thudarunnu",
      language: "Malayalam",
      year: 2024,
      contentType: "Film",
      status: "PREPARING",
    },
    {
      id: "legacy-film-7",
      name: "Jananam 1947 Pranayam Thudarunnu",
      language: "Malayalam",
      year: 2024,
      contentType: "FEATURE",
      status: "LIVE_FOR_BUYERS",
    },
    {
      id: "6eec48a7c576789ede558e66ba18b929",
      name: "Jananam 1947 Pranayam THudarunnu",
      language: "Malayalam",
      year: 2024,
      contentType: "FEATURE",
      status: "DRAFT",
    },
    {
      id: "distinct-film-1",
      name: "Bramayugam",
      language: "Malayalam",
      year: 2024,
      contentType: "FEATURE",
      status: "PREPARING",
    },
  ];

  const duplicates = detectDuplicateGroups(titles);
  assert.equal(duplicates.size, 1);
  const jananamGroup = duplicates.get("jananam 1947 pranayam thudarunnu::malayalam::2024::FEATURE");
  assert.ok(jananamGroup);
  assert.equal(jananamGroup.length, 3);
  const ids = jananamGroup.map((t) => t.id);
  assert.ok(ids.includes("cb8c141dc72d727a53a4f35d8851e100"));
  assert.ok(ids.includes("legacy-film-7"));
  assert.ok(ids.includes("6eec48a7c576789ede558e66ba18b929"));
});

test("safe duplicate merge between canonical PREPARING and duplicate DRAFT", () => {
  const result = evaluateDuplicateTitleMerge(baseInput());
  assert.equal(result.decision, "SAFE");
  assert.equal(result.reasons.length, 0);
});

test("blocks merge of protected LIVE_FOR_BUYERS record into non-live canonical", () => {
  const input = baseInput();
  input.retiring = title("legacy-film-7", {
    name: "Jananam 1947 Pranayam Thudarunnu",
    status: "LIVE_FOR_BUYERS",
  });
  input.canonical = title("cb8c141dc72d727a53a4f35d8851e100", {
    name: "Jananam 1947 Pranayam Thudarunnu",
    status: "PREPARING",
  });

  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("BUYER_VISIBILITY_CONFLICT"));
});

test("blocks merge when retiring title has active Loop publication", () => {
  const input = baseInput();
  input.retiringLoopPublications = [{ id: "pub-1", loop_title_id: "loop-1" }];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("LOOP_PUBLICATION_CONFLICT"));
});

test("blocks merge when title identity is uncertain", () => {
  const input = baseInput();
  input.identityCertain = false;
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasons.includes("TITLE_IDENTITY_UNCERTAIN"));
});

test("holds on language conflict", () => {
  const input = baseInput();
  input.retiringRights = [rights({ languages: ["Tamil"] })];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("LANGUAGE_CONFLICT"));
});

test("holds on territory conflict", () => {
  const input = baseInput();
  input.retiringRights = [rights({ territories: ["US"] })];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("TERRITORY_CONFLICT"));
});

test("holds on exclusivity conflict", () => {
  const input = baseInput();
  input.retiringRights = [rights({ exclusivity: "EXCLUSIVE" })];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("EXCLUSIVITY_CONFLICT"));
});

test("holds on buyer mapping conflict", () => {
  const input = baseInput();
  input.canonicalBuyers = [{ buyer_user_id: "buyer-1", access: "exclusive" }];
  input.retiringBuyers = [{ buyer_user_id: "buyer-2", access: "exclusive" }];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("BUYER_MAPPING_CONFLICT"));
});

test("holds on asset version conflict", () => {
  const input = baseInput();
  input.canonicalAssets = [{ id: "a1", checksum_sha256: "sha-canonical" }];
  input.retiringAssets = [{ id: "a2", checksum_sha256: "sha-retiring" }];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("ASSET_VERSION_CONFLICT"));
});
