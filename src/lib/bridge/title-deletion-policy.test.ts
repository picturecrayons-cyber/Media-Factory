import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
  rejectPermanentTitleDeletion,
} from "./title-deletion-policy.ts";

describe("permanent title deletion safety", () => {
  it("rejects every permanent deletion request before any storage or database work", () => {
    assert.throws(() => rejectPermanentTitleDeletion(), {
      message: PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
    });
  });
});
