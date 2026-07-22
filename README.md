# 🛒 سوبيرات الغيث — نظام الإدارة

نظام إدارة متكامل لمتجر سوبيرات الغيث، يشمل إدارة المبيعات، المصاريف، الموردين، وديون الزبائن.

---

## 🏗️ هيكل المشروع

```
soubeirat-alghaith/
├── artifacts/
│   ├── api-server/        # خادم Express 5 (REST API)
│   └── mobile/            # تطبيق Expo / React Native
├── lib/
│   ├── db/                # قاعدة البيانات (Drizzle ORM + PostgreSQL)
│   ├── api-spec/          # تعريفات API المشتركة
│   ├── api-zod/           # مخططات Zod للتحقق
│   └── api-client-react/  # عميل API لـ React
├── scripts/               # سكربتات مساعدة
├── pnpm-workspace.yaml    # إعدادات monorepo
└── package.json
```

---

## ⚙️ المتطلبات

- **Node.js** >= 20
- **pnpm** >= 9
- **PostgreSQL** >= 14

---

## 🚀 التشغيل

### 1. تثبيت الاعتماديات
```bash
pnpm install
```

### 2. إعداد متغيرات البيئة
```bash
cp .env.example .env
# عدّل الملف .env وأضف القيم المطلوبة
```

### 3. إنشاء جداول قاعدة البيانات
```bash
pnpm --filter @workspace/db run push
```

### 4. تشغيل الخادم (development)
```bash
pnpm --filter @workspace/api-server run dev
```

### 5. تشغيل التطبيق المحمول
```bash
pnpm --filter @workspace/mobile run dev
```

---

## 🌐 نقاط النهاية الرئيسية (API)

| المسار | الوصف |
|--------|--------|
| `POST /api/auth/login` | تسجيل الدخول |
| `POST /api/auth/seed` | إنشاء حساب المدير الافتراضي (يُستخدم مرة واحدة) |
| `GET /api/products` | قائمة المنتجات |
| `GET /api/expenses` | قائمة المصاريف |
| `GET /api/suppliers` | قائمة الموردين |
| `GET /api/customers/families` | عائلات الزبائن |
| `GET /api/customers` | قائمة الزبائن |
| `GET /api/customers/stats` | إحصائيات الديون |
| `GET /api/orders` | قائمة الطلبات |
| `GET /api/tasks` | قائمة المهام |

---

## 👤 الحساب الافتراضي

بعد `POST /api/auth/seed`:

| الحقل | القيمة |
|-------|--------|
| اسم المستخدم | `mohghaith` |
| كلمة المرور | `admin123` |

> **تنبيه:** غيّر كلمة المرور فور تسجيل الدخول الأول.

---

## 🗄️ جداول قاعدة البيانات

| الجدول | الوصف |
|--------|--------|
| `users` | المستخدمون والصلاحيات |
| `products` | المنتجات والمخزون |
| `expenses` | المصاريف |
| `suppliers` | الموردون |
| `supplier_transactions` | معاملات الموردين (مع الرصيد قبل/بعد) |
| `customer_families` | عائلات الزبائن |
| `customers` | الزبائن |
| `customer_transactions` | معاملات الزبائن (ديون وسدادات) |
| `orders` | الطلبات |
| `tasks` | المهام |
| `notifications` | الإشعارات |

---

## 🛡️ الصلاحيات

| الدور | الصلاحيات |
|-------|------------|
| `admin` | كامل الصلاحيات |
| `supervisor` | إضافة/تعديل البيانات |
| `employee` | القراءة + تسجيل المبيعات والديون |

---

## 🔧 التقنيات المستخدمة

- **Backend**: Express 5, Drizzle ORM, PostgreSQL, JWT, bcryptjs
- **Mobile**: Expo SDK 52, React Native, React Navigation
- **Shared**: TypeScript 5.9, Zod, pnpm workspaces
- **PDF**: expo-print + expo-sharing
