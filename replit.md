# سوبيرات الغيث — نظام الإدارة

نظام إدارة متكامل لمتجر سوبيرات الغيث يشمل: المبيعات، المصاريف، الموردين، وديون الزبائن.

## هيكل المشروع

```
soubeirat-alghaith/
├── artifacts/
│   ├── api-server/        # خادم Express 5 (REST API) — Port 8080
│   └── mobile/            # تطبيق Expo / React Native — Port 18115
├── lib/
│   ├── db/                # Drizzle ORM + PostgreSQL (Neon)
│   ├── api-spec/          # OpenAPI spec
│   ├── api-zod/           # Zod schemas
│   └── api-client-react/  # React Query hooks
└── pnpm-workspace.yaml
```

## تشغيل المشروع

### API Server
الـ workflow: **API Server** — يشتغل على port 8080  
يبني الكود ثم يشغّله: `export NODE_ENV=development && pnpm run build && pnpm run start`

### Mobile App
الـ workflow: **Mobile App** — Expo dev server على port 18115  
يمكن مسح QR Code بـ Expo Go أو فتح الـ web على `http://localhost:18115`

## بيانات الدخول الافتراضية

| الحقل | القيمة |
|-------|--------|
| اسم المستخدم | `admin` |
| كلمة المرور | `admin123` |

> ⚠️ **مهم:** غيّر كلمة المرور فور تسجيل الدخول الأول.

## متغيرات البيئة

| المتغير | الوصف | الحالة |
|---------|--------|--------|
| `NEON_DATABASE_URL` | اتصال قاعدة بيانات Neon PostgreSQL | ✅ مضبوط |
| `SESSION_SECRET` | سر التوقيع (يُستخدم كـ JWT_SECRET تلقائياً) | ✅ مضبوط |
| `JWT_SECRET` | سر JWT (اختياري — يرجع لـ SESSION_SECRET) | — |

## نقاط API الرئيسية

| المسار | الوصف |
|--------|--------|
| `POST /api/auth/login` | تسجيل الدخول |
| `POST /api/auth/seed` | إنشاء المدير الافتراضي (مرة واحدة) |
| `GET /api/healthz` | فحص صحة الخادم |
| `GET /api/users` | قائمة المستخدمين |
| `GET /api/products` | المنتجات الناقصة |
| `GET /api/expenses` | المصاريف |
| `GET /api/expenses/incomes` | الإيرادات اليومية |
| `GET /api/suppliers` | الموردون |
| `GET /api/suppliers/balances` | أرصدة الموردين |
| `GET /api/orders` | طلبات الشراء |
| `GET /api/tasks` | المهام |
| `GET /api/customers/families` | عائلات الزبائن |
| `GET /api/customers` | الزبائن |
| `GET /api/customers/stats` | إحصائيات الديون |
| `GET /api/notifications` | الإشعارات |

## قاعدة البيانات

**Neon PostgreSQL** — يُستخدم `NEON_DATABASE_URL`

لتحديث schema:
```bash
pnpm --filter @workspace/db run push
```

## التقنيات

- **Backend**: Express 5, Drizzle ORM, PostgreSQL (Neon), JWT, bcryptjs, Pino
- **Mobile**: Expo SDK 54, React Native 0.81, React Navigation
- **Shared**: TypeScript 5.9, Zod, pnpm workspaces

## User preferences

- المشروع بالعربية — الأسماء والتعليقات والرسائل بالعربية
- استخدام pnpm فقط (وليس npm أو yarn)
- الاحتفاظ بهيكل المشروع الحالي دون تغيير
