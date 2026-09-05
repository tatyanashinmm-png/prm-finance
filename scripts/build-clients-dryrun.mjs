#!/usr/bin/env node
// Шаг 1.2a — СУХОЙ ПРОГОН группировки contracts → clients/subscriptions.
// НИЧЕГО не пишет в базу (ни INSERT, ни UPDATE) и никуда не публикует —
// только SELECT из ЛОКАЛЬНОЙ D1 и текстовый отчёт (консоль +
// baseline/dryrun-clients.txt, baseline/ уже в .gitignore).
// Запуск из корня репозитория: node scripts/build-clients-dryrun.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pickRepresentative, groupByNameKey } from "./lib/client-grouping.mjs";

const DB_NAME = "prm-finance-db";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
  );
  return JSON.parse(out)[0].results;
}

function main() {
  const lines = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log("Читаю contracts из ЛОКАЛЬНОЙ D1...");
  const rows = queryLocalD1(`
    SELECT contract_num as contractNum, client_name as clientName,
           legal_entity as legalEntity, status, manager, note
    FROM contracts;
  `);
  log(`Прочитано контрактов: ${rows.length}`);

  log("Читаю последний период по каждому контракту (invoices → periods)...");
  const latestRows = queryLocalD1(`
    SELECT c.contract_num as contractNum, MAX(p.period_start) as latestPeriod
    FROM contracts c
    LEFT JOIN invoices i ON i.contract_id = c.id
    LEFT JOIN periods p ON p.id = i.period_id
    GROUP BY c.id;
  `);
  const latestPeriodByContract = new Map(latestRows.map((r) => [r.contractNum, r.latestPeriod]));

  // --- нормализация (правило B) + группировка по name_key (client-grouping.mjs — общий с build-clients.mjs) ---
  const { withNames, groups } = groupByNameKey(rows);

  const renamed = [];
  for (const c of withNames) {
    if (c.normalizedName !== c.clientName) {
      renamed.push({ contractNum: c.contractNum, before: c.clientName, after: c.normalizedName });
    }
  }

  // sanity: префикс BLOCK- не должен просочиться в name_key
  const leakedBlockKeys = [...groups.keys()].filter((k) => k.startsWith("block-"));

  // --- ролап на каждую группу (правило C) ---
  const clientRollups = [];
  for (const [key, subs] of groups) {
    const activeSubs = subs.filter((s) => s.status === "Активен");
    const candidates = activeSubs.length > 0 ? activeSubs : subs;
    const representative = pickRepresentative(candidates, latestPeriodByContract);
    clientRollups.push({
      nameKey: key,
      displayName: representative.normalizedName,
      status: activeSubs.length > 0 ? "Активен" : "Блок",
      manager: representative.manager,
      subs,
      hasActive: activeSubs.length > 0,
    });
  }

  // --- многоподписочные клиенты + legal_entity-коллизии + разночтения normalizedName ---
  const multiSub = clientRollups.filter((g) => g.subs.length > 1);
  const legalEntityCollisions = [];
  const nameSpellingCollisions = [];
  for (const g of multiSub) {
    const legalEntities = new Set(g.subs.map((s) => s.legalEntity).filter((v) => v !== null && v !== ""));
    if (legalEntities.size > 1) legalEntityCollisions.push(g);
    const spellings = new Set(g.subs.map((s) => s.normalizedName));
    if (spellings.size > 1) nameSpellingCollisions.push(g);
  }

  // --- BLOCK- статистика ---
  const blockContracts = withNames.filter((c) => c.contractNum.startsWith("BLOCK-"));
  let blockJoinedActive = 0;
  let blockPureBlocked = 0;
  for (const c of blockContracts) {
    const group = groups.get(c.nameKey);
    const groupHasActive = group.some((s) => s.status === "Активен");
    if (groupHasActive) blockJoinedActive += 1;
    else blockPureBlocked += 1;
  }

  // --- целостность ---
  const totalSubsAcrossGroups = clientRollups.reduce((sum, g) => sum + g.subs.length, 0);

  log("");
  log("=== ИТОГИ ===");
  log(`Всего прочитано contracts: ${rows.length} (ожидание: 379)`);
  log(`Уникальных name_key (будущих clients): ${clientRollups.length}`);
  log(
    `Целостность: сумма подписок по всем группам = ${totalSubsAcrossGroups} — ${
      totalSubsAcrossGroups === rows.length ? "✅ PASS (== " + rows.length + ")" : "❌ FAIL"
    }`,
  );
  log(`Sanity BLOCK- в name_key: ${leakedBlockKeys.length === 0 ? "✅ PASS (ни одного не просочилось)" : "❌ FAIL: " + leakedBlockKeys.join(", ")}`);

  // Значения имён сами могут содержать кавычки (после нормализации) —
  // оборачивать их ещё и в литеральные "…" в логе нельзя, получится
  // путающее удвоение символа. Разделитель — [ ] и стрелка, не кавычки.
  log("");
  log(`=== Клиенты с >1 подпиской (${multiSub.length}) ===`);
  for (const g of multiSub.sort((a, b) => b.subs.length - a.subs.length)) {
    log(`[${g.displayName}] (${g.subs.length} подписок):`);
    for (const s of g.subs) {
      log(`  ${s.contractNum} | ${s.legalEntity ?? "—"}`);
    }
  }

  log("");
  log(`=== Потенциальные ложные склейки: разные legal_entity под одним name_key (${legalEntityCollisions.length}) ===`);
  if (legalEntityCollisions.length === 0) {
    log("(нет)");
  } else {
    for (const g of legalEntityCollisions) {
      log(`[${g.displayName}]:`);
      for (const s of g.subs) {
        log(`  ${s.contractNum} | ${s.legalEntity ?? "—"}`);
      }
    }
  }

  log("");
  log(`=== Разночтения написания имени внутри одного name_key (${nameSpellingCollisions.length}) ===`);
  if (nameSpellingCollisions.length === 0) {
    log("(нет)");
  } else {
    for (const g of nameSpellingCollisions) {
      const spellings = [...new Set(g.subs.map((s) => s.normalizedName))];
      log(`name_key=[${g.nameKey}]: ${spellings.map((s) => `[${s}]`).join(" / ")}`);
    }
  }

  log("");
  log(`=== Нормализация изменила имя (${renamed.length} контрактов) ===`);
  if (renamed.length === 0) {
    log("(нет изменений)");
  } else {
    for (const r of renamed) {
      log(`${r.contractNum}: [${r.before}] -> [${r.after}]`);
    }
  }

  log("");
  log("=== BLOCK-* контракты ===");
  log(`Всего BLOCK-*: ${blockContracts.length}`);
  log(`  подселились в карточку клиента с активными подписками: ${blockJoinedActive}`);
  log(`  образовали чисто заблокированную карточку: ${blockPureBlocked}`);
  const pureBlockedCards = clientRollups.filter((g) => !g.hasActive).length;
  log(`(для справки: всего чисто заблокированных карточек-клиентов: ${pureBlockedCards})`);

  mkdirSync("baseline", { recursive: true });
  writeFileSync("baseline/dryrun-clients.txt", lines.join("\n") + "\n");
  console.log("\nОтчёт сохранён: baseline/dryrun-clients.txt");
}

main();
