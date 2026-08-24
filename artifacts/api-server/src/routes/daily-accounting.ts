import { Router } from "express";
import {
  dailyAccountsTable,
  dailyIncomesTable,
  db,
  expensePeriodsTable,
  expensesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { authMiddleware, adminOnly } from "../middlewares/auth.js";
import { calculateDailyClosing } from "../lib/dailyAccounting.js";

const router = Router();
router.use(authMiddleware);

type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getAlgeriaDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function lockDailyAccounting(tx: DbExecutor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(2147483001)`);
}

async function getUserName(tx: DbExecutor, userId: string): Promise<string> {
  const [user] = await tx
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.name ?? "";
}

async function getDayExpenseTotals(tx: DbExecutor, date: string) {
  const [totals] = await tx
    .select({
      till: sql<string>`coalesce(sum(case when ${expensesTable.source} = 'cash' then ${expensesTable.amount} else 0 end), 0)`,
      fund: sql<string>`coalesce(sum(case when ${expensesTable.source} = 'fund' then ${expensesTable.amount} else 0 end), 0)`,
      other: sql<string>`coalesce(sum(case when ${expensesTable.source} is null or ${expensesTable.source} not in ('cash', 'fund') then ${expensesTable.amount} else 0 end), 0)`,
    })
    .from(expensesTable)
    .where(eq(expensesTable.date, date));

  return {
    till: toMoney(totals?.till),
    fund: toMoney(totals?.fund),
    other: toMoney(totals?.other),
  };
}

async function getOpeningFund(tx: DbExecutor): Promise<number> {
  const [latestDailyAccount] = await tx
    .select({ fundBalance: dailyAccountsTable.fundBalance })
    .from(dailyAccountsTable)
    .where(eq(dailyAccountsTable.status, "closed"))
    .orderBy(desc(dailyAccountsTable.date))
    .limit(1);
  if (latestDailyAccount) return toMoney(latestDailyAccount.fundBalance);

  const [latestLegacyClosing] = await tx
    .select({ fundBalance: dailyIncomesTable.fundBalance })
    .from(dailyIncomesTable)
    .orderBy(desc(dailyIncomesTable.date))
    .limit(1);
  return toMoney(latestLegacyClosing?.fundBalance);
}

async function getActiveDay(tx: DbExecutor) {
  const [active] = await tx
    .select()
    .from(dailyAccountsTable)
    .where(eq(dailyAccountsTable.status, "open"))
    .limit(1);
  return active;
}

function publicDay(day: typeof dailyAccountsTable.$inferSelect) {
  return {
    id: day.id,
    date: day.date,
    status: day.status,
    openingCash: day.openingCash,
    openedByName: day.openedByName,
    openedAt: day.openedAt,
  };
}

router.get("/status", async (req, res): Promise<void> => {
  try {
    const today = getAlgeriaDate();
    const active = await db.transaction(async (tx) => {
      const day = await getActiveDay(tx);
      if (!day) return null;
      const totals = await getDayExpenseTotals(tx, day.date);
      return { day, totals };
    });

    const [todayDailyAccount, todayLegacyClosing] = active
      ? [null, null]
      : await Promise.all([
          db.select({ id: dailyAccountsTable.id }).from(dailyAccountsTable).where(eq(dailyAccountsTable.date, today)).limit(1),
          db.select({ id: dailyIncomesTable.id }).from(dailyIncomesTable).where(eq(dailyIncomesTable.date, today)).limit(1),
        ]).then(([dailyRows, legacyRows]) => [dailyRows[0] ?? null, legacyRows[0] ?? null]);

    const state = active
      ? "open"
      : todayDailyAccount || todayLegacyClosing
        ? "closed_today"
        : "not_open";

    if (req.user?.role !== "admin") {
      res.json({
        state,
        day: active ? publicDay(active.day) : null,
      });
      return;
    }

    const currentFund = active
      ? toMoney(active.day.openingFund) - active.totals.fund
      : await db.transaction((tx) => getOpeningFund(tx));

    res.json({
      state,
      day: active ? publicDay(active.day) : null,
      currentFund,
    });
  } catch (error) {
    req.log.error({ error }, "Failed to load daily accounting status");
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/open", async (req, res): Promise<void> => {
  const openingCash = Number(req.body?.openingCash);
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    res.status(400).json({ error: "invalid_opening_cash" });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      await lockDailyAccounting(tx);
      const existingActive = await getActiveDay(tx);
      if (existingActive) {
        throw Object.assign(new Error("day_already_open"), { code: "day_already_open" });
      }

      const date = getAlgeriaDate();
      const [existingDay, legacyClosing] = await Promise.all([
        tx.select({ id: dailyAccountsTable.id }).from(dailyAccountsTable).where(eq(dailyAccountsTable.date, date)).limit(1),
        tx.select({ id: dailyIncomesTable.id }).from(dailyIncomesTable).where(eq(dailyIncomesTable.date, date)).limit(1),
      ]);
      if (existingDay[0] || legacyClosing[0]) {
        throw Object.assign(new Error("day_already_closed"), { code: "day_already_closed" });
      }

      const openingFund = await getOpeningFund(tx);
      const userId = req.user!.id;
      const userName = await getUserName(tx, userId);
      const [day] = await tx
        .insert(dailyAccountsTable)
        .values({
          date,
          status: "open",
          openingCash: String(openingCash),
          openingFund: String(openingFund),
          fundBalance: String(openingFund),
          openedById: userId,
          openedByName: userName,
        })
        .returning();
      return day;
    });

    res.status(201).json(publicDay(created));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "day_already_open" || code === "23505") {
      res.status(409).json({ error: "day_already_open" });
      return;
    }
    if (code === "day_already_closed") {
      res.status(409).json({ error: "day_already_closed" });
      return;
    }
    req.log.error({ error }, "Failed to open daily account");
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/close", async (req, res): Promise<void> => {
  const actualCash = Number(req.body?.actualCash);
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    res.status(400).json({ error: "invalid_actual_cash" });
    return;
  }

  try {
    const closed = await db.transaction(async (tx) => {
      await lockDailyAccounting(tx);
      const active = await getActiveDay(tx);
      if (!active) {
        throw Object.assign(new Error("no_active_day"), { code: "no_active_day" });
      }

      const totals = await getDayExpenseTotals(tx, active.date);
      const result = calculateDailyClosing({
        openingCash: toMoney(active.openingCash),
        actualCash,
        tillExpenses: totals.till,
        fundExpenses: totals.fund,
        otherExpenses: totals.other,
        openingFund: toMoney(active.openingFund),
      });
      const userId = req.user!.id;
      const userName = await getUserName(tx, userId);

      const [updated] = await tx
        .update(dailyAccountsTable)
        .set({
          status: "closed",
          actualCash: String(actualCash),
          tillExpenses: String(totals.till),
          fundExpenses: String(totals.fund),
          otherExpenses: String(totals.other),
          rossat: String(result.rossat),
          transferredToFund: String(result.transferredToFund),
          totalExpenses: String(result.totalExpenses),
          net: String(result.net),
          fundBalance: String(result.fundBalance),
          closedById: userId,
          closedByName: userName,
          closedAt: new Date(),
        })
        .where(and(eq(dailyAccountsTable.id, active.id), eq(dailyAccountsTable.status, "open")))
        .returning();

      if (!updated) {
        throw Object.assign(new Error("no_active_day"), { code: "no_active_day" });
      }
      return updated;
    });

    res.json({
      id: closed.id,
      date: closed.date,
      status: closed.status,
      actualCash: closed.actualCash,
      rossat: closed.rossat,
      transferredToFund: closed.transferredToFund,
      totalExpenses: closed.totalExpenses,
      net: closed.net,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "no_active_day") {
      res.status(409).json({ error: "no_active_day" });
      return;
    }
    req.log.error({ error }, "Failed to close daily account");
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/statistics", adminOnly, async (req, res): Promise<void> => {
  try {
    const [days, historicalExpenseTotal, periods] = await Promise.all([
      db
        .select()
        .from(dailyAccountsTable)
        .where(eq(dailyAccountsTable.status, "closed"))
        .orderBy(desc(dailyAccountsTable.date)),
      db
        .select({
          total: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`,
        })
        .from(expensesTable),
      db
        .select()
        .from(expensePeriodsTable)
        .orderBy(desc(expensePeriodsTable.periodNumber), desc(expensePeriodsTable.id))
        .limit(1),
    ]);
    const currentPeriodId = periods[0]?.id ?? null;
    const [currentExpenseTotal] = await db
      .select({
        total: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`,
      })
      .from(expensesTable)
      .where(currentPeriodId
        ? eq(expensesTable.accountingPeriodId, currentPeriodId)
        : sql`${expensesTable.accountingPeriodId} is null`);

    const currentFund = await db.transaction(async (tx) => {
      const active = await getActiveDay(tx);
      if (!active) return getOpeningFund(tx);
      const totals = await getDayExpenseTotals(tx, active.date);
      return toMoney(active.openingFund) - totals.fund;
    });

    const totalIncome = days.reduce((sum, day) => sum + toMoney(day.rossat), 0);
    res.json({
      summary: {
        fundBalance: currentFund,
        // The dashboard total is period-scoped; the historical total remains
        // available explicitly so old data stays visible in reports.
        totalExpenses: toMoney(currentExpenseTotal?.total),
        historicalExpenses: toMoney(historicalExpenseTotal[0]?.total),
        totalIncome,
      },
      days: days.map((day) => ({
        id: day.id,
        date: day.date,
        rossat: day.rossat,
        totalExpenses: day.totalExpenses,
        totalIncome: day.rossat,
        net: day.net,
        actualCash: day.actualCash,
        tillExpenses: day.tillExpenses,
        fundExpenses: day.fundExpenses,
        closedAt: day.closedAt,
      })),
    });
  } catch (error) {
    req.log.error({ error }, "Failed to load daily accounting statistics");
    res.status(500).json({ error: "server_error" });
  }
});

export default router;