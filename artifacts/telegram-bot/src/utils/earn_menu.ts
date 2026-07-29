import type { Context } from 'telegraf';
import { getUserByTelegramId, getDailyClaimStatus, getNextPendingChannel, getNextPendingCampaign } from '../db/queries.js';

export async function showEarnMenu(ctx: Context, editMode: boolean): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ أرسل /start للتسجيل.');
    return;
  }

  const dailyStatus = getDailyClaimStatus(user.id);
  const hasChannelTask = !!getNextPendingChannel(user.id);
  const hasCampaignTask = !!getNextPendingCampaign(user.id);
  const hasAnyTask = hasChannelTask || hasCampaignTask;

  // نص زر المكافأة اليومية
  let dailyBtnText: string;
  if (dailyStatus.canClaim) {
    dailyBtnText = '🎁 استلم مكافأتك اليومية (+5 نقاط)';
  } else {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    dailyBtnText = `⏰ المكافأة اليومية (بعد ${h}س ${m}د)`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: dailyBtnText, callback_data: 'daily_bonus' }],
      ...(hasAnyTask ? [[{ text: '📋 مهام الاشتراك', callback_data: 'earn_tasks' }]] : []),
    ],
  };

  const tasksStatus = hasAnyTask ? '✅ متاحة' : '❌ لا توجد حالياً';
  const text = `⭐ كسب النقاط\n\n💰 رصيدك: ${user.points} نقطة\n📋 مهام الاشتراك: ${tasksStatus}\n\nاختر طريقة الكسب:`;

  if (editMode) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}
