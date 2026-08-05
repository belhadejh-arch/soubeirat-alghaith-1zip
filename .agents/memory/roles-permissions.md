---
name: Roles & Permissions
description: Which features are available per role in the mobile app and API server
---

## Mobile App Role Gates

- **All roles** (admin, supervisor, worker): Can view the expenses tab and use the FAB to add expenses.
- **All roles**: Can open suppliers and record supplier debt/payment transactions.
- **Admin + Supervisor only**: Can add روسات (daily income), delete expenses, delete days, view expense stats, add/edit/delete suppliers.

## Key implementation detail

In `artifacts/mobile/app/(tabs)/expenses.tsx`:
- `isAdmin = role === 'admin' || role === 'supervisor'`
- FAB is always shown when activeTab === 'records' (no role gate)
- Inside FAB menu: "إضافة روسات" is gated by `isAdmin`; "إضافة مصروف" is always shown
- Workers do not load or see daily income data; the expenses header and records show expenses only.

## Server side

`authMiddleware` in `artifacts/api-server/src/middlewares/auth.ts` validates JWT. Supplier transaction creation is intentionally available to every authenticated role; income read/write and income-containing day deletion reject workers.

**Why:** Employees need to be able to record daily expenses at point-of-sale without full admin access.
