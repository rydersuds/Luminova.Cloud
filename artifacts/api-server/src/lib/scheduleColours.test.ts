import assert from "node:assert/strict";
import test from "node:test";
import { matchScreenshotColour } from "./scheduleColours";

test("AI colour estimates match original screenshot pixels rather than rotating board colours", () => {
  assert.equal(matchScreenshotColour("#347DBB", ["#FF8800", "#337ABB", "#FFFFFF"]), "#337ABB");
  assert.equal(matchScreenshotColour("#0000FF", ["#FF0000"]), null);
  assert.equal(matchScreenshotColour(null, ["#FF0000"]), null);
});
