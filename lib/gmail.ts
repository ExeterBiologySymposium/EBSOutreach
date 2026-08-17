import "server-only";
import { google } from "googleapis";
import { db } from "./db";
import { rawMessage, type Msg } from "./mime";

const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

export async function getAuth() {
  const { data } = await db.from("secrets")
    .select("value").eq("key", "gmail_refresh_token").single();
  if (!data) throw new Error("AUTH_MISSING: run scripts/gmail-authorize.mjs");

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback",
  );
  client.setCredentials({ refresh_token: data.value });

  // Persist rotation. Google may hand back a new refresh token; losing it
  // means the next cold start is unauthenticated.
  client.on("tokens", async (t) => {
    if (t.refresh_token) {
      await db.from("secrets").update({
        value: t.refresh_token,
        updated_at: new Date().toISOString(),
      }).eq("key", "gmail_refresh_token");
    }
  });
  return client;
}

export async function createDraft(msg: Msg): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth: await getAuth() });
  try {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: rawMessage(msg) } },
    });
    return res.data.id!;
  } catch (e: any) {
    // Distinct, non-retryable error. Backing off 4x won't fix a revoked token,
    // and silently retrying hides the real problem for days.
    if (e?.response?.data?.error === "invalid_grant") {
      throw new Error("AUTH_EXPIRED: refresh token revoked — re-run gmail-authorize.mjs and confirm the OAuth consent screen is published to production");
    }
    throw e;
  }
}

export { SCOPES };
