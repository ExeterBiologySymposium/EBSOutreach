/** Tolerant extraction of a JSON object from LLM output — strips code fences and grabs the first {...} block. */
export function parseGeneratedJson<T = unknown>(raw: string): T {
  const stripped = raw.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`LLM_JSON_PARSE_FAILED: no JSON object found in: ${raw.slice(0, 200)}`);
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  } catch (e) {
    throw new Error(`LLM_JSON_PARSE_FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
