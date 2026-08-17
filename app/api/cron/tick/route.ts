import "server-only";
import { db, getOrg } from "@/lib/db";
import { claimJobs, completeJob, failJob, ALL_STAGES, MAX_ATTEMPTS, type Job } from "@/lib/queue";
import { STAGES, isTerminalError } from "@/lib/stages";

export const runtime = "nodejs";
export const maxDuration = 60; // VERIFIED against Vercel Hobby plan default — see README

async function draftsToday(): Promise<number> {
  const { data, error } = await db.rpc("drafts_today_count");
  if (error) throw new Error(`draftsToday failed: ${error.message}`);
  return Number(data ?? 0);
}

async function runOne(job: Job) {
  const org = await getOrg(job.org_id);
  if (!org) {
    await completeJob(job.id); // org was deleted out from under the job — nothing to do
    return;
  }
  try {
    await STAGES[job.stage](org, job);
    await completeJob(job.id);
  } catch (err) {
    await failJob(job.id, isTerminalError(err) ? MAX_ATTEMPTS : job.attempts, err);
  }
}

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  // Exclude `draft` when over cap, so the cap never burns a retry attempt.
  const stages = (await draftsToday()) < Number(process.env.DAILY_DRAFT_CAP ?? 25)
    ? ALL_STAGES
    : ALL_STAGES.filter((s) => s !== "draft");

  const jobs = await claimJobs(Number(process.env.BATCH_SIZE ?? 5), stages);
  await Promise.allSettled(jobs.map(runOne));
  return Response.json({ claimed: jobs.length });
}
