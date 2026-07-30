// ============================================================
// نظام التسعير — عدّل هذا الملف فقط لتغيير الأسعار مستقبلاً
// ============================================================

export interface PricingTier {
  subscribers: number; // عدد المشتركين المستهدف
  points: number;      // النقاط المطلوبة
  label: string;       // نص الزر
}

export const PRICING_TIERS: PricingTier[] = [
  { subscribers: 5,  points: 10,  label: '5 مشتركين  — 10 نقاط'  },
  { subscribers: 10, points: 20,  label: '10 مشتركين — 20 نقطة'  },
  { subscribers: 20, points: 40,  label: '20 مشتركاً — 40 نقطة'  },
  { subscribers: 50, points: 100, label: '50 مشتركاً — 100 نقطة' },
];

// نقاط يحصل عليها المستخدم مقابل الاشتراك في حملة
export const POINTS_PER_CAMPAIGN_SUBSCRIPTION = 1;

// نقاط المكافأة اليومية
export const DAILY_BONUS_POINTS = 5;

// الحد الأدنى لنقاط مهمة القناة (أدمن)
export const MIN_CHANNEL_TASK_POINTS = 1;
