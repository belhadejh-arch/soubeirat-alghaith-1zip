import { Router } from "express";
import { db, expensesTable, dailyIncomesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/expenses
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(expensesTable)
      .orderBy(expensesTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get expenses error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/expenses/stats?from=&to=
router.get("/stats", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    let expensesQuery = db.select().from(expensesTable).$dynamic();
    let incomesQuery = db.select().from(dailyIncomesTable).$dynamic();

    if (from && to) {
      expensesQuery = expensesQuery.where(
        and(gte(expensesTable.date, from), lte(expensesTable.date, to)),
      );
      incomesQuery = incomesQuery.where(
        and(gte(dailyIncomesTable.date, from), lte(dailyIncomesTable.date, to)),
      );
    } else if (from) {
      expensesQuery = expensesQuery.where(gte(expensesTable.date, from));
      incomesQuery = incomesQuery.where(gte(dailyIncomesTable.date, from));
    } else if (to) {
      expensesQuery = expensesQuery.where(lte(expensesTable.date, to));
      incomesQuery = incomesQuery.where(lte(dailyIncomesTable.date, to));
    }

    // Workers can use expense statistics internally, but daily income must
    // never be sent to them.
    if (req.user?.role === "worker") {
      const expenses = await expensesQuery.orderBy(expensesTable.date);
      res.json({ expenses, incomes: [] });
      return;
    }

    const [expenses, incomes] = await Promise.all([
      expensesQuery.orderBy(expensesTable.date),
      incomesQuery.orderBy(dailyIncomesTable.date),
    ]);

    res.json({ expenses, incomes });
  } catch (err) {
    console.error("Get expenses stats error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/expenses/incomes
router.get("/incomes", async (req, res) => {
  try {
    if (req.user?.role === "worker") {
      res.status(403).json({ error: "income_access_denied" });
      return;
    }
    const rows = await db
      .select()
      .from(dailyIncomesTable)
      .orderBy(dailyIncomesTable.date);
    res.json(rows);
  } catch (err) {
    console.error("Get incomes error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/expenses/incomes — upsert by date
router.post("/incomes", async (req, res) => {
  try {
    if (req.user?.role === "worker") {
      res.status(403).json({ error: "income_access_denied" });
      return;
    }
    const { amount, date } = req.body as { amount: string; date: string };
    if (!amount || !date) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [upserted] = await db
      .insert(dailyIncomesTable)
      .values({ amount, date })
      .onConflictDoUpdate({ target: dailyIncomesTable.date, set: { amount } })
      .returning();
    res.status(201).json(upserted);
  } catch (err) {
    console.error("Upsert income error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/expenses
router.post("/", async (req, res) => {
  try {
    const { amount, type, description, date, time, userId, userName } =
      req.body as {
        amount: string;
        type: string;
        description?: string;
        date: string;
        time: string;
        userId?: string;
        userName: string;
      };
    if (!amount || !type || !date || !time || !userName) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(expensesTable)
      .values({
        amount,
        type,
        description: description ?? "",
        date,
        time,
        userId: userId ?? null,
        userName,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/expenses/by-date/:date  — deletes all expenses AND the daily income for that date
router.delete("/by-date/:date", async (req, res) => {
  try {
    if (req.user?.role === "worker") {
      res.status(403).json({ error: "income_access_denied" });
      return;
    }
    await Promise.all([
      db.delete(expensesTable).where(eq(expensesTable.date, req.params.date)),
      db.delete(dailyIncomesTable).where(eq(dailyIncomesTable.date, req.params.date)),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete expenses by date error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  try {
    await db
      .delete(expensesTable)
      .where(eq(expensesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
