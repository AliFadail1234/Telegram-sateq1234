import { Markup } from 'telegraf';
import type { PricingTier } from '../config/pricing.js';

// ===== القائمة الرئيسية =====

export const mainMenuKeyboard = Markup.keyboard([
  ['📊 رصيدي', '⭐ كسب نقاط'],
  ['☀️ مكافأة يومية', '💸 إرسال نقاط'],
  ['📢 ترويج قناتي', '👤 حسابي'],
  ['🎁 دعوة الأصدقاء', '💰 شراء نقاط'],
  ['🏆 المتصدرون'],
]).resize();

// ===== الأدمن =====

export const adminMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📢 إدارة القنوات', 'admin_channels')],
  [Markup.button.callback('🎯 إدارة الحملات', 'admin_campaigns')],
  [Markup.button.callback('👥 إدارة المستخدمين', 'admin_users')],
  [Markup.button.callback('⚙️ إعدادات التسعير', 'admin_pricing')],
  [Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
]);

export const adminChannelsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ إضافة قناة', 'admin_add_channel')],
  [Markup.button.callback('📋 قائمة القنوات', 'admin_list_channels')],
  [Markup.button.callback('🔙 رجوع', 'admin_back')],
]);

export const adminUsersKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔍 بحث عن مستخدم', 'admin_search_user')],
  [Markup.button.callback('📊 عدد المستخدمين', 'admin_users_count')],
  [Markup.button.callback('🔙 رجوع', 'admin_back')],
]);

export const adminCampaignsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🟢 الحملات النشطة', 'admin_active_campaigns')],
  [Markup.button.callback('✅ الحملات المكتملة', 'admin_completed_campaigns')],
  [Markup.button.callback('🔙 رجوع', 'admin_back')],
]);

export const adminBackKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 رجوع للقائمة', 'admin_back')],
]);

// ===== لوحة التسعير =====

export function adminPricingKeyboard(tiers: PricingTier[]) {
  const tierBtns = tiers.map((t, i) => [
    Markup.button.callback(`✏️ ${t.subscribers} مشتركين ← ${t.points} نقطة`, `admin_edit_tier_${i}`),
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ تعديل نقاط الاشتراك في الحملة', 'admin_edit_sub_points')],
    ...tierBtns,
    [Markup.button.callback('🔙 رجوع', 'admin_back')],
  ]);
}

// ===== مهام الاشتراك =====

export function channelTaskKeyboard(channelUsername: string, itemId: number, itemType: 'channel' | 'campaign') {
  const username = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
  const checkData = itemType === 'channel' ? `check_channel_${itemId}` : `check_campaign_${itemId}`;
  const skipData = itemType === 'channel' ? `skip_channel_${itemId}` : `skip_campaign_${itemId}`;
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 اشترك في القناة', `https://t.me/${username}`)],
    [Markup.button.callback('✅ تحقق من الاشتراك', checkData)],
    [Markup.button.callback('⏭️ تخطي هذه المهمة', skipData), Markup.button.callback('🔙 رجوع', 'earn_menu')],
  ]);
}

// ===== اختيار عدد المشتركين =====

export function subscriberChoiceKeyboard(userPoints: number, tiers: PricingTier[]) {
  const rows = tiers
    .filter(tier => tier.points <= userPoints)
    .map(tier => [Markup.button.callback(tier.label, `promote_choose_${tier.subscribers}_${tier.points}`)]);

  if (rows.length === 0) return null;

  rows.push([Markup.button.callback('❌ إلغاء', 'promote_cancel')]);
  return Markup.inlineKeyboard(rows);
}

// ===== زر الترويج الكامل أو إدخال عدد مخصص =====
export function promoteAllOrCustomKeyboard(channelUsername: string, maxSubs: number, cost: number) {
  const encoded = encodeURIComponent(channelUsername);
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🚀 الترويج بكل النقاط — ${maxSubs} عضو (${cost} نقاط)`, `promote_all_${maxSubs}_${cost}_${encoded}`)],
    [Markup.button.callback('✏️ أدخل عدد الأعضاء', `promote_custom_${encoded}`)],
    [Markup.button.callback('❌ إلغاء', 'promote_cancel')],
  ]);
}

// ===== تأكيد الحملة =====

export function campaignConfirmKeyboard(channelUsername: string, targetSubs: number, cost: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ تأكيد وإنشاء الحملة', `promote_confirm_${targetSubs}_${cost}_${encodeURIComponent(channelUsername)}`)],
    [Markup.button.callback('❌ إلغاء', 'promote_cancel')],
  ]);
}

// ===== إدارة حملة واحدة =====

export function adminCampaignActionsKeyboard(campaignId: number, status: string) {
  const btns = [];
  if (status === 'active') {
    btns.push([Markup.button.callback('🔴 إيقاف الحملة', `admin_stop_campaign_${campaignId}`)]);
  }
  btns.push([Markup.button.callback('🗑️ حذف الحملة', `admin_delete_campaign_${campaignId}`)]);
  btns.push([Markup.button.callback('🔙 رجوع', 'admin_campaigns')]);
  return Markup.inlineKeyboard(btns);
}
