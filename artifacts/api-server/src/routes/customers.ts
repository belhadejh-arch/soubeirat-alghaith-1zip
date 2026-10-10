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
  maxCredit: string | null;
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
    maxCredit: c.maxCredit == null ? null : Number(c.maxCredit),
    lastPaymentDate: stats?.lastPaymentDate ?? null,
    txCount: stats?.txCount ?? 0,
  };
}

function parseCreditLimit(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8) {
    return undefined;
  }
  return amount.toFixed(2);
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
    const { familyId, familyName, name, phone, addedByUserId, addedByUserName, maxCredit } = req.body as {
      familyId: string;
      familyName: string;
      name: string;
      phone?: string;
      addedByUserId?: string;
      addedByUserName?: string;
      maxCredit?: unknown;
    };
    if (!familyId || !familyName || !name) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const hasMaxCredit = Object.prototype.hasOwnProperty.call(req.body, "maxCredit");
    if (hasMaxCredit && req.user?.role !== "admin" && req.user?.role !== "supervisor") {
      res.status(403).json({ error: "admin_only" });
      return;
    }
    const parsedMaxCredit = hasMaxCredit ? parseCreditLimit(maxCredit) : null;
    if (hasMaxCredit && parsedMaxCredit === undefined) {
      res.status(400).json({ error: "invalid_credit_limit" });
      return;
    }
    const [created] = await db
      .insert(customersTable)
      .values({
        familyId,
        familyName,
        name,
        phone: phone ?? "",
        maxCredit: parsedMaxCredit,
        addedByUserId: addedByUserId ?? null,
        addedByUserName: addedByUserName ?? "",
      })
      .returning();
    res.status(201).json(await enrichCustomer(created));
  } catch (err) {
    console.error("Create customer error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/customers/:id
router.patch("/:id", async (req, res) => {
  try {
    const { name, phone, familyName, maxCredit } = req.body as {
      name?: string;
      phone?: string;
      familyName?: string;
      maxCredit?: unknown;
    };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (familyName !== undefined) updates.familyName = familyName;
    if (Object.prototype.hasOwnProperty.call(req.body, "maxCredit")) {
      if (req.user?.role !== "admin" && req.user?.role !== "supervisor") {
        res.status(403).json({ error: "admin_only" });
        return;
      }
      const parsedMaxCredit = parseCreditLimit(maxCredit);
      if (parsedMaxCredit === undefined) {
        res.status(400).json({ error: "invalid_credit_limit" });
        return;
      }
      updates.maxCredit = parsedMaxCredit;
    }
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
    const { type, amount, description, userId, userName, date, time } =
      req.body as {
        type: string;
        amount: string | number;
        description?: string;
        userId?: string;
        userName?: string;
        date: string;
        time?: string;
      };
    if ((type !== "debt" && type !== "payment") || amount === undefined || amount === null || amount === "" || !date) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(Math.round(parsedAmount * 100) - parsedAmount * 100) > 1e-8) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }

    // Lock the customer row so simultaneous sales cannot both exceed the limit.
    const result = await db.transaction(async (tx) => {
      const [customer] = await tx
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, customerId))
        .limit(1)
        .for("update");
      if (!customer) return { kind: "not_found" as const };
      if (type === "debt" && customer.status === "blocked") return { kind: "blocked" as const };

      const [latest] = await tx
        .select({ balanceAfter: customerTransactionsTable.balanceAfter })
        .from(customerTransactionsTable)
        .where(eq(customerTransactionsTable.customerId, customerId))
        .orderBy(desc(customerTransactionsTable.createdAt))
        .limit(1);

      const prevBalance = Number(latest?.balanceAfter ?? "0");
      const prevCents = Math.round(prevBalance * 100);
      const amountCents = Math.round(parsedAmount * 100);
      const newBalanceCents = type === "debt" ? prevCents + amountCents : prevCents - amountCents;
      const newBalance = newBalanceCents / 100;
      if (
        type === "debt" &&
        customer.maxCredit !== null &&
        newBalanceCents > Math.round(Number(customer.maxCredit) * 100)
      ) {
        return {
          kind: "credit_limit_exceeded" as const,
          balance: prevBalance,
          maxCredit: Number(customer.maxCredit),
        };
      }

      const [created] = await tx
        .insert(customerTransactionsTable)
        .values({
          customerId,
          customerName: customer.name,
          familyId: customer.familyId,
          familyName: customer.familyName,
          type,
          amount: (amountCents / 100).toFixed(2),
          description: description ?? "",
          userId: userId ?? null,
          userName: userName ?? "",
          date,
          time: time ?? "",
          balanceBefore: prevBalance.toFixed(2),
          balanceAfter: newBalance.toFixed(2),
        })
        .returning();
      return { kind: "created" as const, created };
    });

    if (result.kind === "not_found") { res.status(404).json({ error: "customer_not_found" }); return; }
    if (result.kind === "blocked") { res.status(403).json({ error: "customer_blocked" }); return; }
    if (result.kind === "credit_limit_exceeded") {
      res.status(409).json({
        error: "customer_credit_limit_exceeded",
        balance: result.balance,
        maxCredit: result.maxCredit,
      });
      return;
    }
    res.status(201).json(result.created);
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
