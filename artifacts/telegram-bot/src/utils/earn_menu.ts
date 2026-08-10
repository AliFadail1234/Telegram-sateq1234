import type { Context } from 'telegraf';
import { getUserByTelegramId, getDailyClaimStatus, getNextPendingChannel, getNextPendingCampaign, getSetting } from '../db/queries.js';

export async function showEarnMenu(ctx: Context, editMode: boolean): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ أرسل /start للتسجيل.');
    return;
  }

  const intervalStr = await getSetting('daily_bonus_interval');
  const intervalHours = intervalStr ? parseFloat(intervalStr) : 24;

  const [dailyStatus, hasChannelTask, hasCampaignTask] = await Promise.all([
    getDailyClaimStatus(user.id, intervalHours),
    getNextPendingChannel(user.id).then(v => !!v),
    getNextPendingCampaign(user.id).then(v => !!v),
  ]);

  const hasAnyTask = hasChannelTask || hasCampaignTask;

  let dailyBtnText: string;
  if (dailyStatus.canClaim) {
    dailyBtnText = `🎁 استلم مكافأتك (${intervalHours < 24 ? intervalHours < 1 ? Math.round(intervalHours * 60) + 'د' : intervalHours + 'س' : 'يومية'})`;
  } else {
    const ms = dailyStatus.msUntilNext;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    dailyBtnText = h > 0 ? `⏰ المكافأة (بعد ${h}س ${m}د)` : `⏰ المكافأة (بعد ${m}د)`;
  }

  const keyboard = {
    inline_keyboard: [
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
