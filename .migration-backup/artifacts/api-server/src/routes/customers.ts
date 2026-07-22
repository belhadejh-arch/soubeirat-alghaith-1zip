import { Router } from "express";
import { db, customerFamiliesTable, customersTable, customerTransactionsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import type { Request, Response, NextFunction } from "express";

function adminOrSupervisor(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

const router = Router();
router.use(authMiddleware);

// ─── Helper: compute current balance for a customer ───────────────────────────
async function getCustomerBalance(customerId: string): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`COALESCE(SUM(
        CASE WHEN ${customerTransactionsTable.type} = 'debt'
             THEN ${customerTransactionsTable.amount}::numeric
             ELSE -${customerTransactionsTable.amount}::numeric END
      ), 0)`,
    })
    .from(customerTransactionsTable)
    .where(eq(customerTransactionsTable.customerId, customerId));
  return Number(row?.balance ?? 0);
}

// ─── Families ─────────────────────────────────────────────────────────────────

// List all families with aggregated stats
router.get("/families", async (_req, res) => {
  try {
    const families = await db
      .select()
      .from(customerFamiliesTable)
      .orderBy(customerFamiliesTable.name);

    // Get member counts and balances
    const memberStats = await db
      .select({
        familyId: customersTable.familyId,
        memberCount: sql<number>`COUNT(*)`,
      })
      .from(customersTable)
      .groupBy(customersTable.familyId);

    const balanceStats = await db
      .select({
        familyId: customerTransactionsTable.familyId,
        totalBalance: sql<number>`COALESCE(SUM(
          CASE WHEN ${customerTransactionsTable.type} = 'debt'
               THEN ${customerTransactionsTable.amount}::numeric
               ELSE -${customerTransactionsTable.amount}::numeric END
        ), 0)`,
      })
      .from(customerTransactionsTable)
      .groupBy(customerTransactionsTable.familyId);

    const memberMap = new Map(memberStats.map(s => [s.familyId, Number(s.memberCount)]));
    const balanceMap = new Map(balanceStats.map(s => [s.familyId, Number(s.totalBalance)]));

    const result = families.map(f => ({
      ...f,
      memberCount: memberMap.get(f.id) ?? 0,
      totalBalance: balanceMap.get(f.id) ?? 0,
    }));

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// Create family
router.post("/families", adminOrSupervisor, async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    if (!name?.trim()) return res.status(400).json({ error: "name_required" });

    const existing = await db
      .select()
      .from(customerFamiliesTable)
      .where(sql`lower(${customerFamiliesTable.name}) = lower(${name.trim()})`)
      .limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "duplicate_family" });

    const [row] = await db.insert(customerFamiliesTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Update family
router.patch("/families/:familyId", adminOrSupervisor, async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    if (!name?.trim()) return res.status(400).json({ error: "name_required" });

    const existing = await db
      .select()
      .from(customerFamiliesTable)
      .where(
        sql`lower(${customerFamiliesTable.name}) = lower(${name.trim()}) AND ${customerFamiliesTable.id} != ${req.params.familyId}`
      )
      .limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "duplicate_family" });

    const [row] = await db
      .update(customerFamiliesTable)
      .set({ name: name.trim() })
      .where(eq(customerFamiliesTable.id, req.params.familyId))
      .returning();

    // Also update familyName in customers and transactions
    await db
      .update(customersTable)
      .set({ familyName: name.trim() })
      .where(eq(customersTable.familyId, req.params.familyId));
    await db
      .update(customerTransactionsTable)
      .set({ familyName: name.trim() })
      .where(eq(customerTransactionsTable.familyId, req.params.familyId));

    res.json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Delete family (cascade)
router.delete("/families/:familyId", adminOrSupervisor, async (req, res) => {
  try {
    // Get all customers in family
    const customers = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.familyId, req.params.familyId));

    // Delete their transactions
    for (const c of customers) {
      await db.delete(customerTransactionsTable).where(eq(customerTransactionsTable.customerId, c.id));
    }
    // Delete customers
    await db.delete(customersTable).where(eq(customersTable.familyId, req.params.familyId));
    // Delete family
    await db.delete(customerFamiliesTable).where(eq(customerFamiliesTable.id, req.params.familyId));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [totalDebt] = await db
      .select({
        value: sql<number>`COALESCE(SUM(
          CASE WHEN ${customerTransactionsTable.type} = 'debt'
               THEN ${customerTransactionsTable.amount}::numeric
               ELSE -${customerTransactionsTable.amount}::numeric END
        ), 0)`,
      })
      .from(customerTransactionsTable);

    const [familyCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customerFamiliesTable);

    const [customerCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customersTable);

    const [blockedCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customersTable)
      .where(eq(customersTable.status, "blocked"));

    // Top 10 customers by balance
    const topCustomers = await db
      .select({
        customerId: customerTransactionsTable.customerId,
        customerName: customerTransactionsTable.customerName,
        familyName: customerTransactionsTable.familyName,
        balance: sql<number>`COALESCE(SUM(
          CASE WHEN ${customerTransactionsTable.type} = 'debt'
               THEN ${customerTransactionsTable.amount}::numeric
               ELSE -${customerTransactionsTable.amount}::numeric END
        ), 0)`,
      })
      .from(customerTransactionsTable)
      .groupBy(
        customerTransactionsTable.customerId,
        customerTransactionsTable.customerName,
        customerTransactionsTable.familyName
      )
      .orderBy(sql`balance DESC`)
      .limit(10);

    // Top 10 families by balance
    const topFamilies = await db
      .select({
        familyId: customerTransactionsTable.familyId,
        familyName: customerTransactionsTable.familyName,
        balance: sql<number>`COALESCE(SUM(
          CASE WHEN ${customerTransactionsTable.type} = 'debt'
               THEN ${customerTransactionsTable.amount}::numeric
               ELSE -${customerTransactionsTable.amount}::numeric END
        ), 0)`,
      })
      .from(customerTransactionsTable)
      .groupBy(
        customerTransactionsTable.familyId,
        customerTransactionsTable.familyName
      )
      .orderBy(sql`balance DESC`)
      .limit(10);

    res.json({
      totalDebt: Number(totalDebt?.value ?? 0),
      familyCount: Number(familyCount?.count ?? 0),
      customerCount: Number(customerCount?.count ?? 0),
      blockedCount: Number(blockedCount?.count ?? 0),
      topCustomers: topCustomers.map(r => ({ ...r, balance: Number(r.balance) })),
      topFamilies: topFamilies.map(r => ({ ...r, balance: Number(r.balance) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Transaction delete (before /:id to avoid conflict) ──────────────────────
router.delete("/transactions/:txId", adminOrSupervisor, async (req, res) => {
  try {
    await db
      .delete(customerTransactionsTable)
      .where(eq(customerTransactionsTable.id, req.params.txId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Customers ────────────────────────────────────────────────────────────────

// List customers (all or by family)
router.get("/", async (req, res) => {
  try {
    const { familyId } = req.query as { familyId?: string };

    const rows = familyId
      ? await db.select().from(customersTable).where(eq(customersTable.familyId, familyId)).orderBy(customersTable.name)
      : await db.select().from(customersTable).orderBy(customersTable.name);

    // Get balances for all customers
    const balances = await db
      .select({
        customerId: customerTransactionsTable.customerId,
        balance: sql<number>`COALESCE(SUM(
          CASE WHEN ${customerTransactionsTable.type} = 'debt'
               THEN ${customerTransactionsTable.amount}::numeric
               ELSE -${customerTransactionsTable.amount}::numeric END
        ), 0)`,
        lastPaymentDate: sql<string>`MAX(CASE WHEN ${customerTransactionsTable.type} = 'payment' THEN ${customerTransactionsTable.date} END)`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(customerTransactionsTable)
      .where(
        familyId
          ? and(
              sql`${customerTransactionsTable.customerId} = ANY(
                SELECT id FROM customers WHERE family_id = ${familyId}
              )`
            )
          : sql`true`
      )
      .groupBy(customerTransactionsTable.customerId);

    const balanceMap = new Map(
      balances.map(b => [b.customerId, { balance: Number(b.balance), lastPaymentDate: b.lastPaymentDate ?? null, txCount: Number(b.txCount) }])
    );

    const result = rows.map(c => ({
      ...c,
      balance: balanceMap.get(c.id)?.balance ?? 0,
      lastPaymentDate: balanceMap.get(c.id)?.lastPaymentDate ?? null,
      txCount: balanceMap.get(c.id)?.txCount ?? 0,
    }));

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// Create customer
router.post("/", adminOrSupervisor, async (req, res) => {
  try {
    const { familyId, familyName, name, phone } = req.body as {
      familyId: string; familyName: string; name: string; phone?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "name_required" });
    if (!familyId)     return res.status(400).json({ error: "family_required" });

    const [row] = await db
      .insert(customersTable)
      .values({ familyId, familyName, name: name.trim(), phone: phone?.trim() ?? "" })
      .returning();
    res.status(201).json({ ...row, balance: 0, lastPaymentDate: null, txCount: 0 });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Update customer
router.patch("/:id", adminOrSupervisor, async (req, res) => {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    const update: Record<string, string> = {};
    if (name  !== undefined) update.name  = name.trim();
    if (phone !== undefined) update.phone = phone.trim();

    const [row] = await db
      .update(customersTable)
      .set(update)
      .where(eq(customersTable.id, req.params.id))
      .returning();

    if (name !== undefined) {
      await db
        .update(customerTransactionsTable)
        .set({ customerName: name.trim() })
        .where(eq(customerTransactionsTable.customerId, req.params.id));
    }

    const balance = await getCustomerBalance(req.params.id);
    res.json({ ...row, balance });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Delete customer (cascade transactions)
router.delete("/:id", adminOrSupervisor, async (req, res) => {
  try {
    await db.delete(customerTransactionsTable).where(eq(customerTransactionsTable.customerId, req.params.id));
    await db.delete(customersTable).where(eq(customersTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Toggle block status
router.patch("/:id/block", adminOrSupervisor, async (req, res) => {
  try {
    const [current] = await db
      .select({ status: customersTable.status })
      .from(customersTable)
      .where(eq(customersTable.id, req.params.id))
      .limit(1);
    if (!current) return res.status(404).json({ error: "not_found" });

    const newStatus = current.status === "blocked" ? "active" : "blocked";
    const [row] = await db
      .update(customersTable)
      .set({ status: newStatus })
      .where(eq(customersTable.id, req.params.id))
      .returning();
    res.json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// List transactions for a customer
router.get("/:id/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.customerId, req.params.id))
      .orderBy(desc(customerTransactionsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// Add transaction for a customer
router.post("/:id/transactions", async (req, res) => {
  try {
    const customerId = req.params.id;
    const { type, amount, description, userId, userName, date, time } = req.body as {
      type: "debt" | "payment";
      amount: number;
      description?: string;
      userId?: string;
      userName?: string;
      date: string;
      time: string;
    };

    if (!amount || amount <= 0) return res.status(400).json({ error: "invalid_amount" });
    if (type !== "debt" && type !== "payment") return res.status(400).json({ error: "invalid_type" });

    // Check customer exists and not blocked (blocked customers can't get new debt)
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1);
    if (!customer) return res.status(404).json({ error: "customer_not_found" });
    if (type === "debt" && customer.status === "blocked") {
      return res.status(403).json({ error: "customer_blocked" });
    }

    // Calculate balance before
    const balanceBefore = await getCustomerBalance(customerId);
    const balanceAfter = type === "debt"
      ? balanceBefore + Number(amount)
      : balanceBefore - Number(amount);

    const [row] = await db
      .insert(customerTransactionsTable)
      .values({
        customerId,
        customerName: customer.name,
        familyId: customer.familyId,
        familyName: customer.familyName,
        type,
        amount: String(amount),
        description: description?.trim() ?? "",
        userId: userId ?? null,
        userName: userName ?? "",
        date,
        time,
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
