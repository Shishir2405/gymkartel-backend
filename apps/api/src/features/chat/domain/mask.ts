/**
 * PII masking for chat (product requirement, NOT optional). Applied to BOTH
 * directions — member→coach and coach→member — so nobody can move the
 * relationship off-platform. Masks phone numbers, UPI handles, and links.
 */

const PHONE_RE = /(?:\+?91[-\s]?)?[6-9]\d{9}\b/g;
const UPI_RE = /\b[a-z0-9._-]{2,}@[a-z]{2,}\b/gi;
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(?:com|in|io|co|me|link|app)\b[^\s]*)/gi;

export interface MaskResult {
  readonly text: string;
  readonly masked: boolean;
}

export const maskPii = (input: string): MaskResult => {
  let masked = false;
  const mark = <T>(v: T): T => {
    masked = true;
    return v;
  };
  const text = input
    // URLs first so an email-looking UPI inside a URL isn't double-handled.
    .replace(URL_RE, () => mark("[link hidden]"))
    .replace(PHONE_RE, () => mark("[number hidden]"))
    .replace(UPI_RE, () => mark("[handle hidden]"));
  return { text, masked };
};
