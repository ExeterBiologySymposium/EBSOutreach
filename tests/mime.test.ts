import { test } from "node:test";
import assert from "node:assert/strict";
import { rawMessage } from "../lib/mime.ts";

test("rawMessage — CRLF headers, RFC 2047 subject, round-trips em-dash and accents", () => {
  const raw = rawMessage({
    to: "principal@example.edu",
    from: "sender@gmail.com",
    subject: "EBS — invitation for José's school",
    body: "Body text with café and — an em-dash.",
  });

  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [headerBlock, ...bodyParts] = mime.split("\r\n\r\n");

  assert.ok(!headerBlock.includes("\n\n"), "headers must be CRLF-separated, not bare LF");
  const headerLines = headerBlock.split("\r\n");
  assert.ok(headerLines.every((l) => !l.includes("\n")), "no bare LF inside header lines");

  const subjectLine = headerLines.find((l) => l.startsWith("Subject: "));
  assert.ok(subjectLine, "Subject header present");
  const match = subjectLine.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/);
  assert.ok(match, "subject uses RFC 2047 encoded-word");
  const decodedSubject = Buffer.from(match[1], "base64").toString("utf8");
  assert.equal(decodedSubject, "EBS — invitation for José's school");

  const decodedBody = Buffer.from(bodyParts.join("\r\n\r\n"), "base64").toString("utf8");
  assert.equal(decodedBody, "Body text with café and — an em-dash.");
});

test("rawMessage — pure-ASCII subject is left unencoded", () => {
  const raw = rawMessage({ to: "a@b.edu", from: "c@gmail.com", subject: "Plain subject", body: "hi" });
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  assert.ok(mime.includes("Subject: Plain subject\r\n"));
});
