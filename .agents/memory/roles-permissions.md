---
name: Roles & Permissions
description: Which features are available per role in the mobile app and API server
---

## Mobile App Role Gates

- **All roles** (admin, supervisor, employee): Can view expenses tab, use FAB to add expenses, add supplier/customer transactions (gated by isAdminOrSupervisor for suppliers)
- **Admin + Supervisor only**: Can add روسات (daily income), delete expenses, delete days, view expense stats tab, add supplier transactions, edit/delete suppliers

## Key implementation detail

In `artifacts/mobile/app/(tabs)/expenses.tsx`:
- `isAdmin = role === 'admin' || role === 'supervisor'`
- FAB is always shown when activeTab === 'records' (no role gate)
- Inside FAB menu: "إضافة روسات" is gated by `isAdmin`; "إضافة مصروف" is always shown

## Server side

`authMiddleware` in `artifacts/api-server/src/middlewares/auth.ts` validates JWT only — no role checks on most routes. `adminOnly` middleware exists but is used sparingly (e.g., supplier transaction delete).

**Why:** Employees need to be able to record daily expenses at point-of-sale without full admin access.
