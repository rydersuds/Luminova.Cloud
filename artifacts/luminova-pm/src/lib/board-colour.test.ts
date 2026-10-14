import assert from "node:assert/strict";
import test from "node:test";
import { groupTone, groupTextColor, GROUP_TONE } from "../components/board/board-model.ts";

test("source screenshot hex colours preserve their exact HSL equivalents", () => {
  assert.equal(groupTone("#FF0000"), "0.0000 100.0000% 50.0000%");
  assert.equal(groupTone("#00FF00"), "120.0000 100.0000% 50.0000%");
  assert.equal(groupTone("#0000FF"), "240.0000 100.0000% 50.0000%");
  assert.equal(groupTone("gold"), GROUP_TONE.gold);
  assert.equal(groupTextColor("#FFFFFF"), "#000");
  assert.equal(groupTextColor("#000000"), "#fff");
});
