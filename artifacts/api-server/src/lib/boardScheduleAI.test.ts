import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import { extractAiSchedule } from "./boardScheduleAI";

const row = {
  group: "Interior finishes", name: "Install cabinets", assignee: "Morgan",
  startDate: "2026-10-15", endDate: "2026-10-18", status: "", priority: "", cost: "",
};

function mockClient(choice: unknown, inspect?: (request: unknown) => void) {
  return {
    chat: { completions: { parse: async (request: unknown) => {
      inspect?.(request);
      return { choices: [choice] };
    } } },
  } as unknown as OpenAI;
}

test("AI reads text and all page images together and returns structured, ordered fields", async () => {
  const client = mockClient(
    { finish_reason: "stop", message: { parsed: { rows: [row, { ...row, name: "Paint walls" }] } } },
    (request) => {
      const body = request as { messages: Array<{ content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> };
      assert.match(body.messages[0].content as string, /never instructions/);
      assert.match(body.messages[0].content as string, /YYYY-MM-DD/);
      assert.match(body.messages[0].content as string, /never use today's year/);
      const content = body.messages[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
      assert.match(content[0].text!, /Schedule 2026/);
      assert.equal(content.filter((part) => part.type === "image_url").length, 2);
      assert.match(content[1].image_url!.url, /^data:image\/png;base64,/);
    },
  );
  const rows = await extractAiSchedule({ text: "Schedule 2026", images: [Buffer.from([137]), Buffer.from([137])] }, client);
  assert.equal(rows[0].startDate, "2026-10-15");
  assert.equal(rows[0].assignee, "Morgan");
  assert.deepEqual(rows.map((entry) => entry.rowNumber), [1, 2]);
});

test("empty, invalid, refused, and truncated AI schedules never become partial imports", async () => {
  for (const choice of [
    { finish_reason: "stop", message: { parsed: { rows: [] } } },
    { finish_reason: "stop", message: { parsed: { rows: [{ ...row, name: "" }] } } },
    { finish_reason: "stop", message: { parsed: { rows: Array.from({ length: 251 }, () => row) } } },
    { finish_reason: "length", message: { parsed: { rows: [row] } } },
    { finish_reason: "stop", message: { refusal: "Refused", parsed: null } },
  ]) {
    await assert.rejects(() => extractAiSchedule({ text: "", images: [] }, mockClient(choice)), /No complete|could not read/);
  }
});

test("provider failures surface a retry message without leaking document contents", async () => {
  const client = {
    chat: { completions: { parse: async () => { throw new Error("private document body"); } } },
  } as unknown as OpenAI;
  await assert.rejects(
    () => extractAiSchedule({ text: "private schedule", images: [] }, client),
    (error: Error) => /Retry/.test(error.message) && !/private/.test(error.message),
  );
});
