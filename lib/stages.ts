import "server-only";
import { db, type Org } from "./db";
import { enqueue, type Job, type Stage } from "./queue";
import { findEmail } from "./find-email";
import { research } from "./research";
import { createDraft } from "./gmail";
import { hasUnfilled } from "./template";

async function runFindEmail(org: Org, job: Job) {
  if (!org.website) {
    await db.from("orgs").update({ status: "needs_manual", notes: "no website on file" }).eq("id", org.id);
    return;
  }

  const found = await findEmail(org.website);
  if (!found) {
    if (job.attempts >= 2) {
      await db.from("orgs")
        .update({ status: "needs_manual", notes: "no email found on school site after 2 attempts" })
        .eq("id", org.id);
      return; // completeJob, not failJob — this is not an error
    }
    throw new Error("EMAIL_NOT_FOUND_YET"); // retryable
  }

  await db.from("orgs").update({
    email: found.email,
    email_source: found.source,
    email_confidence: found.confidence,
    consent_basis: "conspicuously_published",
    status: "email_found",
  }).eq("id", org.id);
  await enqueue(org.id, "research");
}

async function runResearch(org: Org) {
  const { result, sources } = await research(org);

  // §13: an empty hook means nothing specific enough was found. A generic
  // email to a school is worse than no email — do not draft one.
  if (!result.hook) {
    await db.from("orgs").update({
      status: "needs_manual",
      notes: "LLM found nothing specific enough for a hook",
      last_researched: new Date().toISOString(),
    }).eq("id", org.id);
    return;
  }

  for (const s of sources) {
    await db.from("sources").insert({
      id: `src-${org.id}-${Buffer.from(s.url).toString("base64url").slice(0, 24)}`,
      org_id: org.id,
      url: s.url,
      title: s.title,
      excerpt: s.excerpt.slice(0, 3600),
    });
  }

  await db.from("orgs").update({
    research_summary: result.summary,
    research_hook: result.hook,
    status: "researched",
    last_researched: new Date().toISOString(),
  }).eq("id", org.id);

  await db.from("drafts").upsert({
    id: `draft-${org.id}`,
    org_id: org.id,
    subject: result.subject,
    body: result.body,
    is_fallback: false,
    model: process.env.NVIDIA_MODEL ?? "",
  });

  await enqueue(org.id, "draft");
}

/** Three hard guards live here — see BUILD.md §7. */
async function runDraft(org: Org) {
  // Guard 1: FILL_ME. Prevents mailing schools a letter full of placeholders.
  const unfilled = hasUnfilled();
  if (unfilled.length > 0) {
    throw new Error(`TEMPLATE_INCOMPLETE: fill program details in lib/template.ts before enabling drafting (${unfilled.join(", ")})`);
  }

  // Guard 2: suppression check.
  if (org.email) {
    const { data: suppressed } = await db.from("suppressions").select("email").eq("email", org.email).maybeSingle();
    if (suppressed) {
      await db.from("orgs").update({ status: "suppressed" }).eq("id", org.id);
      return;
    }
  }

  await db.from("orgs").update({ status: "drafted", drafted_at: new Date().toISOString() }).eq("id", org.id);
  await enqueue(org.id, "push_gmail");
}

async function runPushGmail(org: Org) {
  const { data: draft } = await db.from("drafts").select("*").eq("org_id", org.id).single();
  if (!draft) throw new Error(`DRAFT_MISSING: no draft row for org ${org.id}`);

  // Guard 3: never push a fallback draft. Should be unreachable in this
  // codebase (there is no silent-fallback path), but stays as a backstop —
  // a generic draft that might get sent by accident is worse than no draft.
  if (draft.is_fallback) {
    throw new Error("FALLBACK_DRAFT_BLOCKED: refusing to push a fallback draft to Gmail");
  }
  if (!org.email) throw new Error(`EMAIL_MISSING: org ${org.id} has no email on file`);

  const gmailDraftId = await createDraft({
    to: org.email,
    from: process.env.SENDER_EMAIL!,
    subject: draft.subject,
    body: draft.body,
  });

  await db.from("orgs").update({ status: "draft_in_gmail", gmail_draft_id: gmailDraftId }).eq("id", org.id);
}

export const STAGES: Record<Stage, (org: Org, job?: Job) => Promise<void>> = {
  find_email: (org, job) => runFindEmail(org, job!),
  research: (org) => runResearch(org),
  draft: (org) => runDraft(org),
  push_gmail: (org) => runPushGmail(org),
};

/**
 * Terminal errors: retrying with backoff cannot fix them (revoked token,
 * wrong scope, malformed MIME, incomplete template, blocked fallback). Dead-
 * letter immediately instead of burning 4 attempts' worth of backoff hiding
 * a problem that needs a human.
 */
const TERMINAL_MARKERS = [
  "AUTH_EXPIRED",
  "insufficientPermissions",
  "TEMPLATE_INCOMPLETE",
  "FALLBACK_DRAFT_BLOCKED",
  "EMAIL_MISSING",
  "DRAFT_MISSING",
];

export function isTerminalError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TERMINAL_MARKERS.some((m) => msg.includes(m));
}
