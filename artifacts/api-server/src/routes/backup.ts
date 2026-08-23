import { Router } from "express";
import {
  db,
  usersTable,
  missingProductsTable,
  expensesTable,
  dailyIncomesTable,
  suppliersTable,
  supplierTransactionsTable,
  customerFamiliesTable,
  customersTable,
  customerTransactionsTable,
  purchaseOrdersTable,
  tasksTable,
  notificationsTable,
  dailyAccountsTable,
} from "@workspace/db";
import { authMiddleware, adminOnly } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// GET /api/backup — export all data as JSON
router.get("/", async (_req, res) => {
  try {
    const [
      users,
      products,
      expenses,
      incomes,
      suppliers,
      supplierTransactions,
      customerFamilies,
      customers,
      customerTransactions,
      orders,
      tasks,
      notifications,
      dailyAccounts,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(missingProductsTable),
      db.select().from(expensesTable),
      db.select().from(dailyIncomesTable),
      db.select().from(suppliersTable),
      db.select().from(supplierTransactionsTable),
      db.select().from(customerFamiliesTable),
      db.select().from(customersTable),
      db.select().from(customerTransactionsTable),
      db.select().from(purchaseOrdersTable),
      db.select().from(tasksTable),
      db.select().from(notificationsTable),
      db.select().from(dailyAccountsTable),
    ]);

    res.json({
      version: "1.0",
      app: "سوبيرات الغيث",
      exportedAt: new Date().toISOString(),
      data: {
        users,
        products,
        expenses,
        incomes,
        suppliers,
        supplierTransactions,
        customerFamilies,
        customers,
        customerTransactions,
        orders,
        tasks,
        notifications,
        dailyAccounts,
      },
    });
  } catch (err) {
    console.error("Backup export error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/backup/report — export all data for comprehensive report
router.get("/report", async (_req, res) => {
  try {
    const [
      users,
      products,
      expenses,
      incomes,
      suppliers,
      supplierTransactions,
      customerFamilies,
      customers,
      customerTransactions,
      orders,
      tasks,
      notifications,
      dailyAccounts,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(missingProductsTable),
      db.select().from(expensesTable),
      db.select().from(dailyIncomesTable),
      db.select().from(suppliersTable),
      db.select().from(supplierTransactionsTable),
      db.select().from(customerFamiliesTable),
      db.select().from(customersTable),
      db.select().from(customerTransactionsTable),
      db.select().from(purchaseOrdersTable),
      db.select().from(tasksTable),
      db.select().from(notificationsTable),
      db.select().from(dailyAccountsTable),
    ]);

    const totalIncome = incomes.reduce((s, r) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);
    const totalCustomerDebt = customerTransactions.reduce((acc, tx) => {
      if (tx.type === "debt") return acc + Number(tx.amount);
      if (tx.type === "payment") return acc - Number(tx.amount);
      return acc;
    }, 0);
    const totalSupplierDebt = supplierTransactions.reduce((acc, tx) => {
      if (tx.type === "debt") return acc + Number(tx.amount);
      if (tx.type === "payment") return acc - Number(tx.amount);
      return acc;
    }, 0);

    // Compute each customer's current balance from their latest transaction's balanceAfter
    const customerBalanceMap = new Map<string, number>();
    for (const tx of customerTransactions) {
      if (tx.customerId && tx.balanceAfter !== null && tx.balanceAfter !== undefined) {
        // Overwrite with each successive transaction — last one wins (DB order = insertion order)
        customerBalanceMap.set(tx.customerId, parseFloat(String(tx.balanceAfter)));
      }
    }
    const customersWithBalance = customers.map((c) => ({
      ...c,
      balance: customerBalanceMap.get(c.id) ?? 0,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
        totalCustomerDebt,
        totalSupplierDebt,
        userCount: users.length,
        supplierCount: suppliers.length,
        customerCount: customers.length,
        customerFamilyCount: customerFamilies.length,
        productCount: products.length,
        taskCount: tasks.length,
        notificationCount: notifications.length,
        orderCount: orders.length,
      },
      data: {
        users,
        products,
        expenses,
        incomes,
        suppliers,
        supplierTransactions,
        customerFamilies,
        customers: customersWithBalance,
        customerTransactions,
        orders,
        tasks,
        notifications,
        dailyAccounts,
      },
    });
  } catch (err) {
    console.error("Report data error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

function fixTimestamps(
  rows: unknown[],
  fields: string[] = ["createdAt"],
): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const r = row as Record<string, unknown>;
    const fixed: Record<string, unknown> = { ...r };
    for (const field of fields) {
      if (typeof fixed[field] === "string") {
        const d = new Date(fixed[field]);
        fixed[field] = isNaN(d.getTime()) ? null : d;
      }
    }
    return fixed;
  });
}

// POST /api/backup/restore — full restore from JSON backup
router.post("/restore", async (req, res) => {
  try {
    const { version, data } = req.body as {
      version?: string;
      data?: Record<string, unknown[]>;
    };

    if (!version || !data) {
      res.status(400).json({ error: "invalid_backup_format" });
      return;
    }

    await db.transaction(async (tx) => {
      // Delete in reverse-dependency order (no FK constraints, so any order works)
      await tx.delete(notificationsTable);
      await tx.delete(dailyAccountsTable);
      await tx.delete(tasksTable);
      await tx.delete(purchaseOrdersTable);
      await tx.delete(customerTransactionsTable);
      await tx.delete(supplierTransactionsTable);
      await tx.delete(customersTable);
      await tx.delete(customerFamiliesTable);
      await tx.delete(suppliersTable);
      await tx.delete(dailyIncomesTable);
      await tx.delete(expensesTable);
      await tx.delete(missingProductsTable);
      await tx.delete(usersTable);

      // Re-insert in dependency order, converting ISO timestamp strings → Date
      if (data.users?.length)
        await tx.insert(usersTable).values(fixTimestamps(data.users) as never[]);
      if (data.customerFamilies?.length)
        await tx.insert(customerFamiliesTable).values(fixTimestamps(data.customerFamilies) as never[]);
      if (data.suppliers?.length)
        await tx.insert(suppliersTable).values(fixTimestamps(data.suppliers) as never[]);
      if (data.products?.length)
        await tx.insert(missingProductsTable).values(fixTimestamps(data.products) as never[]);
      if (data.expenses?.length)
        await tx.insert(expensesTable).values(fixTimestamps(data.expenses) as never[]);
      if (data.incomes?.length)
        await tx.insert(dailyIncomesTable).values(fixTimestamps(data.incomes) as never[]);
      if (data.dailyAccounts?.length)
        await tx.insert(dailyAccountsTable).values(
          fixTimestamps(data.dailyAccounts, ["createdAt", "openedAt", "closedAt"]) as never[],
        );
      if (data.customers?.length)
        await tx.insert(customersTable).values(fixTimestamps(data.customers) as never[]);
      if (data.supplierTransactions?.length)
        await tx.insert(supplierTransactionsTable).values(fixTimestamps(data.supplierTransactions) as never[]);
      if (data.customerTransactions?.length)
        await tx.insert(customerTransactionsTable).values(fixTimestamps(data.customerTransactions) as never[]);
      if (data.orders?.length)
        await tx.insert(purchaseOrdersTable).values(fixTimestamps(data.orders) as never[]);
      if (data.tasks?.length)
        await tx.insert(tasksTable).values(fixTimestamps(data.tasks) as never[]);
      if (data.notifications?.length)
        await tx.insert(notificationsTable).values(fixTimestamps(data.notifications) as never[]);
    });

    res.json({ ok: true, restoredAt: new Date().toISOString() });
  } catch (err) {
    console.error("Backup restore error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
