# دليل نشر سوبيرات الغيث 🚀

## المعمارية
```
┌─────────────────────┐      HTTPS       ┌──────────────────────┐
│  Frontend (Vercel)  │ ──────────────►  │  Backend (Render)    │
│  Expo Web Build     │                  │  Node.js / Express   │
│  dist/ static files │  ◄────────────── │  PORT=3000           │
└─────────────────────┘    JSON API      └──────────┬───────────┘
                                                     │
                                              PostgreSQL
                                           (Render Database)
```

---

## الجزء الأول: قاعدة البيانات على Render

### 1. إنشاء PostgreSQL Database
1. ادخل على [render.com](https://render.com) وسجل دخول
2. اضغط **New → PostgreSQL**
3. أعطه اسماً مثل `soubeirat-db`
4. اختر المنطقة الأقرب إليك
5. اضغط **Create Database**
6. من الصفحة التي تظهر، انسخ **Internal Database URL** — ستستخدمه لاحقاً

> ⚠️ الـ Internal Database URL يبدأ بـ `postgresql://` وتستخدمه فقط داخل Render

---

## الجزء الثاني: الباكاند على Render

### 2. رفع الكود على GitHub
```bash
git init
git add .
git commit -m "initial commit"
gh repo create soubeirat-alghaith --public --push
# أو: git remote add origin https://github.com/YOUR_USERNAME/REPO.git && git push
```

### 3. إنشاء Web Service على Render
1. في Render: **New → Web Service**
2. اربطه بمستودع GitHub
3. أعطه إعدادات البناء:

| الإعداد | القيمة |
|---------|--------|
| **Name** | `soubeirat-api` |
| **Root Directory** | *(اتركه فارغاً — جذر المشروع)* |
| **Runtime** | Node |
| **Build Command** | `pnpm install && pnpm --filter @workspace/api-server run build` |
| **Start Command** | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| **Instance Type** | Free |

### 4. إضافة متغيرات البيئة
في صفحة الـ Service: **Environment → Add Environment Variable**

| المتغير | القيمة |
|---------|--------|
| `DATABASE_URL` | الرابط الذي نسخته من قاعدة البيانات |
| `JWT_SECRET` | اكتب سلسلة عشوائية طويلة (مثل: `a8f3k9x2m7q4p1n6y5w0`) |
| `PORT` | `3000` |
| `ALLOWED_ORIGINS` | *(تضيفها بعد نشر Vercel)* |

5. اضغط **Create Web Service** — انتظر حتى يظهر **Live ✓**
6. انسخ رابطه: `https://soubeirat-api.onrender.com`

### 5. إنشاء الجداول (migrate)
بعد أن يعمل الخادم، شغّل هذا الأمر **مرة واحدة فقط**:
```bash
# محلياً مع DATABASE_URL الخاص بـ Render
cd lib/db
DATABASE_URL="postgresql://..." pnpm run push
```

أو افتح **Shell** في لوحة Render وشغّل:
```bash
cd lib/db && pnpm run push
```

### 6. زرع بيانات الأدمن (seed)
بعد الـ migrate، شغّل هذا الطلب مرة واحدة فقط:
```bash
curl -X POST https://soubeirat-api.onrender.com/api/auth/seed
```
يُنشئ حساب الأدمن:
- **اسم المستخدم:** `mohghaith`
- **كلمة المرور:** `admin123`

> غيّر كلمة المرور فور تسجيل دخولك الأول!

---

## الجزء الثالث: الفرونتاند على Vercel

### 7. إعداد متغير البيئة في الموبايل
أنشئ ملف `artifacts/mobile/.env.local`:
```bash
EXPO_PUBLIC_API_URL=https://soubeirat-api.onrender.com
```

ارفعه على GitHub وتأكد أن `.gitignore` لا يتجاهله:
```bash
# في .gitignore — تأكد أنه غير موجود
# .env.local   ← يجب أن يُرفع
```

### 8. بناء نسخة الويب
```bash
cd artifacts/mobile
pnpm exec expo export -p web
# ينتج مجلد: artifacts/mobile/dist/
```

### 9. نشر على Vercel
**الطريقة الأسرع — CLI:**
```bash
npm i -g vercel
cd artifacts/mobile
vercel deploy dist/ --prod
```

**أو عبر الموقع:**
1. [vercel.com](https://vercel.com) → **Add New → Project**
2. استورد من GitHub
3. أعدّ البناء:

| الإعداد | القيمة |
|---------|--------|
| **Framework** | Other |
| **Root Directory** | `artifacts/mobile` |
| **Build Command** | `pnpm exec expo export -p web` |
| **Output Directory** | `dist` |
| **Install Command** | `pnpm install` |

4. أضف في **Environment Variables**:

| المتغير | القيمة |
|---------|--------|
| `EXPO_PUBLIC_API_URL` | `https://soubeirat-api.onrender.com` |

5. اضغط **Deploy** — انتظر حتى ينتهي
6. انسخ رابط Vercel: `https://soubeirat-alghaith.vercel.app`

### 10. أضف رابط Vercel للباكاند (CORS)
ارجع إلى Render → الـ Service → **Environment**:
```
ALLOWED_ORIGINS = https://soubeirat-alghaith.vercel.app
```
اضغط **Save Changes** وانتظر إعادة التشغيل.

---

## ملف `vercel.json` (ضعه في `artifacts/mobile/`)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Content-Type-Options", "value": "sniff" }]
    }
  ]
}
```

## ملف `render.yaml` (للجذر)
```yaml
services:
  - type: web
    name: soubeirat-api
    runtime: node
    # لا تضع rootDir — يجب أن يعمل من جذر المونوريبو
    buildCommand: corepack enable pnpm && pnpm install && pnpm --filter @workspace/api-server run build
    startCommand: node --enable-source-maps artifacts/api-server/dist/index.mjs
    envVars:
      - key: PORT
        value: 3000
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: soubeirat-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: ALLOWED_ORIGINS
        value: https://your-app.vercel.app   # غيّر هذا بعد نشر Vercel

databases:
  - name: soubeirat-db
    databaseName: soubeirat
    plan: free
```
> مع هذا الملف، Render ينشئ كل شيء تلقائياً بضغطة واحدة!

---

## APK للأندرويد (اختياري)
```bash
# تثبيت EAS
npm i -g eas-cli
eas login

cd artifacts/mobile
eas build:configure

# بناء APK للتجربة (مجاني)
eas build -p android --profile preview
```

ملف `eas.json`:
```json
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

---

## ترتيب الخطوات (ملخص)

```
1. أنشئ PostgreSQL على Render
2. أنشئ Web Service على Render (الباكاند)
3. شغّل: pnpm run push  ← لإنشاء الجداول
4. شغّل: curl POST /api/auth/seed  ← لإنشاء الأدمن
5. أضف EXPO_PUBLIC_API_URL في artifacts/mobile/.env.local
6. انشر على Vercel (الفرونتاند)
7. أضف ALLOWED_ORIGINS في Render = رابط Vercel
```

---

## اختبار الباكاند (بعد النشر)

```bash
# Health check
curl https://soubeirat-api.onrender.com/api/healthz

# تسجيل دخول
curl -X POST https://soubeirat-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mohghaith","password":"admin123"}'

# قائمة المستخدمين (استخدم الـ token من الخطوة السابقة)
curl https://soubeirat-api.onrender.com/api/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## ملاحظات مهمة

| النقطة | التفاصيل |
|--------|----------|
| **Render Free Tier** | الخادم ينام بعد 15 دقيقة خمول، أول طلب يستغرق ~30 ثانية للإيقاظ |
| **الحل** | استخدم [UptimeRobot](https://uptimerobot.com) مجاناً لإبقاء الخادم مستيقظاً |
| **قاعدة البيانات** | Render Free DB تنتهي بعد 90 يوم — يمكن الترقية أو الانتقال لـ Supabase (مجاني دائم) |
| **Supabase بديل** | `DATABASE_URL` من Supabase يعمل مباشرة بدون أي تغيير في الكود |
