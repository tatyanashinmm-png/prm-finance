// Логика группировки contracts -> clients/subscriptions (рефакторинг
// модели, шаг 1.2). Используется И сухим прогоном (build-clients-dryrun.mjs),
// И реальной записью (build-clients.mjs) — единственный источник правды,
// чтобы dry-run и real-run никогда не разошлись в поведении.

// --- Нормализация имени (правило B) ---
// Кавычки-варианты вокруг названия компании — ёлочки «», лапки „" "",
// одинарные '' — в этом датасете это ОДНА И ТА ЖЕ пунктуация (кавычки
// вокруг наименования ООО/ИП), не апострофы, поэтому ВСЕ они схлопываются
// в единственный прямой символ ". Уже прямая одинарная кавычка ' не
// трогается (могла быть частью названия как есть).
const QUOTE_CHARS = /[«»„“”‘’‚]/g;

export function normalizeName(raw) {
  let s = String(raw ?? "");
  s = s.trim().replace(/\s+/g, " "); // \s уже покрывает неразрывный пробел ( )
  s = s.replace(QUOTE_CHARS, '"');
  return s;
}

export function nameKey(normalized) {
  return normalized.toLowerCase();
}

// --- Тай-брейк для ролапа manager/status (правило C) ---
// Кандидаты: активные подписки группы, если есть хоть одна, иначе все.
// Из кандидатов — тот, у кого самый поздний период (MAX(period_start) по
// его invoices); при равенстве/отсутствии периода у всех кандидатов —
// тай-брейк по contract_num по убыванию (лексикографически последний).
export function pickRepresentative(candidates, latestPeriodByContract) {
  const sorted = [...candidates].sort((a, b) => {
    const pa = latestPeriodByContract.get(a.contractNum) ?? "";
    const pb = latestPeriodByContract.get(b.contractNum) ?? "";
    if (pa !== pb) return pb.localeCompare(pa);
    return b.contractNum.localeCompare(a.contractNum);
  });
  return sorted[0];
}

// --- Выбор отображаемого имени клиента при разночтениях (напр. RecPlace/Recplace) ---
// Побеждает написание с большим числом подписок; при равенстве —
// алфавитный тай-брейк по возрастанию (берётся первое по обычному
// строковому сравнению, напр. "RecPlace" < "Recplace" — заглавная буква
// меньше строчной).
export function pickClientDisplayName(subs) {
  const counts = new Map();
  for (const s of subs) counts.set(s.normalizedName, (counts.get(s.normalizedName) ?? 0) + 1);
  const candidates = [...counts.entries()];
  candidates.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return candidates[0][0];
}

// Группирует уже нормализованные контракты (ожидает поля contractNum,
// clientName, legalEntity, status, manager, note на каждой строке) по
// name_key — строго по client_name, никогда по contract_num (BLOCK-*).
export function groupByNameKey(contracts) {
  const withNames = contracts.map((c) => {
    const normalizedName = normalizeName(c.clientName);
    return { ...c, normalizedName, nameKey: nameKey(normalizedName) };
  });
  const groups = new Map();
  for (const c of withNames) {
    if (!groups.has(c.nameKey)) groups.set(c.nameKey, []);
    groups.get(c.nameKey).push(c);
  }
  return { withNames, groups };
}
