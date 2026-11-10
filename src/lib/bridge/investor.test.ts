import assert from "node:assert/strict";
import test from "node:test";
import { listInvestorInvestments } from "./investor.ts";

test("investor portfolio query is parameterized and scoped to the authenticated investor id", async () => {
  let capturedSql = "";
  let capturedParams: unknown[] = [];
  const result = await listInvestorInvestments({
    query: async <T>(sql: string, params: unknown[] = []) => {
      capturedSql = sql;
      capturedParams = params;
      return [{
        id: "investment-1",
        title_id: "title-1",
        title_name: "Assigned title",
        investment_reference: "REF-1",
        invested_amount_paise: "100000",
        participation_percent: "12.5",
        created_at: new Date("2026-11-10T00:00:00.000Z"),
      }] as T[];
    },
  }, "investor-authenticated-1");

  assert.match(capturedSql, /where i\.investor_user_id = \$1/);
  assert.deepEqual(capturedParams, ["investor-authenticated-1"]);
  assert.equal(result.investments[0].titleId, "title-1");
  assert.equal(result.investments[0].createdAt, "2026-11-10T00:00:00.000Z");
});

test("investor portfolio query rejects an empty identity", async () => {
  await assert.rejects(
    listInvestorInvestments({ query: async () => [] }, " "),
    /Investor identity required/,
  );
});
