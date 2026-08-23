import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyClosing } from "./dailyAccounting.js";

test("calculates the required daily accounting scenario exactly", () => {
  const result = calculateDailyClosing({
    openingFund: 100000,
    openingCash: 5000,
    tillExpenses: 20000,
    fundExpenses: 10000,
    actualCash: 80000,
  });

  assert.deepEqual(result, {
    rossat: 95000,
    transferredToFund: 75000,
    totalExpenses: 30000,
    net: 65000,
    fundBalance: 165000,
  });
});