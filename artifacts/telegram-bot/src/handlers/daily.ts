import type { Context } from 'telegraf';
import { getUserByTelegramId, claimDailyBonus, getUserById, getSetting } from '../db/queries.js';
import { DAILY_BONUS_POINTS } from '../config/pricing.js';

export async function handleDailyBonus(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  const bonusPointsStr = await getSetting('daily_bonus_points');
  const bonusPoints = bonusPointsStr ? parseInt(bonusPointsStr, 10) : DAILY_BONUS_POINTS;

  const result = await claimDailyBonus(user.id, bonusPoints);

  if (!result.success) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);

    await ctx.answerCbQuery('⏰ استلمت مكافأتك اليوم!', { show_alert: true });
    await ctx.editMessageText(
      `🎁 المكافأة اليومية\n\n⏰ استلمتها بالفعل اليوم.\n\n🕐 العودة بعد: ${h} ساعة و ${m} دقيقة\n💰 رصيدك: ${user.points} نقطة`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] } },
    );
    return;
  }

  const updated = (await getUserById(user.id))!;
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');

  const msgTemplate = await getSetting('daily_bonus_msg');
  const defaultMsg = `🎁 مبروك! استلمت مكافأتك اليومية\n\n💰 تمت إضافة: {points} نقاط\n🏦 رصيدك الكلي: {total} نقطة\n\n⏰ عُد غداً لمكافأة جديدة!`;
  const text = (msgTemplate || defaultMsg)
    .replace(/{name}/g, name)
    .replace(/{points}/g, String(bonusPoints))
    .replace(/{total}/g, String(updated.points));

  await ctx.answerCbQuery(`✅ تم إضافة ${bonusPoints} نقاط!`);
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] },
  });
}
