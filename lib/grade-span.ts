const ORDER = ["PK", "KG", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

/** Returns null for ungraded/adult/unknown spans — those are skipped entirely. */
export function classify(lo: string, hi: string): "middle" | "high" | "middle_high" | null {
  const l = ORDER.indexOf(lo.trim().toUpperCase().padStart(2, "0"));
  const h = ORDER.indexOf(hi.trim().toUpperCase().padStart(2, "0"));
  if (l < 0 || h < 0 || h < l) return null;

  const MID_LO = ORDER.indexOf("06"), MID_HI = ORDER.indexOf("08");
  const HI_LO = ORDER.indexOf("09"), HI_HI = ORDER.indexOf("12");

  const hasMiddle = l <= MID_HI && h >= MID_LO;
  const hasHigh = l <= HI_HI && h >= HI_LO;

  if (hasMiddle && hasHigh) return "middle_high";
  if (hasHigh) return "high";
  if (hasMiddle) return "middle";
  return null; // elementary-only — not a target
}

/**
 * PSS (private schools) encodes grade span as LOGR2022/HIGR2022 numeric
 * recodes, not CCD's PK/KG/01-12 text codes — confirmed against the NCES
 * PSS 2021-22 codebook (nces.ed.gov/surveys/pss/zip/codebook2021_22.zip).
 * Code 1 = ungraded, 2 = PK, 3 = K, 4-5 = transitional K/1st (treated as
 * elementary), 6-17 = 1st through 12th grade.
 */
const PSS_TO_CCD: Record<string, string> = {
  "1": "", // ungraded — handled as null below
  "2": "PK",
  "3": "KG",
  "4": "KG",
  "5": "KG",
  "6": "01",
  "7": "02",
  "8": "03",
  "9": "04",
  "10": "05",
  "11": "06",
  "12": "07",
  "13": "08",
  "14": "09",
  "15": "10",
  "16": "11",
  "17": "12",
};

export function classifyPss(logr: string, higr: string): "middle" | "high" | "middle_high" | null {
  const lo = PSS_TO_CCD[logr.trim()];
  const hi = PSS_TO_CCD[higr.trim()];
  if (!lo || !hi) return null; // ungraded (code 1) or unrecognized code
  return classify(lo, hi);
}
