// Обычный (не TypeScript) файл — чтобы CLI-скрипты запускались через
// `node`, без сборки, на любой версии Node 18+.
//
// Логика зеркалит worker/auth/password.ts (тот же формат хеша), потому что
// D1-биндинг воркера недоступен из обычного Node-процесса — хеш пароля
// приходится считать здесь и затем вставлять в базу через `wrangler d1
// execute`, а не через изолированный модуль доступа к базе (тот работает
// только внутри самого Worker'а).
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: KEY_LEN,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derived)}`;
}
