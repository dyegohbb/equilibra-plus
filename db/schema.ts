import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const walletType = pgEnum("wallet_type", ["CASH_ACCOUNT", "CREDIT_CARD"]);
export const categoryType = pgEnum("category_type", ["INCOME", "EXPENSE", "BOTH"]);
export const transactionType = pgEnum("transaction_type", ["INCOME", "EXPENSE", "TRANSFER", "CARD_PAYMENT"]);
export const purchaseMode = pgEnum("purchase_mode", ["CASH", "INSTALLMENT_VALUE", "TOTAL_VALUE"]);
export const scheduleFrequency = pgEnum("schedule_frequency", ["MONTHLY"]);
export const scheduleStatus = pgEnum("schedule_status", ["PENDING", "BILLED", "CANCELLED", "SKIPPED"]);

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(),
  type: walletType("type").notNull(), closingDay: integer("closing_day"), dueDay: integer("due_day"), active: boolean("active").default(true).notNull(), ...audit,
}, (t) => [index("wallets_user_active_idx").on(t.userId, t.active), check("wallet_card_days", sql`(${t.type} = 'CASH_ACCOUNT' AND ${t.closingDay} IS NULL AND ${t.dueDay} IS NULL) OR (${t.type} = 'CREDIT_CARD' AND ${t.closingDay} BETWEEN 1 AND 31 AND ${t.dueDay} BETWEEN 1 AND 31)`) ]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(), type: categoryType("type").default("BOTH").notNull(), active: boolean("active").default(true).notNull(), ...audit,
}, (t) => [index("categories_user_active_idx").on(t.userId, t.active)]);

export const purchases = pgTable("purchases", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), description: text("description").notNull(), mode: purchaseMode("mode").notNull(), totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull(), installmentTotal: integer("installment_total").default(1).notNull(), ...audit,
}, (t) => [index("purchases_user_idx").on(t.userId), check("purchase_positive", sql`${t.totalAmountCents} > 0 AND ${t.installmentTotal} > 0`)]);

export const scheduledRules = pgTable("scheduled_rules", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), description: text("description").notNull(), defaultAmountCents: bigint("default_amount_cents", { mode: "number" }).notNull(), type: transactionType("type").notNull(), categoryId: uuid("category_id").references(() => categories.id), frequency: scheduleFrequency("frequency").default("MONTHLY").notNull(), startCompetence: date("start_competence").notNull(), endCompetence: date("end_competence"), active: boolean("active").default(true).notNull(), ...audit,
}, (t) => [index("scheduled_rules_user_idx").on(t.userId)]);

export const scheduledEntries = pgTable("scheduled_entries", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), scheduledRuleId: uuid("scheduled_rule_id").notNull().references(() => scheduledRules.id), description: text("description").notNull(), expectedAmountCents: bigint("expected_amount_cents", { mode: "number" }).notNull(), competence: date("competence").notNull(), status: scheduleStatus("status").default("PENDING").notNull(), billedTransactionId: uuid("billed_transaction_id"), ...audit,
}, (t) => [index("scheduled_entries_user_comp_status_idx").on(t.userId, t.competence, t.status), index("scheduled_entries_rule_idx").on(t.scheduledRuleId), uniqueIndex("scheduled_rule_comp_unique").on(t.scheduledRuleId, t.competence)]);

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id").notNull(), walletId: uuid("wallet_id").notNull().references(() => wallets.id), purchaseId: uuid("purchase_id").references(() => purchases.id), scheduledEntryId: uuid("scheduled_entry_id").references(() => scheduledEntries.id), transferId: uuid("transfer_id"), description: text("description").notNull(), amountCents: bigint("amount_cents", { mode: "number" }).notNull(), type: transactionType("type").notNull(), categoryId: uuid("category_id").references(() => categories.id), consumptionDate: date("consumption_date").notNull(), competence: date("competence").notNull(), installmentNumber: integer("installment_number"), installmentTotal: integer("installment_total"), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...audit,
}, (t) => [index("transactions_user_comp_idx").on(t.userId, t.competence), index("transactions_user_wallet_comp_idx").on(t.userId, t.walletId, t.competence), index("transactions_user_consumption_idx").on(t.userId, t.consumptionDate), index("transactions_purchase_idx").on(t.purchaseId), index("transactions_transfer_idx").on(t.transferId), index("transactions_user_deleted_idx").on(t.userId, t.deletedAt), check("transaction_non_zero", sql`${t.amountCents} <> 0`), check("transaction_installments", sql`(${t.installmentNumber} IS NULL AND ${t.installmentTotal} IS NULL) OR (${t.installmentNumber} BETWEEN 1 AND ${t.installmentTotal})`)]);
