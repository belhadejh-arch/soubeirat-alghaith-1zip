import { Router } from "express";
import { db, suppliersTable, supplierTransactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/suppliers
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(suppliersTable)
      .orderBy(suppliersTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get suppliers error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/suppliers/balances
router.get("/balances", async (_req, res) => {
  try {
    // Get all suppliers and compute their current balance from latest transaction
    const suppliers = await db
      .select({ id: suppliersTable.id })
      .from(suppliersTable);

    const balances = await Promise.all(
      suppliers.map(async (s) => {
        const [latest] = await db
          .select({ balanceAfter: supplierTransactionsTable.balanceAfter })
          .from(supplierTransactionsTable)
          .where(eq(supplierTransactionsTable.supplierId, s.id))
          .orderBy(desc(supplierTransactionsTable.createdAt))
          .limit(1);
        return {
          supplierId: s.id,
          balance: parseFloat(latest?.balanceAfter ?? "0"),
        };
      }),
    );
    res.json(balances);
  } catch (err) {
    console.error("Get supplier balances error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/suppliers/:id/transactions
router.get("/:id/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(supplierTransactionsTable)
      .where(eq(supplierTransactionsTable.supplierId, req.params.id))
      .orderBy(desc(supplierTransactionsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("Get supplier transactions error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/suppliers
router.post("/", async (req, res) => {
  try {
    const { name, phone, address, notes } = req.body as {
      name: string;
      phone?: string;
      address?: string;
      notes?: string;
    };
    if (!name) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(suppliersTable)
      .values({
        name,
        phone: phone ?? "",
        address: address ?? "",
        notes: notes ?? "",
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create supplier error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/suppliers/:id/transactions
router.post("/:id/transactions", async (req, res) => {
  try {
    const supplierId = req.params.id;

    // Fetch the supplier to get the name
    const [supplier] = await db
      .select({ name: suppliersTable.name })
      .from(suppliersTable)
      .where(eq(suppliersTable.id, supplierId))
      .limit(1);
    if (!supplier) {
      res.status(404).json({ error: "supplier_not_found" });
      return;
    }

    const { type, amount, note, date, time, userId, userName } =
      req.body as {
        type: string;
        amount: string;
        note?: string;
        date: string;
        time?: string;
        userId?: string;
        userName?: string;
      };
    if (!type || !amount || !date) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    // Compute running balance
    const [latest] = await db
      .select({ balanceAfter: supplierTransactionsTable.balanceAfter })
      .from(supplierTransactionsTable)
      .where(eq(supplierTransactionsTable.supplierId, supplierId))
      .orderBy(desc(supplierTransactionsTable.createdAt))
      .limit(1);

    const prevBalance = parseFloat(latest?.balanceAfter ?? "0");
    const amt = parseFloat(amount);
    // debt increases balance, payment decreases balance
    const newBalance =
      type === "debt" ? prevBalance + amt : prevBalance - amt;

    const [created] = await db
      .insert(supplierTransactionsTable)
      .values({
        supplierId,
        supplierName: supplier.name,
        type,
        amount,
        note: note ?? "",
        date,
        time: time ?? "",
        userId: userId ?? null,
        userName: userName ?? "",
        balanceBefore: String(prevBalance),
        balanceAfter: String(newBalance),
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create supplier transaction error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/suppliers/:id
router.patch("/:id", async (req, res) => {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "nothing_to_update" });
      return;
    }
    const [updated] = await db
      .update(suppliersTable)
      .set(updates)
      .where(eq(suppliersTable.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("Update supplier error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/suppliers/:id
router.delete("/:id", async (req, res) => {
  try {
    await db
      .delete(suppliersTable)
      .where(eq(suppliersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete supplier error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
