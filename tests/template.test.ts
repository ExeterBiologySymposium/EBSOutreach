import { test } from "node:test";
import assert from "node:assert/strict";
import { coldEmail, POSTAL_ADDRESS, UNSUBSCRIBE_LINE } from "../lib/template.ts";

test("coldEmail — greets by school name, no LLM/scrape content", () => {
  const { subject, body } = coldEmail("Cookson Hills Christian School");
  assert.ok(subject.length > 0);
  assert.match(body, /^Dear Cookson Hills Christian School,/);
});

test("coldEmail — CAN-SPAM postal address and unsubscribe line always present", () => {
  const { body } = coldEmail("Any School");
  assert.ok(body.includes(POSTAL_ADDRESS), "missing required postal address");
  assert.ok(body.includes(UNSUBSCRIBE_LINE), "missing required unsubscribe mechanism");
});

test("coldEmail — identical content regardless of school (fully generic by design)", () => {
  const a = coldEmail("School A");
  const b = coldEmail("School B");
  assert.equal(a.subject, b.subject);
  assert.equal(a.body.replace("School A", "X"), b.body.replace("School B", "X"));
});
