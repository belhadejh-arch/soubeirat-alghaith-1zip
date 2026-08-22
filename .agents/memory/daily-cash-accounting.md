---
name: Daily Cash Accounting
description: The financial closing model used to reconcile physical till cash with the app
---

The user closes a day by entering the cash physically counted in the till and fund. The server derives the day’s income as actual closing cash plus expenses sourced from the till minus the previous closing cash. Expenses sourced from the fund are tracked separately and reduce the fund balance, but do not affect the till formula.

Legacy/manual closings retain their original amounts. Legacy expenses with no recorded source remain explicitly unknown: they are visible in reports, but excluded from both cash and fund reconciliation rather than being guessed.

**Why:** Manual income/rosat entry can hide counting mistakes; the physical till count is the source of truth for reconciliation.

**How to apply:** Keep the calculation server-side, require an explicit source for new expenses, preserve the two known sources (`cash` for لاكاس and `fund` for الصندوق), and recalculate only physical-count closings when later expense data changes.