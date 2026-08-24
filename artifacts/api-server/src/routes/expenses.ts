import { Router } from "express";
import {
  db,
  expensesTable,
  expensePeriodsTable,
  dailyIncomesTable,
  dailyAccountsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { adminOnly, authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
const VALID_SOURCES = ["cash", "fund"] as const;

async function lockDailyAccounting(tx: DbExecutor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(2147483001)`);
}

function getAlgeriaTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Algiers",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

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

async function getLatestExpensePeriod(tx: DbExecutor) {
  const [period] = await tx
    .select()
    .from(expensePeriodsTable)
    .orderBy(desc(expensePeriodsTable.periodNumber), desc(expensePeriodsTable.id))
    .limit(1);
  return period ?? null;
}

async function getCurrentExpenseTotal(tx: DbExecutor, periodId: string | null) {
  const [result] = await tx
    .select({
      total: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`,
    })
    .from(expensesTable)
    .where(periodId ? eq(expensesTable.accountingPeriodId, periodId) : sql`${expensesTable.accountingPeriodId} is null`);
  return toMoney(result?.total);
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

// GET /api/expenses/accounting-period — current-period total plus historical total
router.get("/accounting-period", async (req, res) => {
  try {
    const result = await db.transaction(async (tx) => {
      const period = await getLatestExpensePeriod(tx);
      const currentTotal = await getCurrentExpenseTotal(tx, period?.id ?? null);
      const [historical] = await tx
        .select({
          total: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(expensesTable);
      return {
        period,
        currentTotal,
        historicalTotal: toMoney(historical?.total),
        historicalCount: Number(historical?.count ?? 0),
        canReset: req.user?.role === "admin" && currentTotal > 0,
      };
    });
    res.json(result);
  } catch (err) {
    console.error("Get expense accounting period error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/expenses/accounting-period/reset — admin-only, append-only reset
router.post("/accounting-period/reset", adminOnly, async (req, res) => {
  try {
    const created = await db.transaction(async (tx) => {
      // Serialise reset and expense creation so the boundary cannot race.
      await lockDailyAccounting(tx);
      const previous = await getLatestExpensePeriod(tx);
      const previousTotal = await getCurrentExpenseTotal(tx, previous?.id ?? null);

      // A period with no expenses is already at zero; do not create duplicate
      // empty periods from double taps or retried requests.
      if (previous && previousTotal === 0) {
        throw Object.assign(new Error("already_zeroed"), { code: "already_zeroed" });
      }

      const [user] = await tx
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id))
        .limit(1);
      const [period] = await tx
        .insert(expensePeriodsTable)
        .values({
          periodNumber: (previous?.periodNumber ?? 0) + 1,
          startedById: req.user!.id,
          startedByName: user?.name ?? "",
        })
        .returning();

      return period;
    });

    res.status(201).json({
      id: created.id,
      startedAt: created.startedAt,
      startedById: created.startedById,
      startedByName: created.startedByName,
      currentTotal: 0,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "already_zeroed") {
      res.status(409).json({ error: code });
      return;
    }
    console.error("Reset expense accounting period error:", err);
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

router.post("/close-day", async (req, res) => {
  res.status(410).json({ error: "use_daily_accounting" });
});

// POST /api/expenses
router.post("/", async (req, res) => {
  try {
    const { amount, type, source, description } =
      req.body as {
        amount: string;
        type?: string;
        source?: string;
        description?: string;
      };
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !description?.trim() || !source || !VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      await lockDailyAccounting(tx);
      const [activeDay] = await tx
        .select({ date: dailyAccountsTable.date })
        .from(dailyAccountsTable)
        .where(eq(dailyAccountsTable.status, "open"))
        .limit(1);
      if (!activeDay) {
        throw Object.assign(new Error("no_active_day"), { code: "no_active_day" });
      }

      const [user] = await tx
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id))
        .limit(1);
      const currentPeriod = await getLatestExpensePeriod(tx);
      const [row] = await tx
        .insert(expensesTable)
        .values({
          amount: String(numericAmount),
          // Kept for backwards compatibility with the existing database column.
          // The user-facing classification is now source (cash/fund).
          type: type ?? "expense",
          source,
          accountingPeriodId: currentPeriod?.id ?? null,
          description: description.trim(),
          date: activeDay.date,
          time: getAlgeriaTime(),
          userId: req.user!.id,
          userName: user?.name ?? "",
        })
        .returning();
      return [row];
    });
    res.status(201).json(created);
  } catch (err) {
    if ((err as { code?: string }).code === "no_active_day") {
      res.status(409).json({ error: "no_active_day" });
      return;
    }
    console.error("Create expense error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/by-date/:date", async (req, res) => {
  res.status(410).json({ error: "delete_day_disabled" });
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "admin_only" });
      return;
    }
    await db.transaction(async (tx) => {
      await lockDailyAccounting(tx);
      const [expense] = await tx
        .select({
          date: expensesTable.date,
          accountingPeriodId: expensesTable.accountingPeriodId,
        })
        .from(expensesTable)
        .where(eq(expensesTable.id, req.params.id));
      if (!expense) {
        throw Object.assign(new Error("expense_not_found"), { code: "expense_not_found" });
      }
      const [activeDay] = await tx
        .select({ date: dailyAccountsTable.date })
        .from(dailyAccountsTable)
        .where(eq(dailyAccountsTable.status, "open"))
        .limit(1);
      if (!activeDay || activeDay.date !== expense.date) {
        throw Object.assign(new Error("closed_day_expense"), { code: "closed_day_expense" });
      }
      const currentPeriod = await getLatestExpensePeriod(tx);
      const isCurrentPeriod = currentPeriod
        ? expense.accountingPeriodId === currentPeriod.id
        : expense.accountingPeriodId == null;
      if (!isCurrentPeriod) {
        throw Object.assign(new Error("historical_expense"), { code: "historical_expense" });
      }
      await tx.delete(expensesTable).where(eq(expensesTable.id, req.params.id));
    });
    res.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "expense_not_found") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "closed_day_expense") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "historical_expense") {
      res.status(409).json({ error: code });
      return;
    }
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
