import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractNum: text("contract_num").notNull().unique(),
  clientName: text("client_name").notNull(),
  legalEntity: text("legal_entity"),
  status: text("status"),
  manager: text("manager"),
  note: text("note"),
  updatedAt: text("updated_at").notNull(),
});

export const periods = sqliteTable("periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodStart: text("period_start").notNull().unique(),
});

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id),
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id),
    invoiceAmount: real("invoice_amount").notNull(),
    paidStatus: text("paid_status"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("invoices_contract_period_unique").on(table.contractId, table.periodId),
  ],
);

// История тарифа контракта. Сейчас 1 контракт = 1 подписка = 1 тариф —
// сущность "подписка" отдельно не заводим. Натуральный ключ — пара
// (contract_id, effective_from): сейчас ровно одна запись на контракт,
// в будущем при смене тарифа появится новая запись с более поздней датой,
// апдейт той же даты — обновление существующей строки, не дубль.
export const tariffs = sqliteTable(
  "tariffs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id),
    tariff: real("tariff").notNull(),
    effectiveFrom: text("effective_from").notNull(),
  },
  (table) => [
    uniqueIndex("tariffs_contract_effective_unique").on(table.contractId, table.effectiveFrom),
  ],
);

// Рефакторинг модели данных (шаг 1.1) — clients/subscriptions вводятся
// АДДИТИВНО поверх contracts/invoices/tariffs, ничего в старой модели не
// меняется. Пока обе таблицы пустые (данные заполняются отдельным шагом
// 1.2); до переключения read-путей источником правды остаётся contracts.
export const clients = sqliteTable(
  "clients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Ключ группировки — nameKey (нижний регистр name). Группировка сейчас
    // приближённая: одноимённые разные юрлица допустимы, поэтому индекс
    // обычный, не unique. inn — будущий более надёжный ключ, пока пусто.
    nameKey: text("name_key").notNull(),
    inn: text("inn"),
    manager: text("manager"),
    status: text("status"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("clients_name_key_idx").on(table.nameKey)],
);

// contractNum — тот же натуральный ключ, что и contracts.contractNum
// (1:1 к контракту сегодня, отсюда unique-индекс); редактируемый, для
// заблокированных — BLOCK-<имя>, как и в contracts.
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    contractNum: text("contract_num").notNull(),
    legalEntity: text("legal_entity"),
    status: text("status"),
    manager: text("manager"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    billingCycle: text("billing_cycle"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_contract_num_unique").on(table.contractNum),
    index("subscriptions_client_id_idx").on(table.clientId),
  ],
);

export const USER_ROLES = ["admin", "finance", "manager", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Лимит попыток входа: сбрасываются при успешном логине, при накоплении
  // порога проставляется lockedUntil на несколько минут вперёд.
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  // Хранится ТОЛЬКО хеш токена сессии, не сырое значение из cookie.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
