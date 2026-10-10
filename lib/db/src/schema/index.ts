import {
  pgTable, text, uuid, numeric, boolean, jsonb, timestamp, uniqueIndex, integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersTable = pgTable("users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  name:         text("name").notNull(),
  username:     text("username").unique().notNull(),
  phone:        text("phone").default(""),
  role:         text("role").notNull().default("worker"),
  status:       text("status").notNull().default("active"),
  passwordHash: text("password_hash").notNull(),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ─── Missing Products ─────────────────────────────────────────────────────────
export const missingProductsTable = pgTable("missing_products", {
  id:          uuid("id").defaultRandom().primaryKey(),
  name:        text("name").notNull(),
  quantity:    text("quantity").notNull(),
  section:     text("section").notNull(),
  workerId:    uuid("worker_id"),
  workerName:  text("worker_name").notNull(),
  date:        text("date").notNull(),
  time:        text("time").notNull(),
  status:      text("status").notNull().default("pending"),
  updatedBy:   text("updated_by"),
  updatedAt:   text("updated_at"),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expensesTable = pgTable("expenses", {
  id:          uuid("id").defaultRandom().primaryKey(),
  amount:      numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type:        text("type").notNull().default("expense"),
  // Legacy/imported rows may not have a recorded payment source.
  source:      text("source"),
  // Null means the expense belongs to the historical pre-period ledger.
  accountingPeriodId: uuid("accounting_period_id"),
  // Null is retained for legacy rows. New rows belong to the active daily account.
  dailyAccountId: uuid("daily_account_id"),
  description: text("description").default(""),
  date:        text("date").notNull(),
  time:        text("time").notNull(),
  userId:      uuid("user_id"),
  userName:    text("user_name").notNull(),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ─── Expense Accounting Periods ───────────────────────────────────────────────
// Starting a new period never edits or deletes expenses. New expenses are
// linked to the latest period, while legacy rows remain unassigned forever.
export const expensePeriodsTable = pgTable("expense_periods", {
  id:          uuid("id").defaultRandom().primaryKey(),
  // Assigned under the accounting lock, making period order deterministic.
  periodNumber: integer("period_number").notNull().default(1),
  startedAt:   timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  startedById: uuid("started_by_id"),
  startedByName: text("started_by_name").notNull().default(""),
}, (table) => [
  uniqueIndex("expense_periods_period_number_idx").on(table.periodNumber),
]);

// ─── Daily Incomes ────────────────────────────────────────────────────────────
export const dailyIncomesTable = pgTable("daily_incomes", {
  id:             uuid("id").defaultRandom().primaryKey(),
  amount:         numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date:           text("date").unique().notNull(),
  openingCash:    numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  actualCash:     numeric("actual_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedCash:   numeric("expected_cash", { precision: 12, scale: 2 }),
  cashDifference: numeric("cash_difference", { precision: 12, scale: 2 }),
  cashExpenses:   numeric("cash_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  fundExpenses:   numeric("fund_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  openingFund:    numeric("opening_fund", { precision: 12, scale: 2 }).notNull().default("0"),
  fundBalance:    numeric("fund_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  actualFund:     numeric("actual_fund", { precision: 12, scale: 2 }),
  fundDifference: numeric("fund_difference", { precision: 12, scale: 2 }),
  unclassifiedExpenses: numeric("unclassified_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  // Preserve historical/manual amounts; only physical-count rows are recalculated.
  calculationMode: text("calculation_mode").notNull().default("legacy"),
  createdAt:      timestamp("created_at").defaultNow(),
});

// ─── Daily Accounts ───────────────────────────────────────────────────────────
// New daily accounting cycle. Legacy daily_incomes rows stay untouched.
export const dailyAccountsTable = pgTable("daily_accounts", {
  id:                uuid("id").defaultRandom().primaryKey(),
  date:              text("date").notNull(),
  // Multiple append-only accounting cycles may exist for the same calendar day.
  cycleNumber:       integer("cycle_number").notNull().default(1),
  status:            text("status").notNull().default("open"),
  openingCash:       numeric("opening_cash", { precision: 12, scale: 2 }).notNull(),
  actualCash:        numeric("actual_cash", { precision: 12, scale: 2 }),
  tillExpenses:      numeric("till_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  fundExpenses:      numeric("fund_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  otherExpenses:     numeric("other_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  rossat:            numeric("rossat", { precision: 12, scale: 2 }).notNull().default("0"),
  transferredToFund: numeric("transferred_to_fund", { precision: 12, scale: 2 }).notNull().default("0"),
  totalExpenses:     numeric("total_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  net:               numeric("net", { precision: 12, scale: 2 }).notNull().default("0"),
  openingFund:       numeric("opening_fund", { precision: 12, scale: 2 }).notNull().default("0"),
  fundBalance:       numeric("fund_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  openedById:        uuid("opened_by_id"),
  openedByName:      text("opened_by_name").notNull().default(""),
  openedAt:          timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedById:        uuid("closed_by_id"),
  closedByName:      text("closed_by_name"),
  closedAt:          timestamp("closed_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_accounts_date_cycle_idx")
    .on(table.date, table.cycleNumber),
  uniqueIndex("daily_accounts_one_open_idx")
    .on(table.status)
    .where(sql`${table.status} = 'open'`),
]);

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersTable = pgTable("suppliers", {
  id:        uuid("id").defaultRandom().primaryKey(),
  name:      text("name").notNull(),
  phone:     text("phone").default(""),
  address:   text("address").default(""),
  notes:     text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Supplier Transactions ────────────────────────────────────────────────────
export const supplierTransactionsTable = pgTable("supplier_transactions", {
  id:            uuid("id").defaultRandom().primaryKey(),
  supplierId:    uuid("supplier_id"),
  supplierName:  text("supplier_name").notNull(),
  type:          text("type").notNull(),
  amount:        numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note:          text("note").default(""),
  date:          text("date").notNull(),
  time:          text("time").notNull().default(""),
  userId:        uuid("user_id"),
  userName:      text("user_name").notNull().default(""),
  balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceAfter:  numeric("balance_after",  { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt:     timestamp("created_at").defaultNow(),
});

// ─── Customer Families ────────────────────────────────────────────────────────
export const customerFamiliesTable = pgTable("customer_families", {
  id:        uuid("id").defaultRandom().primaryKey(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersTable = pgTable("customers", {
  id:               uuid("id").defaultRandom().primaryKey(),
  familyId:         uuid("family_id").notNull(),
  familyName:       text("family_name").notNull(),
  name:             text("name").notNull(),
  phone:            text("phone").default(""),
  status:           text("status").notNull().default("active"),
  maxCredit:        numeric("max_credit", { precision: 12, scale: 2 }),
  addedByUserId:    uuid("added_by_user_id"),
  addedByUserName:  text("added_by_user_name").notNull().default(""),
  createdAt:        timestamp("created_at").defaultNow(),
});

// ─── Customer Transactions ────────────────────────────────────────────────────
export const customerTransactionsTable = pgTable("customer_transactions", {
  id:            uuid("id").defaultRandom().primaryKey(),
  customerId:    uuid("customer_id").notNull(),
  customerName:  text("customer_name").notNull(),
  familyId:      uuid("family_id").notNull(),
  familyName:    text("family_name").notNull(),
  type:          text("type").notNull(),
  amount:        numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description:   text("description").default(""),
  userId:        uuid("user_id"),
  userName:      text("user_name").notNull().default(""),
  date:          text("date").notNull(),
  time:          text("time").notNull().default(""),
  balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceAfter:  numeric("balance_after",  { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt:     timestamp("created_at").defaultNow(),
});

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export const purchaseOrdersTable = pgTable("purchase_orders", {
  id:            uuid("id").defaultRandom().primaryKey(),
  orderNumber:   text("order_number").unique().notNull(),
  supplierId:    uuid("supplier_id"),
  supplierName:  text("supplier_name").notNull(),
  supplierPhone: text("supplier_phone").default(""),
  items:         jsonb("items").notNull().default([]),
  date:          text("date").notNull(),
  status:        text("status").notNull().default("draft"),
  notes:         text("notes").default(""),
  createdAt:     timestamp("created_at").defaultNow(),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksTable = pgTable("tasks", {
  id:             uuid("id").defaultRandom().primaryKey(),
  title:          text("title").notNull(),
  description:    text("description").default(""),
  workerId:       uuid("worker_id"),
  workerName:     text("worker_name").notNull(),
  date:           text("date").notNull(),
  time:           text("time").notNull(),
  priority:       text("priority").notNull().default("medium"),
  status:         text("status").notNull().default("pending"),
  postponeReason: text("postpone_reason"),
  createdById:    uuid("created_by_id"),
  createdByName:  text("created_by_name").notNull(),
  createdAt:      timestamp("created_at").defaultNow(),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsTable = pgTable("notifications", {
  id:        uuid("id").defaultRandom().primaryKey(),
  message:   text("message").notNull(),
  type:      text("type").notNull(),
  isRead:    boolean("is_read").notNull().default(false),
  date:      text("date").notNull(),
  time:      text("time").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────
export type DbUser                = typeof usersTable.$inferSelect;
export type DbMissingProduct      = typeof missingProductsTable.$inferSelect;
export type DbExpense             = typeof expensesTable.$inferSelect;
export type DbExpensePeriod       = typeof expensePeriodsTable.$inferSelect;
export type DbDailyIncome         = typeof dailyIncomesTable.$inferSelect;
export type DbDailyAccount        = typeof dailyAccountsTable.$inferSelect;
export type DbSupplier            = typeof suppliersTable.$inferSelect;
export type DbSupplierTransaction = typeof supplierTransactionsTable.$inferSelect;
export type DbPurchaseOrder       = typeof purchaseOrdersTable.$inferSelect;
export type DbTask                = typeof tasksTable.$inferSelect;
export type DbNotification        = typeof notificationsTable.$inferSelect;
export type DbCustomerFamily      = typeof customerFamiliesTable.$inferSelect;
export type DbCustomer            = typeof customersTable.$inferSelect;
export type DbCustomerTransaction = typeof customerTransactionsTable.$inferSelect;
