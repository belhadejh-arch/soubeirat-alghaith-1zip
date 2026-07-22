import { Router } from "express";
import { db, suppliersTable, supplierTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// ─── Suppliers ────────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(rows);
});

// Aggregated balances for all suppliers (SUM debt - SUM payment)
router.get("/balances", async (_req, res) => {
  try {
    const rows = await db
      .select({
        supplierId: supplierTransactionsTable.supplierId,
        balance: sql<number>`
          COALESCE(SUM(CASE WHEN ${supplierTransactionsTable.type} = 'debt'
                       THEN ${supplierTransactionsTable.amount}::numeric
                       ELSE -${supplierTransactionsTable.amount}::numeric END), 0)`.as("balance"),
      })
      .from(supplierTransactionsTable)
      .groupBy(supplierTransactionsTable.supplierId);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    // Prevent duplicate names (case-insensitive)
    const existing = await db
      .select()
      .from(suppliersTable)
      .where(sql`lower(${suppliersTable.name}) = lower(${name})`)
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "duplicate_supplier" });
    }
    const [row] = await db.insert(suppliersTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    if (name) {
      // Check duplicate (exclude self)
      const existing = await db
        .select()
        .from(suppliersTable)
        .where(sql`lower(${suppliersTable.name}) = lower(${name}) AND ${suppliersTable.id} != ${req.params.id}`)
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "duplicate_supplier" });
      }
    }
    const update: Record<string, string> = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    const [row] = await db
      .update(suppliersTable)
      .set(update)
      .where(eq(suppliersTable.id, req.params.id))
      .returning();
    res.json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    // Cascade: delete transactions first
    await db.delete(supplierTransactionsTable).where(eq(supplierTransactionsTable.supplierId, req.params.id));
    await db.delete(suppliersTable).where(eq(suppliersTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Supplier Transactions ────────────────────────────────────────────────────
router.get("/:id/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(supplierTransactionsTable)
      .where(eq(supplierTransactionsTable.supplierId, req.params.id))
      .orderBy(supplierTransactionsTable.createdAt);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/:id/transactions", async (req, res) => {
  try {
    const supplierId = req.params.id;

    // Verify supplier exists
    const [supplier] = await db
      .select({ name: suppliersTable.name })
      .from(suppliersTable)
      .where(eq(suppliersTable.id, supplierId))
      .limit(1);
    if (!supplier) return res.status(404).json({ error: "supplier_not_found" });

    // Calculate balance before this transaction
    const [balRow] = await db
      .select({
        balance: sql<number>`COALESCE(SUM(
          CASE WHEN ${supplierTransactionsTable.type} = 'debt'
               THEN ${supplierTransactionsTable.amount}::numeric
               ELSE -${supplierTransactionsTable.amount}::numeric END
        ), 0)`,
      })
      .from(supplierTransactionsTable)
      .where(eq(supplierTransactionsTable.supplierId, supplierId));

    const balanceBefore = Number(balRow?.balance ?? 0);
    const { type, amount } = req.body as { type: "debt" | "payment"; amount: string | number };
    const numAmount = Number(amount);
    const balanceAfter = type === "debt"
      ? balanceBefore + numAmount
      : balanceBefore - numAmount;

    const [row] = await db
      .insert(supplierTransactionsTable)
      .values({
        ...req.body,
        supplierId,
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
      })
      .returning();
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
