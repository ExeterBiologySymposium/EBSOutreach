import "server-only";
import { createClient } from "@supabase/supabase-js";

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

export type Level = "middle" | "high" | "middle_high";
export type SchoolType = "public" | "private";
export type Registry = "nces_ccd" | "nces_pss";

export type OrgStatus =
  | "discovered"
  | "email_found"
  | "needs_manual"
  | "researched"
  | "drafted"
  | "draft_in_gmail"
  | "suppressed"
  | "sent"
  | "replied"
  | "bounced";

export type Org = {
  id: string;
  name: string;
  level: Level | null;
  school_type: SchoolType | null;
  state: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
  email_source: string | null;
  email_confidence: number;
  consent_basis: string | null;
  registry: Registry | null;
  registry_id: string | null;
  normalized_key: string | null;
  research_summary: string | null;
  research_hook: string | null;
  status: OrgStatus;
  notes: string | null;
  last_researched: string | null;
  drafted_at: string | null;
  gmail_draft_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Draft = {
  id: string;
  org_id: string;
  subject: string;
  body: string;
  is_fallback: boolean;
  model: string;
  updated_at: string;
};

export type Source = {
  id: string;
  org_id: string;
  url: string;
  title: string | null;
  excerpt: string | null;
  retrieved_at: string;
};

export async function getOrg(id: string): Promise<Org | null> {
  const { data, error } = await db.from("orgs").select("*").eq("id", id).single();
  if (error) return null;
  return data as Org;
}

export async function listOrgs(opts: { q?: string; status?: string; country?: string; limit?: number }) {
  let query = db.from("orgs").select("*").order("updated_at", { ascending: false });
  if (opts.q) query = query.ilike("name", `%${opts.q}%`);
  if (opts.status) query = query.eq("status", opts.status);
  query = query.limit(opts.limit ?? 100);
  const { data, error } = await query;
  if (error) throw new Error(`listOrgs failed: ${error.message}`);
  return (data ?? []) as Org[];
}

export async function getDraft(orgId: string): Promise<Draft | null> {
  const { data, error } = await db.from("drafts").select("*").eq("org_id", orgId).single();
  if (error) return null;
  return data as Draft;
}

export async function getSources(orgId: string): Promise<Source[]> {
  const { data, error } = await db.from("sources").select("*").eq("org_id", orgId);
  if (error) throw new Error(`getSources failed: ${error.message}`);
  return (data ?? []) as Source[];
}

export async function dashboardCounts(): Promise<Record<string, number>> {
  const { data, error } = await db.from("orgs").select("status");
  if (error) throw new Error(`dashboardCounts failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

export async function failedJobs() {
  const { data, error } = await db.from("jobs").select("*").eq("status", "failed").order("created_at", { ascending: false });
  if (error) throw new Error(`failedJobs failed: ${error.message}`);
  return data ?? [];
}
