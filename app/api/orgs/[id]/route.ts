import "server-only";
import { db, getOrg, getDraft, getSources } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrg(id);
  if (!org) return new Response("not found", { status: 404 });
  const [draft, sources] = await Promise.all([getDraft(id), getSources(id)]);
  return Response.json({ org, draft, sources });
}

/** Manual edit — for needs_manual entries (e.g. hand-entering an email address). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["email", "website", "notes", "status"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return new Response("no editable fields provided", { status: 400 });
  }
  const { data, error } = await db.from("orgs").update(patch).eq("id", id).select().single();
  if (error) return new Response(error.message, { status: 400 });
  return Response.json({ org: data });
}
