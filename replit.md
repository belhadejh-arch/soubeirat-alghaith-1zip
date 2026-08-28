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
| `POST /api/expenses/close-day` | إغلاق اليوم بالنقد الفعلي وحساب الروسات تلقائياً |
| `POST /api/daily-accounting/reopen` | إعادة فتح دورة اليوم للمدير مع حفظ الدورة السابقة |
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

## منطق المحاسبة

- المصروف الجديد يجب أن يحدد مصدره صراحة: **لاكاس** (`cash`) أو **الصندوق** (`fund`).
- المصاريف القديمة أو المستوردة بلا مصدر تبقى بلا مصدر (`unknown`) ولا تُنسب بأثر رجعي إلى لاكاس أو الصندوق.
- عند إغلاق اليوم، يُدخل المستخدم النقد الفعلي الموجود في لاكاس والصندوق. يحسب الخادم روسات اليوم هكذا:
  `النقد الفعلي في لاكاس + مصاريف لاكاس - رصيد بداية لاكاس`.
- رصيد الصندوق يحسب هكذا:
  `رصيد بداية الصندوق - مصاريف الصندوق`.
- المصروف مجهول المصدر يظهر في التقارير لكنه لا يدخل في مطابقة لاكاس أو الصندوق.
- أي إضافة أو حذف لمصروف بعد إغلاق يوم يعيد حساب الإغلاقات الجديدة المتأثرة والإغلاقات اللاحقة. الإغلاقات التاريخية اليدوية محفوظة ولا يعاد تفسيرها تلقائيًا.
- إعادة فتح يوم مغلق تنشئ دورة محاسبية جديدة لنفس التاريخ برقم دورة مستقل. لا تحذف الدورة السابقة أو مصاريفها، والمصاريف الجديدة تُربط بالدورة المفتوحة حتى لا تختلط بالحساب القديم.
- سجل كل دورة يحفظ اسم ووقت من فتح الحساب واسم ووقت من أغلقه، ويظهر في شاشة المحاسبة اليومية للرجوع إليه.

## التقنيات

- **Backend**: Express 5, Drizzle ORM, PostgreSQL (Neon), JWT, bcryptjs, Pino
- **Mobile**: Expo SDK 54, React Native 0.81, React Navigation
- **Shared**: TypeScript 5.9, Zod, pnpm workspaces

## User preferences

- المشروع بالعربية — الأسماء والتعليقات والرسائل بالعربية
- استخدام pnpm فقط (وليس npm أو yarn)
- الاحتفاظ بهيكل المشروع الحالي دون تغيير
