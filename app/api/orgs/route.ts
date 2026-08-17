import "server-only";
import { listOrgs } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgs = await listOrgs({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    country: searchParams.get("country") ?? undefined,
  });
  return Response.json({ orgs });
}
