---
name: سوبيرات الغيث — Project Setup
description: Critical setup facts for the store management system
---

## Admin Credentials
- username: `admin`, password: `admin123`
- Exists in Neon DB already (seed runs as no-op)

## Environment
- `NEON_DATABASE_URL` is set — used by lib/db/src/index.ts (preferred over DATABASE_URL)
- `SESSION_SECRET` is set — used as JWT_SECRET fallback in auth middleware
- `JWT_SECRET` not explicitly set (not needed due to fallback)

## API Server
- Port 8080, Express 5, `app.use("/api", router)`
- Mobile calls `https://${REPLIT_DEV_DOMAIN}/api/*` → Replit proxy → port 8080
- All routes: auth, users, products, expenses, suppliers, orders, tasks, customers, notifications

## Key Fix
- `deleteDay` in DataContext was only deleting expenses locally for incomes.  
  Fixed by making `DELETE /expenses/by-date/:date` delete both expenses AND daily_incomes for that date.

**Why:** The dailyIncomesTable has a unique constraint on `date`, so one income per day. Deleting a day's data should clear both tables atomically.

## Supplier Balances
- Returns `number` type (not string) after fix — important for mobile type compatibility.

## Workflows (active)
- "API Server": `PORT=8080 pnpm --filter @workspace/api-server run dev`
- "Mobile App": Expo on port 18115
- Duplicate `.migration-backup/` artifact workflows exist but are failed/harmless — ignore them.
