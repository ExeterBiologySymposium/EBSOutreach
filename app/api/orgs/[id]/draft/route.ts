import "server-only";
import { db, getOrg } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { STAGES } from "@/lib/stages";

export const runtime = "nodejs";

/**
 * POST { subject?, body?, action?: "push" | "regenerate" }
 * - subject/body present -> hand-edit the existing draft in place.
 * - action "regenerate" -> re-run draft from scratch (queued, async).
 * - action "push" (default) -> push the current draft to Gmail immediately.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrg(id);
  if (!org) return new Response("not found", { status: 404 });

  const payload = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { subject, body, action } = payload as { subject?: string; body?: string; action?: string };

  if (typeof subject === "string" || typeof body === "string") {
    const patch: Record<string, unknown> = {};
    if (typeof subject === "string") patch.subject = subject;
    if (typeof body === "string") patch.body = body;
    const { error } = await db.from("drafts").update(patch).eq("org_id", id);
    if (error) return new Response(error.message, { status: 400 });
  }

  if (action === "regenerate") {
    await enqueue(id, "draft", 10);
    return Response.json({ queued: "draft" });
  }

  try {
    await STAGES.push_gmail(org);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 400 });
  }
  const refreshed = await getOrg(id);
  return Response.json({ org: refreshed });
}
