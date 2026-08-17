#!/usr/bin/env node
// One-time bulk import from NCES CCD (public schools) and PSS (private
// schools) into the `orgs` table. Run locally: node scripts/seed-nces.mjs
//
// URLs and column names below were verified against the live files at build
// time (BUILD.md §8, §11 step 3) — see README.md "Verified data sources".

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ccdRowToOrg, pssRowToOrg } from "../lib/discover.ts";

const execFileAsync = promisify(execFile);

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — assume env vars are already exported in the shell
}

const CCD_ZIP_URL = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2324_w_1a_073124.zip";
const CCD_CSV_NAME = "ccd_sch_029_2324_w_1a_073124.csv";
const PSS_ZIP_URL = "https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip";
const PSS_CSV_NAME = "pss2122_pu.csv";

const CHUNK_SIZE = 500;

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

async function downloadAndExtract(url, csvName, dir) {
  const zipPath = join(dir, "download.zip");
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(zipPath, buf);

  console.log(`Extracting ${csvName} ...`);
  try {
    await execFileAsync("unzip", ["-o", "-j", zipPath, csvName, "-d", dir]);
  } catch (e) {
    throw new Error(
      `unzip failed — this script shells out to the system 'unzip' CLI rather than hand-rolling a ZIP parser. Install unzip and re-run. (${e.message})`,
    );
  }
  return readFile(join(dir, csvName), "latin1"); // CCD/PSS files are Latin-1, not UTF-8
}

/** Minimal RFC 4180 CSV line splitter — handles quoted fields with embedded commas. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function* parseCsv(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return;
  const header = parseCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = values[j] ?? "";
    yield row;
  }
}

async function upsertOrgs(orgRows) {
  let inserted = 0;
  for (let i = 0; i < orgRows.length; i += CHUNK_SIZE) {
    const chunk = orgRows.slice(i, i + CHUNK_SIZE);
    const { error } = await db.from("orgs").upsert(chunk, { onConflict: "normalized_key" });
    if (error) {
      console.error(`  chunk ${i}-${i + chunk.length} failed: ${error.message}`);
      continue;
    }
    inserted += chunk.length;
    process.stdout.write(`\r  upserted ${inserted}/${orgRows.length}`);
  }
  console.log();
  return inserted;
}

async function seedCcd(dir) {
  const csv = await downloadAndExtract(CCD_ZIP_URL, CCD_CSV_NAME, dir);
  const rows = [];
  let total = 0;
  for (const row of parseCsv(csv)) {
    total++;
    const org = ccdRowToOrg(row);
    if (org) rows.push(org);
  }
  console.log(`CCD: ${rows.length} middle/high schools with a valid grade span out of ${total} rows`);
  const withWebsite = rows.filter((r) => r.website).length;
  console.log(`CCD: ${withWebsite}/${rows.length} rows have a non-null website (${((withWebsite / rows.length) * 100).toFixed(1)}%)`);
  return upsertOrgs(rows);
}

async function seedPss(dir) {
  const csv = await downloadAndExtract(PSS_ZIP_URL, PSS_CSV_NAME, dir);
  const rows = [];
  let total = 0;
  for (const row of parseCsv(csv)) {
    total++;
    const org = pssRowToOrg(row);
    if (org) rows.push(org);
  }
  console.log(`PSS: ${rows.length} middle/high schools with a valid grade span out of ${total} rows`);
  console.log("PSS: website is always null (not present in this registry) — every PSS org needs manual email entry.");
  return upsertOrgs(rows);
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "nces-seed-"));
  try {
    const ccdCount = await seedCcd(dir);
    const pssCount = await seedPss(dir);
    console.log(`\nDone. Upserted ${ccdCount} CCD + ${pssCount} PSS orgs.`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
