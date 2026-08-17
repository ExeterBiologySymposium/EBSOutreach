// Values below are sourced verbatim from the published site (index.html,
// about.html, schools.html) at the operator's direction. Do not add any
// further detail (dates, costs, eligibility specifics) that isn't already
// published on the site — the FILL_ME guard stays in place for anything
// not confirmed this way.

/** Two-sentence description of the symposium, given to the LLM as ground truth. Source: about.html, index.html */
export const PROGRAM_DESCRIPTION =
  "The Exeter Biology Symposium (EBS) is a student-organized, one-day dry-lab biology research symposium hosted Spring 2027 (Thursday, May 15, 2027) at Phillips Exeter Academy in Exeter, NH, open to high school and middle school students nationwide, in-person and online, with no prior research experience required. Students conduct original computational/dry-lab research (bioinformatics, epidemiology, computational modeling, literature review, etc.) and present it in a poster session judged by researchers and industry professionals; participation is free.";

/** Name of the sender the email is signed by. Source: user instruction. */
export const SENDER_NAME = "EBS Convening Team";

/** Sender's title/role. Source: team.html, about.html. */
export const SENDER_TITLE = "Exeter Biology Symposium, Genetics and Biotech Club, Phillips Exeter Academy";

/** CAN-SPAM requires a valid physical postal address in every message body. Source: index.html JSON-LD (PostalAddress). */
export const POSTAL_ADDRESS = "Phillips Exeter Academy, 20 Main Street, Exeter, NH, USA";

/** CAN-SPAM requires a clear, working opt-out mechanism in every message body. Source: reply channel published site-wide (mailto:exeterbiologysymposium@gmail.com). */
export const UNSUBSCRIBE_LINE =
  "To stop receiving emails from Exeter Biology Symposium, reply to this message or email exeterbiologysymposium@gmail.com and we will remove you from future outreach.";

export function hasUnfilled(): string[] {
  const fields: Record<string, string> = {
    PROGRAM_DESCRIPTION,
    SENDER_NAME,
    SENDER_TITLE,
    POSTAL_ADDRESS,
    UNSUBSCRIBE_LINE,
  };
  return Object.entries(fields)
    .filter(([, v]) => v.includes("FILL_ME"))
    .map(([k]) => k);
}

export function signatureBlock(): string {
  return [SENDER_NAME, SENDER_TITLE, PROGRAM_DESCRIPTION, POSTAL_ADDRESS, UNSUBSCRIBE_LINE].join("\n");
}

/**
 * Fully generic cold email — no LLM, no scrape, no per-school content.
 * POSTAL_ADDRESS and UNSUBSCRIBE_LINE stay non-negotiable: CAN-SPAM requires
 * both in every message body, generic or not.
 */
export function coldEmail(schoolName: string): { subject: string; body: string } {
  const body = [
    `Dear ${schoolName},`,
    "",
    PROGRAM_DESCRIPTION,
    "",
    "Best regards,",
    "Exeter Biology Symposium Convening Team",
    "Phillips Exeter Academy",
    "",
    POSTAL_ADDRESS,
    UNSUBSCRIBE_LINE,
  ].join("\n");
  return { subject: "Invitation: Exeter Biology Symposium", body };
}
