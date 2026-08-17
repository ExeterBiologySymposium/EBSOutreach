/**
 * LLMs routinely emit a literal newline inside a JSON string value (e.g. the
 * multi-paragraph "body" field) instead of an escaped "\n" — invalid per the
 * JSON spec (raw control chars 0x00-0x1F aren't allowed inside a string
 * literal). Track quote state and escape control chars only while inside a
 * string, so real structural whitespace between tokens is left alone.
 */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString && !escaped) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += { "\n": "\\n", "\r": "\\r", "\t": "\\t" }[ch] ?? `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    }
    out += ch;
    if (inString && ch === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !escaped) inString = !inString;
    escaped = false;
  }
  return out;
}

/** Tolerant extraction of a JSON object from LLM output — strips code fences and grabs the first {...} block. */
export function parseGeneratedJson<T = unknown>(raw: string): T {
  const stripped = raw.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`LLM_JSON_PARSE_FAILED: no JSON object found in: ${raw.slice(0, 200)}`);
  }
  const candidate = escapeControlCharsInStrings(stripped.slice(start, end + 1));
  try {
    return JSON.parse(candidate) as T;
  } catch (e) {
    throw new Error(`LLM_JSON_PARSE_FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
