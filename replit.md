# بوت تيليجرام - نظام النقاط والاشتراكات

بوت تيليجرام يسمح للمستخدمين بكسب نقاط عبر الاشتراك في قنوات، واستخدام النقاط لترويج قنواتهم الخاصة.

## تشغيل المشروع

- `pnpm --filter @workspace/telegram-bot run dev` — تشغيل البوت (وضع التطوير مع إعادة التشغيل التلقائي)
- `pnpm --filter @workspace/telegram-bot run start` — تشغيل البوت (إنتاج)
- `pnpm --filter @workspace/telegram-bot run typecheck` — فحص الأنواع

## متغيرات البيئة المطلوبة

- `TELEGRAM_BOT_TOKEN` — توكن البوت من @BotFather (سر)
- `ADMIN_ID` — معرّف أدمن البوت على تيليجرام
- `ADMIN_PASSWORD` — كلمة مرور لوحة التحكم الويب (الافتراضي: admin123)

## البنية

```
artifacts/telegram-bot/
├── src/
│   ├── index.ts            # نقطة الدخول
│   ├── bot.ts              # إعداد البوت
│   ├── admin/
│   │   ├── api.ts          # Admin REST API
│   │   └── dashboard.html  # لوحة تحكم ويب
│   ├── db/
│   │   ├── database.ts     # اتصال SQLite (node:sqlite)
│   │   └── queries.ts      # جميع استعلامات قاعدة البيانات
│   ├── handlers/
│   │   ├── index.ts        # تسجيل جميع المعالجات
│   │   ├── start.ts        # أمر /start والتسجيل التلقائي
│   │   ├── balance.ts      # عرض الرصيد والإحصائيات
│   │   ├── tasks.ts        # كسب النقاط والتحقق من الاشتراك
│   │   ├── promote.ts      # ترويج القنوات (محادثة متعددة الخطوات)
│   │   ├── account.ts      # عرض بيانات الحساب
│   │   ├── daily.ts        # المكافأة اليومية
│   │   └── admin.ts        # لوحة الأدمن في تيليجرام
│   ├── config/
│   │   └── pricing.ts      # إعدادات الأسعار
│   └── utils/
│       ├── keyboards.ts    # لوحات المفاتيح (inline keyboards)
│       ├── earn_menu.ts    # قائمة كسب النقاط
│       └── messages.ts     # قوالب الرسائل
└── data/
    └── bot.db              # قاعدة بيانات SQLite (تُنشأ تلقائياً)
```

## GitHub

- المستودع: https://github.com/AliFadail1234/Telegram-sateq1234
- كل تعديل يُرفع تلقائياً إلى GitHub

## التقنيات

- **Runtime:** Node.js 24 (TypeScript via tsx)
- **Bot Framework:** Telegraf v4
- **Database:** SQLite عبر `node:sqlite` المدمجة (لا تثبيت مطلوب)
- **Language:** TypeScript

## لوحة التحكم الويب

- الرابط: `https://your-app.onrender.com/admin`
- تسجيل دخول بـ `ADMIN_PASSWORD`
- تبويبات: إحصائيات، قنوات، حملات، مستخدمون

## User preferences

- الواجهة كاملاً بالعربية
- أولوية البساطة والاستقرار على الميزات الكثيرة
- لا تضف ميزات غير مطلوبة
- بعد كل تعديل يتم رفع الكود إلى GitHub

## Gotchas

- البوت يستخدم `node:sqlite` التجريبية في Node 24 — تظهر تحذير عند التشغيل لكنها تعمل بشكل صحيح
- للتحقق من الاشتراك في القناة يجب أن تكون القناة عامة (public)
- ملف قاعدة البيانات `data/bot.db` يُنشأ تلقائياً عند أول تشغيل
