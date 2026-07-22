# سوبيرات الغيث — نظام الإدارة

متجر متكامل لإدارة سوبيرات الغيث: مبيعات، مصاريف، موردون، وديون زبائن.

## هيكل المشروع

```
soubeirat-alghaith/
├── artifacts/
│   ├── api-server/        # Express 5 REST API (يُنشر على Render)
│   └── mobile/            # Expo / React Native (يُنشر على Vercel — web)
├── lib/
│   ├── db/                # Drizzle ORM + PostgreSQL schema
│   ├── api-spec/          # OpenAPI spec
│   ├── api-zod/           # Zod schemas (مولّدة)
│   └── api-client-react/  # React Query hooks (مولّدة)
└── pnpm-workspace.yaml
```

## النشر الإنتاجي

### Backend — Render
- **Build Command**: `pnpm install && pnpm --filter @workspace/api-server run build`
- **Start Command**: `pnpm --filter @workspace/db run push && node --enable-source-maps artifacts/api-server/dist/index.mjs`
- **Runtime**: Node.js

### Frontend — Vercel
- **Build Command**: `pnpm install && pnpm --filter @workspace/mobile run build:web`
- **Output Directory**: `artifacts/mobile/dist`
- الإعدادات موجودة في `vercel.json` في جذر المشروع

### Database — Neon PostgreSQL
- الاتصال عبر `NEON_DATABASE_URL`
- المخطط يُطبَّق تلقائياً عند بدء تشغيل الـ API (drizzle-kit push)

## متغيرات البيئة المطلوبة

### Render (Backend)
| المتغير | الوصف |
|---------|-------|
| `NEON_DATABASE_URL` | رابط اتصال Neon PostgreSQL |
| `JWT_SECRET` | مفتاح JWT (Render يولّده تلقائياً) |
| `SESSION_SECRET` | مفتاح الجلسة |
| `ALLOWED_ORIGINS` | رابط Vercel، مثل: `https://your-app.vercel.app` |
| `PORT` | 10000 (Render default) |
| `NODE_ENV` | production |

### Vercel (Frontend)
| المتغير | الوصف |
|---------|-------|
| `EXPO_PUBLIC_API_URL` | رابط Render API، مثل: `https://soubeirat-api.onrender.com` |

## التشغيل المحلي

```bash
pnpm install
# أضف NEON_DATABASE_URL في .env
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

## الحساب الافتراضي (بعد seed)

- اسم المستخدم: `mohghaith`
- كلمة المرور: `admin123`
- `POST /api/auth/seed` — يُنفَّذ مرة واحدة فقط

## User preferences

- اللغة العربية للتوثيق وتعليقات الكود
- monorepo بـ pnpm workspaces
- لا localhost — كل شيء عبر Environment Variables
