const SESSION_COOKIE = "session_token";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Сырой токен уходит в cookie пользователю, в базе хранится только его хеш.
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function newExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

export { SESSION_COOKIE, SESSION_TTL_MS };
