#!/usr/bin/env node
// Меняет пароль существующему пользователю. Запускать из корня репозитория:
// node scripts/reset-password.mjs
//
// Как и create-user.mjs — пароль нигде не сохраняется, только его хеш,
// временный .sql-файл удаляется сразу после выполнения.
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./lib/password.mjs";
import { ask, askHidden } from "./lib/prompt.mjs";

const DB_NAME = "prm-finance-db";
const TMP_FILE = fileURLToPath(new URL("./.tmp-reset-password.sql", import.meta.url));

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function userExists(target, username) {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DB_NAME,
      target,
      "--json",
      "--command",
      `SELECT id FROM users WHERE username = ${sqlQuote(username)};`,
    ],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  return Boolean(parsed?.[0]?.results?.length);
}

async function main() {
  console.log("=== Сброс пароля PRM Finance ===\n");

  const username = (await ask("Логин пользователя, которому меняем пароль: ")).trim();
  if (!username) {
    console.error("Логин не может быть пустым.");
    process.exit(1);
  }

  const password = await askHidden("Новый пароль (минимум 8 символов): ");
  if (password.length < 8) {
    console.error("Пароль слишком короткий (минимум 8 символов).");
    process.exit(1);
  }
  const password2 = await askHidden("Повторите новый пароль: ");
  if (password !== password2) {
    console.error("Пароли не совпадают.");
    process.exit(1);
  }

  console.log("\nСчитаю хеш пароля…");
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const sql = `UPDATE users SET password_hash = ${sqlQuote(passwordHash)}, failed_attempts = 0, locked_until = NULL, updated_at = ${sqlQuote(now)} WHERE username = ${sqlQuote(username)};`;
  writeFileSync(TMP_FILE, sql, "utf8");

  try {
    if (!userExists("--local", username)) {
      console.log(`\nВ локальной базе пользователя "${username}" нет — пропускаю --local.`);
    } else {
      console.log("\nОбновляю локальную базу (--local)…");
      execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file", TMP_FILE], {
        stdio: "inherit",
      });
    }

    if (!userExists("--remote", username)) {
      console.log(`В удалённой (remote) базе пользователя "${username}" нет — пропускаю --remote.`);
    } else {
      console.log("Обновляю удалённую (remote) базу…");
      execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, "--remote", "--file", TMP_FILE], {
        stdio: "inherit",
      });
    }

    console.log(`\nГотово! Пароль пользователя "${username}" обновлён.`);
  } finally {
    unlinkSync(TMP_FILE);
  }
}

main().catch((err) => {
  console.error("\nОшибка:", err.message || err);
  process.exit(1);
});
