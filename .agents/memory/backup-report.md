---
name: Backup & Report System
description: Covers the backup/restore API routes and mobile screens added for the backup and PDF report features.
---

# Backup & Report System

## Backend (artifacts/api-server/src/routes/backup.ts)
- `GET /api/backup` — admin-only; exports all 12 tables as JSON `{ version, app, exportedAt, data: { users, products, expenses, incomes, suppliers, supplierTransactions, customerFamilies, customers, customerTransactions, orders, tasks, notifications } }`
- `GET /api/backup/report` — admin-only; same data plus pre-computed `summary` (totals for income, expenses, profit, debts, counts)
- `POST /api/backup/restore` — admin-only; full DB replace inside a single drizzle transaction (delete all → re-insert in dependency order). No FK constraints in DB so order doesn't matter for deletes, but inserts follow: users → customerFamilies → suppliers → products → expenses → incomes → customers → supplierTransactions → customerTransactions → orders → tasks → notifications

**Why:** No FK constraints defined in the schema (no `.references()` calls), so delete can happen in any order. Restore uses a transaction to avoid partial-restore state, but a crash after DELETE and before INSERT would leave empty DB — marked as tech debt.

## Mobile
- `artifacts/mobile/app/backup.tsx` — backup screen reachable from Settings → "إدارة النسخ الاحتياطي". Handles export (FileSystem + Sharing on native, blob download on web), restore (DocumentPicker on native, file input on web), and auto-backup schedule preference (AsyncStorage key `@auto_backup_schedule`, UI only — no background task wired yet).
- `artifacts/mobile/utils/reportPdfGenerator.ts` — comprehensive PDF with all sections. Native: HTML → expo-print. Web: canvas-based multi-page jsPDF (same pattern as existing pdfGenerator.ts). Covers: summary stats, incomes, expenses, customers, customer transactions, suppliers, supplier transactions, orders, products, tasks, users, notifications.
- `artifacts/mobile/utils/api.ts` — added `backupApi` (export, restore, report) and types `BackupExport`, `ReportData`, `ReportSummary`.
- `artifacts/mobile/app/settings.tsx` — "💾 النسخ الاحتياطي" section with links to backup screen and "📄 تحميل التقرير الشامل" button.

## Dependencies added
- `expo-document-picker@~14.0.8` in `artifacts/mobile`

## Report format decisions (mandatory — do not revert)
- **Currency**: `دج` (Algerian Dinar) everywhere — never `ر.س`
- **Numbers**: Western digits (1234) via `fmtNum` with `en-US` locale — never Arabic-Indic (١٢٣٤)
- **Date format**: `DD/MM/YYYY (اسم اليوم)` for every operation row, e.g. `01/08/2026 (السبت)`
- **Time**: shown as `HH:MM` next to every operation that has a time field (expenses, customer transactions, tasks, notifications)
- **Customer families section**: dedicated section in report grouping all customers by family; splits into مديونة (debt > 0) vs مصفّاة (balance = 0); shows per-member balance details
- **Web PDF**: uses `buildReportBlobCanvas` (Canvas 2D → jsPDF) downloaded as `.pdf` file — NOT HTML
- **`tbl` helper**: accepts `string | string[]` for rows — no need to `.join('')` manually
