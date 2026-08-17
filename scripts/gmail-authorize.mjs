#!/usr/bin/env node
// One-time OAuth2 consent flow for the consumer @gmail.com account.
// Run locally: node scripts/gmail-authorize.mjs
//
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local, and a
// Google Cloud OAuth client with http://localhost:3000/oauth2callback
// registered as an authorized redirect URI.

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { createServer } from "node:http";

try {
  process.loadEnvFile(".env.local");
} catch {
  // assume env vars are already exported in the shell
}

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token at all
  prompt: "consent", // required or Google skips issuing a refresh token on repeat consent
  scope: SCOPES,
});

console.log("Open this URL, sign in with the outreach @gmail.com account, and approve access:\n");
console.log(authUrl);
console.log("\nWaiting for the redirect to http://localhost:3000/oauth2callback ...");

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(error ? `Authorization failed: ${error}. You can close this tab.` : "Authorized. You can close this tab.");
    server.close();
    if (error) reject(new Error(error));
    else resolve(code);
  });
  server.listen(3000);
});

const { tokens } = await oauth2Client.getToken(code);
if (!tokens.refresh_token) {
  throw new Error(
    "No refresh_token returned. This happens if the account already granted consent previously — " +
      "revoke access at https://myaccount.google.com/permissions and re-run this script.",
  );
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { error } = await db.from("secrets").upsert({
  key: "gmail_refresh_token",
  value: tokens.refresh_token,
  updated_at: new Date().toISOString(),
});
if (error) throw new Error(`failed to store refresh token: ${error.message}`);

console.log("\nRefresh token stored in the secrets table.");
console.log(
  "\nCRITICAL: go to the Google Cloud Console -> APIs & Services -> OAuth consent screen and confirm " +
    "publishing status is 'In production', not 'Testing'. In Testing mode, this refresh token expires " +
    "in 7 days and the worker will start failing with invalid_grant.",
);
