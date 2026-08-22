import { Router } from "express";
import { db, expensesTable, dailyIncomesTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
const VALID_SOURCES = ["cash", "fund"] as const;

function toMoney(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function getExpenseTotals(tx: DbExecutor, date: string) {
  const [totals] = await tx
    .select({
      cash: sql<string>`coalesce(sum(case when ${expensesTable.source} = 'cash' then ${expensesTable.amount} else 0 end), 0)`,
      fund: sql<string>`coalesce(sum(case when ${expensesTable.source} = 'fund' then ${expensesTable.amount} else 0 end), 0)`,
      unknown: sql<string>`coalesce(sum(case when ${expensesTable.source} is null or ${expensesTable.source} not in ('cash', 'fund') then ${expensesTable.amount} else 0 end), 0)`,
    })
    .from(expensesTable)
    .where(eq(expensesTable.date, date));

  return {
    cash: toMoney(totals?.cash),
    fund: toMoney(totals?.fund),
    unknown: toMoney(totals?.unknown),
  };
}

async function getOpeningBalances(tx: DbExecutor, date: string) {
  const [previous] = await tx
    .select({
      actualCash: dailyIncomesTable.actualCash,
      fundBalance: dailyIncomesTable.fundBalance,
    })
    .from(dailyIncomesTable)
    .where(sql`${dailyIncomesTable.date} < ${date}`)
    .orderBy(desc(dailyIncomesTable.date))
    .limit(1);

  return {
    cash: toMoney(previous?.actualCash),
    fund: toMoney(previous?.fundBalance),
  };
}

/**
 * Recalculate only new physical-count closings. Legacy/manual closings retain
 * their original amounts and are never reinterpreted from missing data.
 */
async function recalculatePhysicalClosings(tx: DbExecutor, fromDate: string) {
  const closings = await tx
    .select()
    .from(dailyIncomesTable)
    .where(and(gte(dailyIncomesTable.date, fromDate), eq(dailyIncomesTable.calculationMode, "physical_cash")))
    .orderBy(dailyIncomesTable.date);

  for (const closing of closings) {
    const opening = await getOpeningBalances(tx, closing.date);
    const totals = await getExpenseTotals(tx, closing.date);
    const actualCash = toMoney(closing.actualCash);
    const actualFund = closing.actualFund == null ? null : toMoney(closing.actualFund);
    const amount = actualCash + totals.cash - opening.cash;
    const fundBalance = opening.fund - totals.fund;

    await tx
      .update(dailyIncomesTable)
      .set({
        amount: String(amount),
        openingCash: String(opening.cash),
        expectedCash: null,
        cashDifference: null,
        cashExpenses: String(totals.cash),
        fundExpenses: String(totals.fund),
        openingFund: String(opening.fund),
        fundBalance: String(fundBalance),
        fundDifference: actualFund == null ? null : String(actualFund - fundBalance),
        unclassifiedExpenses: String(totals.unknown),
      })
      .where(eq(dailyIncomesTable.id, closing.id));
  }
}

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

// POST /api/expenses/close-day — the user enters only the cash physically found in the till.
router.post("/close-day", async (req, res) => {
  try {
    if (req.user?.role === "worker") {
      res.status(403).json({ error: "income_access_denied" });
      return;
    }
    const { actualCash, actualFund, date } = req.body as {
      actualCash: string | number;
      actualFund: string | number;
      date: string;
    };
    const actual = Number(actualCash);
    const actualFundAmount = Number(actualFund);
    if (!date || !Number.isFinite(actual) || actual < 0 || !Number.isFinite(actualFundAmount) || actualFundAmount < 0) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const [upserted] = await db.transaction(async (tx) => {
      const opening = await getOpeningBalances(tx, date);
      const totals = await getExpenseTotals(tx, date);
      const income = actual + totals.cash - opening.cash;
      const fundBalance = opening.fund - totals.fund;

      const [row] = await tx
        .insert(dailyIncomesTable)
        .values({
          amount: String(income),
          date,
          openingCash: String(opening.cash),
          actualCash: String(actual),
          expectedCash: null,
          cashDifference: null,
          cashExpenses: String(totals.cash),
          fundExpenses: String(totals.fund),
          openingFund: String(opening.fund),
          fundBalance: String(fundBalance),
          actualFund: String(actualFundAmount),
          fundDifference: String(actualFundAmount - fundBalance),
          unclassifiedExpenses: String(totals.unknown),
          calculationMode: "physical_cash",
        })
        .onConflictDoUpdate({
          target: dailyIncomesTable.date,
          set: {
            amount: String(income),
            openingCash: String(opening.cash),
            actualCash: String(actual),
            expectedCash: null,
            cashDifference: null,
            cashExpenses: String(totals.cash),
            fundExpenses: String(totals.fund),
            openingFund: String(opening.fund),
            fundBalance: String(fundBalance),
            actualFund: String(actualFundAmount),
            fundDifference: String(actualFundAmount - fundBalance),
            unclassifiedExpenses: String(totals.unknown),
            calculationMode: "physical_cash",
          },
        })
        .returning();

      await recalculatePhysicalClosings(tx, date);
      const [result] = await tx
        .select()
        .from(dailyIncomesTable)
        .where(eq(dailyIncomesTable.date, date));
      return [result ?? row];
    });
    res.status(201).json(upserted);
  } catch (err) {
    console.error("Close day error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/expenses
router.post("/", async (req, res) => {
  try {
    const { amount, type, source, description, date, time, userId, userName } =
      req.body as {
        amount: string;
        type?: string;
        source?: string;
        description?: string;
        date: string;
        time: string;
        userId?: string;
        userName: string;
      };
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !date || !time || !userName || !source || !VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(expensesTable)
        .values({
          amount: String(numericAmount),
          // Kept for backwards compatibility with the existing database column.
          // The user-facing classification is now source (cash/fund).
          type: type ?? "expense",
          source,
          description: description ?? "",
          date,
          time,
          userId: userId ?? null,
          userName,
        })
        .returning();
      await recalculatePhysicalClosings(tx, date);
      return [row];
    });
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
    await db.transaction(async (tx) => {
      await tx.delete(expensesTable).where(eq(expensesTable.date, req.params.date));
      await tx.delete(dailyIncomesTable).where(eq(dailyIncomesTable.date, req.params.date));
      await recalculatePhysicalClosings(tx, req.params.date);
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete expenses by date error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  try {
    await db.transaction(async (tx) => {
      const [expense] = await tx
        .select({ date: expensesTable.date })
        .from(expensesTable)
        .where(eq(expensesTable.id, req.params.id));
      await tx.delete(expensesTable).where(eq(expensesTable.id, req.params.id));
      if (expense) await recalculatePhysicalClosings(tx, expense.date);
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
