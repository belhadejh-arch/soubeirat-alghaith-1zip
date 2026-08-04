import { Router } from "express";
import {
  db,
  customerFamiliesTable,
  customersTable,
  customerTransactionsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// ─── Customer Families ────────────────────────────────────────────────────────

// GET /api/customers/families
router.get("/families", async (_req, res) => {
  try {
    const families = await db.select().from(customerFamiliesTable).orderBy(customerFamiliesTable.createdAt);

    // Enrich with memberCount and totalBalance
    const enriched = await Promise.all(
      families.map(async (fam) => {
        const members = await db
          .select({ id: customersTable.id })
          .from(customersTable)
          .where(eq(customersTable.familyId, fam.id));

        const memberIds = members.map((m) => m.id);
        let totalBalance = 0;

        for (const cid of memberIds) {
          const [latest] = await db
            .select({ balanceAfter: customerTransactionsTable.balanceAfter })
            .from(customerTransactionsTable)
            .where(eq(customerTransactionsTable.customerId, cid))
            .orderBy(desc(customerTransactionsTable.createdAt))
            .limit(1);
          if (latest) totalBalance += parseFloat(latest.balanceAfter ?? "0");
        }

        return { ...fam, memberCount: memberIds.length, totalBalance };
      }),
    );
    res.json(enriched);
  } catch (err) {
    console.error("Get families error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/customers/families
router.post("/families", async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    if (!name) { res.status(400).json({ error: "missing_fields" }); return; }
    const [created] = await db
      .insert(customerFamiliesTable)
      .values({ name })
      .returning();
    res.status(201).json({ ...created, memberCount: 0, totalBalance: 0 });
  } catch (err) {
    console.error("Create family error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/customers/families/:id
router.patch("/families/:id", async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    const [updated] = await db
      .update(customerFamiliesTable)
      .set({ name })
      .where(eq(customerFamiliesTable.id, req.params.id))
      .returning();
    res.json({ ...updated, memberCount: 0, totalBalance: 0 });
  } catch (err) {
    console.error("Update family error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/customers/families/:id
router.delete("/families/:id", async (req, res) => {
  try {
    await db
      .delete(customerFamiliesTable)
      .where(eq(customerFamiliesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete family error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Customers ────────────────────────────────────────────────────────────────

async function enrichCustomer(c: {
  id: string;
  familyId: string;
  familyName: string;
  name: string;
  phone: string | null;
  status: string;
  createdAt: Date | null;
}) {
  const [latest] = await db
    .select({ balanceAfter: customerTransactionsTable.balanceAfter })
    .from(customerTransactionsTable)
    .where(eq(customerTransactionsTable.customerId, c.id))
    .orderBy(desc(customerTransactionsTable.createdAt))
    .limit(1);

  const [stats] = await db
    .select({
      txCount: sql<number>`COUNT(*)::int`,
      lastPaymentDate: sql<string | null>`MAX(CASE WHEN type = 'payment' THEN date END)`,
    })
    .from(customerTransactionsTable)
    .where(eq(customerTransactionsTable.customerId, c.id));

  return {
    ...c,
    balance: parseFloat(latest?.balanceAfter ?? "0"),
    lastPaymentDate: stats?.lastPaymentDate ?? null,
    txCount: stats?.txCount ?? 0,
  };
}

// GET /api/customers?familyId=
router.get("/", async (req, res) => {
  try {
    const { familyId } = req.query as { familyId?: string };
    let query = db.select().from(customersTable).$dynamic();
    if (familyId) query = query.where(eq(customersTable.familyId, familyId));
    const rows = await query.orderBy(customersTable.createdAt);
    const enriched = await Promise.all(rows.map(enrichCustomer));
    res.json(enriched);
  } catch (err) {
    console.error("Get customers error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/customers/stats/today-transactions
router.get("/stats/today-transactions", async (_req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const txs = await db
      .select()
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.date, today))
      .orderBy(desc(customerTransactionsTable.createdAt));
    res.json(txs);
  } catch (err) {
    console.error("Get today transactions error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/customers/stats
router.get("/stats", async (_req, res) => {
  try {
    const allCustomers = await db.select().from(customersTable);

    let totalDebt = 0;
    const customerBalances: { customerId: string; customerName: string; familyName: string; balance: number }[] = [];

    for (const c of allCustomers) {
      const [latest] = await db
        .select({ balanceAfter: customerTransactionsTable.balanceAfter })
        .from(customerTransactionsTable)
        .where(eq(customerTransactionsTable.customerId, c.id))
        .orderBy(desc(customerTransactionsTable.createdAt))
        .limit(1);
      const bal = parseFloat(latest?.balanceAfter ?? "0");
      totalDebt += bal;
      customerBalances.push({ customerId: c.id, customerName: c.name, familyName: c.familyName, balance: bal });
    }

    const families = await db.select().from(customerFamiliesTable);
    const familyBalances: { familyId: string; familyName: string; balance: number }[] = [];
    for (const f of families) {
      const bal = customerBalances
        .filter((cb) => allCustomers.find((c) => c.id === cb.customerId)?.familyId === f.id)
        .reduce((s, cb) => s + cb.balance, 0);
      familyBalances.push({ familyId: f.id, familyName: f.name, balance: bal });
    }

    // Today's totals
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayTxs = await db
      .select({ type: customerTransactionsTable.type, amount: customerTransactionsTable.amount })
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.date, today));
    const todayDebts = todayTxs.filter(t => t.type === 'debt').reduce((s, t) => s + parseFloat(t.amount ?? '0'), 0);
    const todayPayments = todayTxs.filter(t => t.type === 'payment').reduce((s, t) => s + parseFloat(t.amount ?? '0'), 0);

    res.json({
      totalDebt,
      familyCount: families.length,
      customerCount: allCustomers.length,
      blockedCount: allCustomers.filter((c) => c.status === "blocked").length,
      topCustomers: customerBalances.sort((a, b) => b.balance - a.balance).slice(0, 5),
      topFamilies: familyBalances.sort((a, b) => b.balance - a.balance).slice(0, 5),
      todayDebts,
      todayPayments,
    });
  } catch (err) {
    console.error("Get customer stats error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/customers
router.post("/", async (req, res) => {
  try {
    const { familyId, familyName, name, phone, addedByUserId, addedByUserName } = req.body as {
      familyId: string;
      familyName: string;
      name: string;
      phone?: string;
      addedByUserId?: string;
      addedByUserName?: string;
    };
    if (!familyId || !familyName || !name) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(customersTable)
      .values({
        familyId,
        familyName,
        name,
        phone: phone ?? "",
        addedByUserId: addedByUserId ?? null,
        addedByUserName: addedByUserName ?? "",
      })
      .returning();
    res.status(201).json({ ...created, balance: 0, lastPaymentDate: null, txCount: 0 });
  } catch (err) {
    console.error("Create customer error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/customers/:id
router.patch("/:id", async (req, res) => {
  try {
    const { name, phone, familyName } = req.body as {
      name?: string;
      phone?: string;
      familyName?: string;
    };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (familyName !== undefined) updates.familyName = familyName;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "nothing_to_update" });
      return;
    }
    const [updated] = await db
      .update(customersTable)
      .set(updates)
      .where(eq(customersTable.id, req.params.id))
      .returning();
    res.json(await enrichCustomer(updated));
  } catch (err) {
    console.error("Update customer error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/customers/:id/block
router.patch("/:id/block", async (req, res) => {
  try {
    const [existing] = await db
      .select({ status: customersTable.status })
      .from(customersTable)
      .where(eq(customersTable.id, req.params.id))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }

    const newStatus = existing.status === "blocked" ? "active" : "blocked";
    const [updated] = await db
      .update(customersTable)
      .set({ status: newStatus })
      .where(eq(customersTable.id, req.params.id))
      .returning();
    res.json(await enrichCustomer(updated));
  } catch (err) {
    console.error("Toggle block error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/customers/:id
router.delete("/:id", async (req, res) => {
  try {
    await db.delete(customersTable).where(eq(customersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete customer error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Customer Transactions ────────────────────────────────────────────────────

// GET /api/customers/:id/transactions
router.get("/:id/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.customerId, req.params.id))
      .orderBy(desc(customerTransactionsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("Get customer transactions error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/customers/:id/transactions
router.post("/:id/transactions", async (req, res) => {
  try {
    const customerId = req.params.id;
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1);
    if (!customer) { res.status(404).json({ error: "customer_not_found" }); return; }

    const { type, amount, description, userId, userName, date, time } =
      req.body as {
        type: string;
        amount: string;
        description?: string;
        userId?: string;
        userName?: string;
        date: string;
        time?: string;
      };
    if (!type || !amount || !date) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const [latest] = await db
      .select({ balanceAfter: customerTransactionsTable.balanceAfter })
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.customerId, customerId))
      .orderBy(desc(customerTransactionsTable.createdAt))
      .limit(1);

    const prevBalance = parseFloat(latest?.balanceAfter ?? "0");
    const amt = parseFloat(amount);
    const newBalance = type === "debt" ? prevBalance + amt : prevBalance - amt;

    const [created] = await db
      .insert(customerTransactionsTable)
      .values({
        customerId,
        customerName: customer.name,
        familyId: customer.familyId,
        familyName: customer.familyName,
        type,
        amount,
        description: description ?? "",
        userId: userId ?? null,
        userName: userName ?? "",
        date,
        time: time ?? "",
        balanceBefore: String(prevBalance),
        balanceAfter: String(newBalance),
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create customer transaction error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/customers/transactions/:txId
router.delete("/transactions/:txId", async (req, res) => {
  try {
    await db
      .delete(customerTransactionsTable)
      .where(eq(customerTransactionsTable.id, req.params.txId));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete customer transaction error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
