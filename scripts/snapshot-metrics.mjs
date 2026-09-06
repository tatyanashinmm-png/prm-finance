#!/usr/bin/env node
// Read-only снимок метрик из REMOTE D1 через чистое ядро worker/core/* —
// для сверки «до/после» вокруг рефакторинга модели данных (clients +
// subscriptions). НИЧЕГО не пишет в базу, никуда не публикует. Просто
// читает remote D1 через `wrangler d1 execute --remote --json` и считает
// через те же функции, что использует сам Worker (никакой новой формулы).
//
// Запуск из корня репозитория: node scripts/snapshot-metrics.mjs
// Результат: baseline/before-metrics.json (или другое имя через --out=...)
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeMonthlyMetrics } from "../worker/core/mrr.mjs";
import { computeMonthlyArpu } from "../worker/core/arpu.mjs";
import { computeMovement } from "../worker/core/movement.mjs";

const DB_NAME = "prm-finance-db";

const outArg = process.argv.find((a) => a.startsWith("--out="));
const outRelPath = outArg ? outArg.slice("--out=".length) : "baseline/before-metrics.json";

function queryRemoteD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--remote", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
  );
  return JSON.parse(out)[0].results;
}

async function main() {
  console.log("Читаю raw-счётчики из REMOTE D1...");
  const [counts] = queryRemoteD1(`
    SELECT
      (SELECT COUNT(*) FROM contracts) as contracts_total,
      (SELECT COUNT(*) FROM contracts WHERE status = 'Активен') as contracts_active,
      (SELECT COUNT(*) FROM contracts WHERE status = 'Блок') as contracts_blocked,
      (SELECT COUNT(*) FROM periods) as periods_total,
      (SELECT COUNT(*) FROM invoices) as invoices_total,
      (SELECT COUNT(*) FROM tariffs) as tariffs_total,
      (SELECT COUNT(*) FROM contracts c WHERE NOT EXISTS (SELECT 1 FROM tariffs t WHERE t.contract_id = c.id)) as contracts_without_tariff;
  `);

  console.log("Читаю invoices/tariffs из REMOTE D1...");
  const mrrInvoices = queryRemoteD1(`
    SELECT p.period_start as periodStart, i.invoice_amount as invoiceAmount, i.paid_status as paidStatus
    FROM invoices i
    JOIN periods p ON p.id = i.period_id;
  `);
  const arpuInvoices = queryRemoteD1(`
    SELECT c.contract_num as contractNum, p.period_start as periodStart, i.paid_status as paidStatus
    FROM invoices i
    JOIN contracts c ON c.id = i.contract_id
    JOIN periods p ON p.id = i.period_id;
  `);
  const tariffs = queryRemoteD1(`
    SELECT c.contract_num as contractNum, t.tariff, t.effective_from as effectiveFrom
    FROM tariffs t
    JOIN contracts c ON c.id = t.contract_id;
  `);
  console.log(`invoices: ${mrrInvoices.length}, tariffs: ${tariffs.length}`);

  const mrrByPeriod = computeMonthlyMetrics(mrrInvoices);
  const arpuByPeriod = computeMonthlyArpu(arpuInvoices, tariffs);
  const periods = [...mrrByPeriod.keys()].sort((a, b) => a.localeCompare(b));

  const months = periods.map((periodStart, i) => {
    const m = mrrByPeriod.get(periodStart);
    const movement = i > 0 ? computeMovement(arpuInvoices, tariffs, periods[i - 1], periodStart) : null;
    return {
      period_start: periodStart,
      issued_amount: m.issuedAmount,
      issued_count: m.issuedCount,
      paid_count: m.paidCount,
      mrr: m.mrr,
      arpu: arpuByPeriod.get(periodStart) ?? null,
      movement: movement && {
        new_count: movement.newCount,
        churn_count: movement.churnCount,
        net_adds: movement.netAdds,
        new_mrr: movement.newMRR,
        churn_mrr: movement.churnMRR,
        monthly_change: movement.monthlyChange,
      },
    };
  });

  const snapshot = {
    generated_at: new Date().toISOString(),
    source: "remote D1 (prm-finance-db) via wrangler d1 execute --remote, computed through worker/core/{mrr,arpu,movement}.mjs",
    counts,
    months,
  };

  const outPath = fileURLToPath(new URL(`../${outRelPath}`, import.meta.url));
  mkdirSync(new URL(`../${outRelPath.split("/").slice(0, -1).join("/")}/`, import.meta.url), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nГотово: ${outRelPath} (${months.length} месяцев, счётчики: ${JSON.stringify(counts)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
