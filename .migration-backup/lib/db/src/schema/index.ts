import {
  pgTable, text, uuid, numeric, boolean, jsonb, timestamp,
} from "drizzle-orm/pg-core";

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
  type:        text("type").notNull(),
  description: text("description").default(""),
  date:        text("date").notNull(),
  time:        text("time").notNull(),
  userId:      uuid("user_id"),
  userName:    text("user_name").notNull(),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ─── Daily Incomes ────────────────────────────────────────────────────────────
export const dailyIncomesTable = pgTable("daily_incomes", {
  id:        uuid("id").defaultRandom().primaryKey(),
  amount:    numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date:      text("date").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  type:          text("type").notNull(), // debt | payment
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
  id:         uuid("id").defaultRandom().primaryKey(),
  familyId:   uuid("family_id").notNull(),
  familyName: text("family_name").notNull(),
  name:       text("name").notNull(),
  phone:      text("phone").default(""),
  status:     text("status").notNull().default("active"), // active | blocked
  createdAt:  timestamp("created_at").defaultNow(),
});

// ─── Customer Transactions ────────────────────────────────────────────────────
export const customerTransactionsTable = pgTable("customer_transactions", {
  id:            uuid("id").defaultRandom().primaryKey(),
  customerId:    uuid("customer_id").notNull(),
  customerName:  text("customer_name").notNull(),
  familyId:      uuid("family_id").notNull(),
  familyName:    text("family_name").notNull(),
  type:          text("type").notNull(), // debt | payment
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
export type DbUser                  = typeof usersTable.$inferSelect;
export type DbMissingProduct        = typeof missingProductsTable.$inferSelect;
export type DbExpense               = typeof expensesTable.$inferSelect;
export type DbDailyIncome           = typeof dailyIncomesTable.$inferSelect;
export type DbSupplier              = typeof suppliersTable.$inferSelect;
export type DbSupplierTransaction   = typeof supplierTransactionsTable.$inferSelect;
export type DbPurchaseOrder         = typeof purchaseOrdersTable.$inferSelect;
export type DbTask                  = typeof tasksTable.$inferSelect;
export type DbNotification          = typeof notificationsTable.$inferSelect;
export type DbCustomerFamily        = typeof customerFamiliesTable.$inferSelect;
export type DbCustomer              = typeof customersTable.$inferSelect;
export type DbCustomerTransaction   = typeof customerTransactionsTable.$inferSelect;
