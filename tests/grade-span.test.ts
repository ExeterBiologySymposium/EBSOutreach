import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, classifyPss } from "../lib/grade-span.ts";

test("classify — CCD grade span cases from BUILD.md §8", () => {
  assert.equal(classify("PK", "05"), null);
  assert.equal(classify("06", "08"), "middle");
  assert.equal(classify("09", "12"), "high");
  assert.equal(classify("07", "12"), "middle_high");
  assert.equal(classify("KG", "12"), "middle_high");
  assert.equal(classify("UG", "UG"), null);
});

test("classifyPss — PSS numeric recode (verified against 2021-22 codebook)", () => {
  assert.equal(classifyPss("1", "1"), null); // all ungraded
  assert.equal(classifyPss("11", "13"), "middle"); // 6th-8th
  assert.equal(classifyPss("14", "17"), "high"); // 9th-12th
  assert.equal(classifyPss("12", "14"), "middle_high"); // 7th-9th
  assert.equal(classifyPss("3", "6"), null); // K-1st, elementary only
});
