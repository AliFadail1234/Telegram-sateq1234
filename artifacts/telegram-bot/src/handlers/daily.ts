import type { Context } from 'telegraf';
import { getUserByTelegramId, claimDailyBonus, getUserById } from '../db/queries.js';

// نقاط المكافأة اليومية
const DAILY_POINTS = 5;

export async function handleDailyBonus(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.answerCbQuery('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  const result = claimDailyBonus(user.id, DAILY_POINTS);

  if (!result.success) {
    // حساب الوقت المتبقي حتى منتصف الليل
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    await ctx.answerCbQuery('⏰ استلمت مكافأتك اليوم!', { show_alert: true });
    await ctx.editMessageText(
      `🎁 المكافأة اليومية\n\n⏰ لقد استلمت مكافأتك اليوم بالفعل.\n\n🕐 العودة بعد: ${diffHours} ساعة و ${diffMins} دقيقة\n\n💰 رصيدك الحالي: ${user.points} نقطة`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 رجوع', callback_data: 'earn_menu' }],
          ],
        },
      },
    );
    return;
  }

  const updatedUser = getUserById(user.id)!;
  await ctx.answerCbQuery(`✅ تم إضافة ${DAILY_POINTS} نقاط!`);
  await ctx.editMessageText(
    `🎁 مبروك! استلمت مكافأتك اليومية\n\n💰 تم إضافة: ${DAILY_POINTS} نقاط\n🏦 رصيدك الكلي: ${updatedUser.points} نقطة\n\n⏰ عُد غداً لمكافأة جديدة!`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 رجوع', callback_data: 'earn_menu' }],
        ],
      },
    },
  );
}
