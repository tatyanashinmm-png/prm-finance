// Чистое ядро расчёта движения MRR месяц-к-месяцу (New/Churn) — без базы,
// без Cloudflare. Штуки — по факту оплаты в двух соседних периодах; деньги —
// по тарифу H (из tariffs), НЕ по фактической сумме счёта: у нового — тариф,
// действующий в текущем месяце, у оттока — тариф, действовавший в прошлом
// месяце (тот, что он платил перед уходом).
//
// Expansion/Contraction/Reactivation здесь не считаются — отдельный слой.

function isPaid(status) {
  return status === "Да";
}

function buildTariffIndex(tariffs) {
  const byContract = new Map();
  for (const t of tariffs) {
    if (!byContract.has(t.contractNum)) byContract.set(t.contractNum, []);
    byContract.get(t.contractNum).push(t);
  }
  for (const list of byContract.values()) {
    list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  return byContract;
}

function tariffAt(tariffIndex, contractNum, periodStart) {
  const list = tariffIndex.get(contractNum);
  if (!list) return null;
  let result = null;
  for (const t of list) {
    if (t.effectiveFrom <= periodStart) result = t.tariff;
    else break;
  }
  return result;
}

/**
 * @param {{contractNum:string, periodStart:string, paidStatus:string|null}[]} invoices
 * @param {{contractNum:string, tariff:number, effectiveFrom:string}[]} tariffs
 * @param {string} prevPeriodStart - "YYYY-MM-01", предыдущий месяц (P)
 * @param {string} curPeriodStart - "YYYY-MM-01", текущий месяц (M)
 */
export function computeMovement(invoices, tariffs, prevPeriodStart, curPeriodStart) {
  const paidPrev = new Set();
  const paidCur = new Set();
  for (const inv of invoices) {
    if (inv.periodStart === prevPeriodStart && isPaid(inv.paidStatus)) paidPrev.add(inv.contractNum);
    if (inv.periodStart === curPeriodStart && isPaid(inv.paidStatus)) paidCur.add(inv.contractNum);
  }

  const newContracts = [...paidCur].filter((cn) => !paidPrev.has(cn));
  const churnContracts = [...paidPrev].filter((cn) => !paidCur.has(cn));

  const tariffIndex = buildTariffIndex(tariffs);

  let newMRR = 0;
  const newContractsWithoutTariff = [];
  for (const cn of newContracts) {
    const tariff = tariffAt(tariffIndex, cn, curPeriodStart);
    if (tariff === null || tariff === undefined) {
      newContractsWithoutTariff.push(cn);
      continue;
    }
    newMRR += tariff;
  }

  let churnMRR = 0;
  const churnContractsWithoutTariff = [];
  for (const cn of churnContracts) {
    const tariff = tariffAt(tariffIndex, cn, prevPeriodStart);
    if (tariff === null || tariff === undefined) {
      churnContractsWithoutTariff.push(cn);
      continue;
    }
    churnMRR += tariff;
  }

  return {
    prevPeriodStart,
    curPeriodStart,
    newCount: newContracts.length,
    churnCount: churnContracts.length,
    netAdds: newContracts.length - churnContracts.length,
    newMRR,
    churnMRR: -churnMRR, // знак как в таблице: отток — отрицательное число
    monthlyChange: newMRR - churnMRR,
    newContracts,
    churnContracts,
    newContractsWithoutTariff,
    churnContractsWithoutTariff,
  };
}
