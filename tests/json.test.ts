import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedJson } from "../lib/json.ts";

test("parseGeneratedJson — clean compact JSON", () => {
  assert.deepEqual(parseGeneratedJson('{"a":1,"b":"x"}'), { a: 1, b: "x" });
});

test("parseGeneratedJson — strips markdown code fences", () => {
  assert.deepEqual(parseGeneratedJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("parseGeneratedJson — raw literal newline inside a string value (real LLM output bug)", () => {
  const raw = '{"summary":"line one\nline two","hook":""}';
  assert.deepEqual(parseGeneratedJson(raw), { summary: "line one\nline two", hook: "" });
});

test("parseGeneratedJson — escaped quote inside a string still parses", () => {
  const raw = String.raw`{"body":"she said \"hi\" to them"}`;
  assert.deepEqual(parseGeneratedJson(raw), { body: 'she said "hi" to them' });
});

test("parseGeneratedJson — structural whitespace in pretty-printed JSON is untouched", () => {
  const raw = '{\n  "a": 1,\n  "b": 2\n}';
  assert.deepEqual(parseGeneratedJson(raw), { a: 1, b: 2 });
});

test("parseGeneratedJson — no JSON object throws LLM_JSON_PARSE_FAILED", () => {
  assert.throws(() => parseGeneratedJson("just prose, no braces here"), /LLM_JSON_PARSE_FAILED/);
});
