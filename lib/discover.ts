import { classify, classifyPss } from "./grade-span";

/** Deterministic slug used as orgs.normalized_key so re-seeding is safe (upsert on conflict). */
export function slug(name: string, state: string, city: string): string {
  return `${name}-${state}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type OrgRow = {
  id: string;
  name: string;
  level: "middle" | "high" | "middle_high";
  school_type: "public" | "private";
  state: string | null;
  city: string | null;
  website: string | null;
  registry: "nces_ccd" | "nces_pss";
  registry_id: string;
  normalized_key: string;
  status: "discovered";
};

/**
 * CCD Public School Universe directory row -> OrgRow, or null to skip.
 * Verified column names against the real 2023-24 file (§8 build order step 3):
 * https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2324_w_1a_073124.zip
 */
export function ccdRowToOrg(row: Record<string, string>): OrgRow | null {
  if (row.SY_STATUS !== "1") return null; // not open
  const level = classify(row.GSLO, row.GSHI);
  if (!level) return null;

  const name = row.SCH_NAME?.trim();
  const state = row.LSTATE?.trim() || null;
  const city = row.LCITY?.trim() || null;
  const website = normalizeWebsite(row.WEBSITE);
  const registryId = row.NCESSCH?.trim();
  if (!name || !registryId) return null;

  return {
    id: `ccd-${registryId}`,
    name,
    level,
    school_type: "public",
    state,
    city,
    website,
    registry: "nces_ccd",
    registry_id: registryId,
    normalized_key: slug(name, state ?? "", city ?? ""),
    status: "discovered",
  };
}

/**
 * PSS Private School Universe Survey (2021-22 public-use file) row -> OrgRow.
 * PSS has no website column at all — every PSS org starts with website=null
 * and goes straight to needs_manual in the find_email stage. Grade span uses
 * numeric LOGR2022/HIGR2022 recodes, not CCD's PK/KG/01-12 text codes —
 * see lib/grade-span.ts classifyPss() for the verified code table.
 * https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip
 */
export function pssRowToOrg(row: Record<string, string>): OrgRow | null {
  const level = classifyPss(row.LOGR2022, row.HIGR2022);
  if (!level) return null;

  const name = row.PINST?.trim();
  const state = row.PSTABB?.trim() || null;
  const city = row.PCITY?.trim() || null;
  const registryId = row.PPIN?.trim();
  if (!name || !registryId) return null;

  return {
    id: `pss-${registryId}`,
    name,
    level,
    school_type: "private",
    state,
    city,
    website: null,
    registry: "nces_pss",
    registry_id: registryId,
    normalized_key: slug(name, state ?? "", city ?? ""),
    status: "discovered",
  };
}

function normalizeWebsite(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}
