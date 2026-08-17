import "server-only";
import { buildPrompt, type SourceExcerpt } from "./template";
import { parseGeneratedJson } from "./json";

export type ResearchResult = { summary: string; hook: string; subject: string; body: string };

/** Plain fetch first, Firecrawl only as fallback — same reasoning as find-email.ts. */
async function scrapeSchool(website: string): Promise<SourceExcerpt[]> {
  const excerpts: SourceExcerpt[] = [];
  try {
    const res = await fetch(website, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      headers: { "User-Agent": process.env.SCRAPER_USER_AGENT! },
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 200) {
        excerpts.push({ url: website, title: null, excerpt: text.slice(0, 3600) });
      }
    }
  } catch {
    // fall through to Firecrawl
  }

  if (excerpts.length === 0 && process.env.FIRECRAWL_API_KEY) {
    const fc = await firecrawlScrape(website);
    if (fc) excerpts.push(fc);
  }

  return excerpts;
}

async function firecrawlScrape(url: string): Promise<SourceExcerpt | null> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    signal: AbortSignal.timeout(25_000),
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  if (!res.ok) throw new Error(`firecrawl scrape failed: ${res.status}`);
  const json = await res.json();
  const markdown: string | undefined = json?.data?.markdown;
  if (!markdown) return null;
  return { url, title: json?.data?.metadata?.title ?? null, excerpt: markdown.slice(0, 3600) };
}

export async function research(
  school: { name: string; city: string | null; state: string | null; website: string | null },
): Promise<{ result: ResearchResult; sources: SourceExcerpt[] }> {
  const sources = school.website ? await scrapeSchool(school.website) : [];
  const { system, user } = buildPrompt(school, sources);

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(25_000),
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_MODEL,
      temperature: 0.2,
      max_tokens: 650,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA_NIM_ERROR: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("NVIDIA_NIM_ERROR: empty completion");

  const result = parseGeneratedJson<ResearchResult>(content);
  return { result, sources };
}
