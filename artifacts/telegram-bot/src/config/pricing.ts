// ============================================================
// نظام التسعير — القيم الثابتة كـ fallback
// للتعديل الديناميكي استخدم دوال getCampaignSubscriptionPoints / getActivePricingTiers
// ============================================================

import { getSetting, setSetting } from '../db/queries.js';

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

// نقاط يحصل عليها المستخدم مقابل الاشتراك في حملة (افتراضي)
export const POINTS_PER_CAMPAIGN_SUBSCRIPTION = 1;

// نقاط المكافأة اليومية
export const DAILY_BONUS_POINTS = 5;

// الحد الأدنى لنقاط مهمة القناة (أدمن)
export const MIN_CHANNEL_TASK_POINTS = 1;

// ============================================================
// دوال ديناميكية — تقرأ من قاعدة البيانات
// ============================================================

/** نقاط الاشتراك في حملة (من DB أو الافتراضي) */
export async function getCampaignSubscriptionPoints(): Promise<number> {
  const val = await getSetting('campaign_points');
  if (val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return POINTS_PER_CAMPAIGN_SUBSCRIPTION;
}

/** جداول التسعير النشطة (من DB أو الافتراضية) */
export async function getActivePricingTiers(): Promise<PricingTier[]> {
  const val = await getSetting('pricing_tiers');
  if (val) {
    try {
      const tiers = JSON.parse(val) as PricingTier[];
      if (Array.isArray(tiers) && tiers.length > 0) return tiers;
    } catch { /* تجاهل وإرجاع الافتراضي */ }
  }
  return PRICING_TIERS;
}

/** حفظ نقاط الاشتراك في حملة */
export async function saveCampaignSubscriptionPoints(points: number): Promise<void> {
  await setSetting('campaign_points', String(points));
}

/** حفظ جداول التسعير */
export async function savePricingTiers(tiers: PricingTier[]): Promise<void> {
  await setSetting('pricing_tiers', JSON.stringify(tiers));
}
