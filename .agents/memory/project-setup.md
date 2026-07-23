---
name: سوبيرات الغيث — Project Setup
description: Critical setup facts for the store management system
---

## Admin Credentials
- username: `admin`, password: `admin123`
- Exists in Neon DB already (seed runs as no-op)

## Environment
- `NEON_DATABASE_URL` is set — used by lib/db/src/index.ts (preferred over DATABASE_URL)
- `SESSION_SECRET` is set — JWT signing secret
- `JWT_SECRET` is set — takes priority over SESSION_SECRET in auth.ts and auth middleware

## API Server
- Port 8080, Express 5, `app.use("/api", router)`
- Mobile calls `https://${REPLIT_DEV_DOMAIN}/api/*` → Replit proxy (paths=["/api"]) → port 8080
- All routes: auth, users, products, expenses, suppliers, orders, tasks, customers, notifications
- CORS: wide open (`app.use(cors())`) — no CORS issues

## Auth System (fixed)
- JWT stateless — tokens survive server restarts (30-day expiry)
- Error codes: `not_found`, `wrong_password`, `suspended`, `missing_fields`, `server_error`, `invalid_token`
- Mobile properly distinguishes network errors (fetch throws) vs server errors (HTTP non-ok)
- `network_error` shown only when fetch itself fails; `server_error` shown for 5xx responses

## Key Fixes Applied
- `artifacts/mobile/utils/api.ts`: wrapped fetch in try/catch — real network failures get `code:'network_error'`; HTTP errors get the actual server code instead of falling back to 'network_error'
- `artifacts/mobile/context/AuthContext.tsx`: login now returns `'server_error'` for unrecognized server codes instead of `'network_error'`
- `artifacts/mobile/app/login.tsx`: added handler for `'server_error'` with Arabic message "حدث خطأ في الخادم، حاول مجدداً"

## Key Fix (older)
- `deleteDay` in DataContext was only deleting expenses locally for incomes.
  Fixed by making `DELETE /expenses/by-date/:date` delete both expenses AND daily_incomes for that date.

**Why:** The dailyIncomesTable has a unique constraint on `date`, so one income per day. Deleting a day's data should clear both tables atomically.

## Supplier Balances
- Returns `number` type (not string) after fix — important for mobile type compatibility.

## Workflows (active)
- "API Server": `PORT=8080 pnpm --filter @workspace/api-server run dev`
- "Mobile App": Expo on port 18115
- Duplicate `.migration-backup/` artifact workflows exist but are failed/harmless — ignore them.
