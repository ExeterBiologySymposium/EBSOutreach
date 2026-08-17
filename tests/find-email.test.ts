import { test } from "node:test";
import assert from "node:assert/strict";
import { findEmail } from "../lib/find-email.ts";

process.env.SCRAPER_USER_AGENT ??= "ExeterSymposiumBot/1.0 (+mailto:test@example.com)";

const FIXTURE_HTML = `
<html><body>
  <footer>
    Questions? noreply@example-school.edu will not reply.
    General office: info@example-school.edu
    Principal: principal@example-school.edu
  </footer>
</body></html>
`;

test("findEmail — info@ wins at 0.9, noreply@ is never selected", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url: string) => {
    if (String(url) === "https://example-school.edu") {
      return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response("", { status: 404 });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const found = await findEmail("https://example-school.edu/");
  assert.ok(found);
  assert.equal(found.email, "info@example-school.edu");
  assert.equal(found.confidence, 0.9);
});

test("findEmail — no candidates on a page with only a reject-listed address", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response("<html><body>noreply@example-school.edu only</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const found = await findEmail("https://example-school.edu/");
  assert.equal(found, null);
});
