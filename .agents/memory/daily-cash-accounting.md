---
name: Daily Cash Accounting
description: The financial closing model used to reconcile physical till cash with the app
---

The user closes a day by entering only the cash physically counted in the till. The server derives the day’s income as actual closing cash plus expenses sourced from the till minus the previous closing cash. Expenses sourced from the fund are tracked separately and do not affect the till formula.

**Why:** Manual income/rosat entry can hide counting mistakes; the physical till count is the source of truth for reconciliation.

**How to apply:** Keep the calculation server-side, preserve the two expense sources (`cash` for لاكاس and `fund` for الصندوق), and expose the inputs and computed result together so the user can audit the arithmetic.