import { scryptAsync } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";

// Чистый JS (без нативных биндингов) — работает одинаково и в Cloudflare
// Workers, и в обычном Node. CLI-скрипты в scripts/ не могут импортировать
// этот файл напрямую (Worker-only TS-модуль), поэтому та же логика
// продублирована в scripts/lib/password.mjs — при смене параметров менять
// оба файла синхронно.
const SCRYPT_N = 2 ** 15; // work factor
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Формат: scrypt$N$r$p$saltHex$hashHex
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: KEY_LEN,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = fromHex(parts[4]);
  const expected = fromHex(parts[5]);
  const derived = await scryptAsync(password, salt, { N, r, p, dkLen: expected.length });
  return timingSafeEqual(derived, expected);
}

// Хеш заведомо несуществующего пароля — используется, чтобы попытка входа с
// несуществующим username занимала по времени примерно столько же, сколько
// с существующим (защита от перебора логинов по времени ответа).
export const DUMMY_HASH =
  "scrypt$32768$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
