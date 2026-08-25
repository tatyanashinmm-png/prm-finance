import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractNum: text("contract_num").notNull().unique(),
  clientName: text("client_name").notNull(),
  legalEntity: text("legal_entity"),
  status: text("status"),
  manager: text("manager"),
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
    invoiceNumber: text("invoice_number"),
    paidStatus: text("paid_status"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("invoices_contract_period_unique").on(table.contractId, table.periodId),
  ],
);
