export type Msg = { to: string; from: string; subject: string; body: string };

export function rawMessage({ to, from, subject, body }: Msg): string {
  // RFC 2047 encoded-word. Without this, a non-ASCII subject arrives as mojibake.
  const subj = /^[\x20-\x7E]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;

  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subj}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n"); // CRLF, not \n — required by RFC 2822

  return Buffer.from(mime, "utf8").toString("base64url");
}
