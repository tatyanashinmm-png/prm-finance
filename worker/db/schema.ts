import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    tariff: real("tariff").notNull(),
    effectiveFrom: text("effective_from").notNull(),
  },
  (table) => [
    uniqueIndex("tariffs_contract_effective_unique").on(table.contractId, table.effectiveFrom),
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
