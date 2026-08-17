const ROLE_SCORES: [RegExp, number][] = [
  [/^(info|admin|office|enquiries|enquiry|contact|reception|general|school|mail)@/i, 0.9],
  [/^(head|principal|headteacher|admissions|development|superintendent)@/i, 0.8],
  [/^[a-z]+[._-][a-z]+@/i, 0.4], // firstname.lastname — a real person, usable but weaker
];

const REJECT = /^(noreply|no-reply|donotreply|postmaster|abuse|webmaster|hostmaster|spam)@/i;
const STUDENT_HOST = /(student|pupil|alumni|kids)\./i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/staff-directory"];

export type Found = { email: string; confidence: number; source: string } | null;

export async function findEmail(website: string): Promise<Found> {
  const origin = new URL(website).origin;
  const siteHost = new URL(website).hostname.replace(/^www\./, "");
  const candidates: NonNullable<Found>[] = [];

  for (const path of PATHS) {
    const url = origin + path;
    const html = await fetchText(url);
    if (!html) continue;

    for (const raw of html.match(EMAIL_RE) ?? []) {
      const email = raw.toLowerCase();
      if (REJECT.test(email)) continue;

      const host = email.split("@")[1];
      if (STUDENT_HOST.test(host)) continue;
      // Must be on the school's own domain. Rejects addresses harvested from
      // embedded third-party widgets, CMS vendors, and website-builder footers.
      if (!host.endsWith(siteHost)) continue;

      const score = ROLE_SCORES.find(([re]) => re.test(email))?.[1] ?? 0.2;
      candidates.push({ email, confidence: score, source: url });
    }
    if (candidates.some((c) => c.confidence >= 0.9)) break; // good enough, stop fetching
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      headers: { "User-Agent": process.env.SCRAPER_USER_AGENT! },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null; // network failures are expected at this scale; the stage retries
  }
}
