// Integration test against a real Supabase project with supabase/schema.sql
// applied (BUILD.md §11 step 4 gate). Requires SUPABASE_URL and
// SUPABASE_SECRET_KEY — skips with a clear message if not configured,
// rather than fabricating a pass.
//
// Uses its own Supabase client instead of importing lib/db.ts or
// lib/queue.ts: those files `import "server-only"`, a package that
// unconditionally throws outside Next's bundler (it relies on a webpack
// resolve condition Next sets, which a plain `node --test` run doesn't
// have). Same reason scripts/*.mjs construct their own client rather than
// reaching through lib/db.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // ignore — env vars may already be exported
}

const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const db = hasSupabase
  ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  : null;

async function claimJobs(batchSize: number, allowedStages: string[]) {
  const { data, error } = await db!.rpc("claim_jobs", { batch_size: batchSize, allowed_stages: allowedStages });
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  return data ?? [];
}

test(
  "claimJobs — 3 concurrent claims of 50 pending jobs yield 30 distinct rows, no duplicates",
  { skip: !hasSupabase && "no Supabase env configured — see .env.local" },
  async () => {
    // jobs_org_stage_open_idx allows only one open job per (org_id, stage),
    // so each of the 50 jobs needs its own org to insert concurrently.
    const orgIds = Array.from({ length: 50 }, (_, i) => `test-org-${Date.now()}-${i}`);
    const { error: orgError } = await db!.from("orgs").insert(
      orgIds.map((id) => ({ id, name: "Queue Test School", normalized_key: id })),
    );
    assert.equal(orgError, null);

    const jobIds = orgIds.map((_, i) => `test-job-${Date.now()}-${i}`);
    const { error: insertError } = await db!.from("jobs").insert(
      jobIds.map((id, i) => ({ id, org_id: orgIds[i], stage: "find_email" })),
    );
    assert.equal(insertError, null);

    try {
      const [a, b, c] = await Promise.all([
        claimJobs(10, ["find_email", "draft", "push_gmail"]),
        claimJobs(10, ["find_email", "draft", "push_gmail"]),
        claimJobs(10, ["find_email", "draft", "push_gmail"]),
      ]);
      const claimedIds = [...a, ...b, ...c].map((j: any) => j.id);
      assert.equal(claimedIds.length, 30);
      assert.equal(new Set(claimedIds).size, 30, "no job claimed twice — SKIP LOCKED must be working");
    } finally {
      await db!.from("jobs").delete().in("id", jobIds);
      await db!.from("orgs").delete().in("id", orgIds);
    }
  },
);

test(
  "claim_jobs RPC is not callable by the anon key",
  { skip: !hasSupabase && "no Supabase env configured — see .env.local" },
  async () => {
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!anonKey) {
      console.log("  (skipping anon-key check — SUPABASE_PUBLISHABLE_KEY not set)");
      return;
    }
    const anon = createClient(process.env.SUPABASE_URL!, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("claim_jobs", { batch_size: 1, allowed_stages: ["find_email"] });
    assert.ok(error, "anon key must not be able to call claim_jobs — check the REVOKE in schema.sql");
  },
);
