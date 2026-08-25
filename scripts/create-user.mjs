#!/usr/bin/env node
// Заводит нового пользователя (в т.ч. первого админа) в базе prm-finance-db.
// Запускать из корня репозитория: node scripts/create-user.mjs
//
// Пароль нигде не сохраняется и не логируется — только его scrypt-хеш,
// который затем одной SQL-командой вставляется в базу через `wrangler d1
// execute`. Временный .sql-файл с хешем удаляется сразу после выполнения.
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./lib/password.mjs";
import { ask, askHidden } from "./lib/prompt.mjs";

const DB_NAME = "prm-finance-db";
const ROLES = ["admin", "finance", "manager", "viewer"];
const TMP_FILE = fileURLToPath(new URL("./.tmp-create-user.sql", import.meta.url));

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function main() {
  console.log("=== Создание пользователя PRM Finance ===\n");

  const username = (await ask("Логин: ")).trim();
  if (!username) {
    console.error("Логин не может быть пустым.");
    process.exit(1);
  }

  const roleInput = (await ask(`Роль [${ROLES.join("/")}] (по умолчанию admin): `)).trim();
  const role = roleInput || "admin";
  if (!ROLES.includes(role)) {
    console.error(`Неизвестная роль "${role}". Допустимые: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const password = await askHidden("Пароль (минимум 8 символов): ");
  if (password.length < 8) {
    console.error("Пароль слишком короткий (минимум 8 символов).");
    process.exit(1);
  }
  const password2 = await askHidden("Повторите пароль: ");
  if (password !== password2) {
    console.error("Пароли не совпадают.");
    process.exit(1);
  }

  console.log("\nСчитаю хеш пароля (это может занять секунду)…");
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const sql = `INSERT INTO users (username, password_hash, role, is_active, failed_attempts, locked_until, created_at, updated_at) VALUES (${sqlQuote(
    username,
  )}, ${sqlQuote(passwordHash)}, ${sqlQuote(role)}, 1, 0, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`;
  writeFileSync(TMP_FILE, sql, "utf8");

  try {
    console.log("\nЗаписываю в локальную базу (--local)…");
    execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file", TMP_FILE], {
      stdio: "inherit",
    });

    const remoteAnswer = (await ask('\nЗаписать и на "боевую" (remote) базу? [Y/n]: '))
      .trim()
      .toLowerCase();
    if (remoteAnswer !== "n" && remoteAnswer !== "no" && remoteAnswer !== "нет") {
      console.log("\nЗаписываю в удалённую (remote) базу…");
      execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, "--remote", "--file", TMP_FILE], {
        stdio: "inherit",
      });
    }

    console.log(`\nГотово! Пользователь "${username}" (роль: ${role}) создан.`);
  } finally {
    unlinkSync(TMP_FILE);
  }
}

main().catch((err) => {
  console.error("\nОшибка:", err.message || err);
  process.exit(1);
});
