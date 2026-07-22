import { Router } from "express";
import { db, expensesTable, dailyIncomesTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
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

// ─── Expenses ─────────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  try {
    const [row] = await db.insert(expensesTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Delete all expenses + income for a specific date ─────────────────────────
// NOTE: must be declared BEFORE DELETE /:id to avoid the wildcard swallowing it
router.delete("/by-date/:date", adminOrSupervisor, async (req, res) => {
  const date = String(req.params.date);
  await Promise.all([
    db.delete(expensesTable).where(eq(expensesTable.date, date)),
    db.delete(dailyIncomesTable).where(eq(dailyIncomesTable.date, date)),
  ]);
  res.json({ ok: true });
});

router.delete("/:id", adminOrSupervisor, async (req, res) => {
  await db.delete(expensesTable).where(eq(expensesTable.id, String(req.params.id)));
  res.json({ ok: true });
});

// ─── Statistics ───────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  let expQuery = db.select().from(expensesTable).$dynamic();
  let incQuery = db.select().from(dailyIncomesTable).$dynamic();

  if (from) {
    expQuery = expQuery.where(and(gte(expensesTable.date, from), to ? lte(expensesTable.date, to) : sql`true`));
    incQuery = incQuery.where(and(gte(dailyIncomesTable.date, from), to ? lte(dailyIncomesTable.date, to) : sql`true`));
  } else if (to) {
    expQuery = expQuery.where(lte(expensesTable.date, to));
    incQuery = incQuery.where(lte(dailyIncomesTable.date, to));
  }

  const [expenses, incomes] = await Promise.all([
    expQuery.orderBy(desc(expensesTable.date)),
    incQuery.orderBy(desc(dailyIncomesTable.date)),
  ]);

  res.json({ expenses, incomes });
});

// ─── Daily Incomes ────────────────────────────────────────────────────────────
router.get("/incomes", async (_req, res) => {
  const rows = await db.select().from(dailyIncomesTable).orderBy(desc(dailyIncomesTable.createdAt));
  res.json(rows);
});

// Upsert by date
router.post("/incomes", async (req, res) => {
  try {
    const { amount, date } = req.body as { amount: number; date: string };
    const existing = await db.select().from(dailyIncomesTable).where(eq(dailyIncomesTable.date, date)).limit(1);
    let row;
    if (existing.length > 0) {
      [row] = await db.update(dailyIncomesTable)
        .set({ amount: String(amount) })
        .where(eq(dailyIncomesTable.date, date))
        .returning();
    } else {
      [row] = await db.insert(dailyIncomesTable)
        .values({ amount: String(amount), date })
        .returning();
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
