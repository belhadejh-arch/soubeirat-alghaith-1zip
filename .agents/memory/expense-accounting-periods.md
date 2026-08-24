---
name: Expense Accounting Periods
description: Safe rules for resetting the visible expense total without changing historical records
---

Resetting an expense total must create a new append-only accounting period instead of editing, deleting, or reassigning old expense rows. New expenses belong to the latest period; historical expenses remain visible in all history and reports but cannot be deleted.

**Why:** A visible total can restart at zero without compromising auditability, financial reports, or reconciliations based on the original expenses.

**How to apply:** Serialize period creation and expense creation with the same database lock, use a stable monotonic period order, protect prior-period rows from deletion, and normalize old period metadata during backup restore.