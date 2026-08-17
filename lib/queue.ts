import "server-only";
import { db } from "./db";

export type Stage = "find_email" | "draft" | "push_gmail";
export const ALL_STAGES: Stage[] = ["find_email", "draft", "push_gmail"];
export const MAX_ATTEMPTS = 4;

export type Job = {
  id: string;
  org_id: string;
  stage: Stage;
  status: string;
  priority: number;
  attempts: number;
  run_after: string;
  started_at: string | null;
  last_error: string | null;
  created_at: string;
};

export async function claimJobs(batchSize: number, allowedStages: Stage[]): Promise<Job[]> {
  const { data, error } = await db.rpc("claim_jobs", {
    batch_size: batchSize,
    allowed_stages: allowedStages,
  });
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  return (data ?? []) as Job[];
}

export async function completeJob(id: string) {
  await db.from("jobs").delete().eq("id", id);
}

/** Exponential backoff: 4, 16, 64 minutes. Dead-letter on the 4th attempt. */
export async function failJob(id: string, attempts: number, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (attempts >= MAX_ATTEMPTS) {
    await db.from("jobs")
      .update({ status: "failed", last_error: message })
      .eq("id", id);
    return;
  }
  const delayMinutes = Math.pow(4, attempts);
  await db.from("jobs").update({
    status: "pending",
    last_error: message,
    run_after: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
  }).eq("id", id);
}

export async function enqueue(orgId: string, stage: Stage, priority = 0) {
  const { error } = await db.from("jobs").insert({
    id: `${stage}-${orgId}`, // idempotent: same stage for same org can't double-queue
    org_id: orgId,
    stage,
    priority,
  });
  // duplicate-key errors are expected and benign — swallow only 23505.
  if (error && error.code !== "23505") {
    throw new Error(`enqueue failed: ${error.message}`);
  }
}
