import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const sessionDigest = (token: string) => createHash("sha256").update(token).digest();
export const randomToken = () => randomBytes(32).toString("base64url");
function mac(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
export function issueCsrf(binding: string, secret: string, now = Date.now()) {
  const payload = `${now + 15 * 60_000}.${randomToken()}`;
  return `${payload}.${mac(`${binding}:${payload}`, secret)}`;
}
export function validCsrf(token: string, binding: string, secret: string, now = Date.now()) {
  if (token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const expires = Number(parts[0]);
  if (expires <= now || expires > now + 15 * 60_000) return false;
  const expected = Buffer.from(mac(`${binding}:${parts[0]}.${parts[1]}`, secret));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const bucketDigest = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest();

export function signChangeSnapshot(payload: { sessionId: string; expiresAt: number; ids: string[] }, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`changes:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyChangeSnapshot(token: string, sessionId: string, secret: string, now = Date.now()) {
  if (token.length > 8192) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(`changes:${encoded}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.sessionId !== sessionId || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now ||
      !Array.isArray(payload.ids) || payload.ids.length > 400 || payload.ids.some((id: unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return null;
    return payload as { sessionId: string; expiresAt: number; ids: string[] };
  } catch { return null; }
}
