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
        customers,
        customerTransactions,
        orders,
        tasks,
        notifications,
      },
    });
  } catch (err) {
    console.error("Report data error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

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

      // Re-insert in dependency order
      if (data.users?.length)
        await tx.insert(usersTable).values(data.users as never[]);
      if (data.customerFamilies?.length)
        await tx.insert(customerFamiliesTable).values(data.customerFamilies as never[]);
      if (data.suppliers?.length)
        await tx.insert(suppliersTable).values(data.suppliers as never[]);
      if (data.products?.length)
        await tx.insert(missingProductsTable).values(data.products as never[]);
      if (data.expenses?.length)
        await tx.insert(expensesTable).values(data.expenses as never[]);
      if (data.incomes?.length)
        await tx.insert(dailyIncomesTable).values(data.incomes as never[]);
      if (data.customers?.length)
        await tx.insert(customersTable).values(data.customers as never[]);
      if (data.supplierTransactions?.length)
        await tx.insert(supplierTransactionsTable).values(data.supplierTransactions as never[]);
      if (data.customerTransactions?.length)
        await tx.insert(customerTransactionsTable).values(data.customerTransactions as never[]);
      if (data.orders?.length)
        await tx.insert(purchaseOrdersTable).values(data.orders as never[]);
      if (data.tasks?.length)
        await tx.insert(tasksTable).values(data.tasks as never[]);
      if (data.notifications?.length)
        await tx.insert(notificationsTable).values(data.notifications as never[]);
    });

    res.json({ ok: true, restoredAt: new Date().toISOString() });
  } catch (err) {
    console.error("Backup restore error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
