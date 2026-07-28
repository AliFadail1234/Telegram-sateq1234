import type { Context } from 'telegraf';
import { getUserByTelegramId, getDailyClaimStatus, getNextPendingChannel } from '../db/queries.js';
import { subscribeCheckKeyboard } from './keyboards.js';
import { taskMessage } from './messages.js';

// عرض قائمة كسب النقاط الرئيسية
export async function showEarnMenu(ctx: Context, editMode = false): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  const dailyStatus = getDailyClaimStatus(user.id);
  const nextChannel = getNextPendingChannel(user.id);

  // حالة المكافأة اليومية
  let dailyBtnText: string;
  if (dailyStatus.canClaim) {
    dailyBtnText = '🎁 استلم مكافأتك اليومية (+5 نقاط)';
  } else {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    dailyBtnText = `⏰ المكافأة اليومية (بعد ${diffHours}س ${diffMins}د)`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: dailyBtnText, callback_data: 'daily_bonus' }],
      ...(nextChannel
        ? [[{ text: '📋 مهام الاشتراك', callback_data: 'earn_tasks' }]]
        : []),
    ],
  };

  const tasksInfo = nextChannel
    ? `\n📋 مهام الاشتراك: متاحة ✅`
    : `\n📋 مهام الاشتراك: لا توجد مهام حالياً`;

  const text = `⭐ كسب النقاط\n\n💰 رصيدك الحالي: ${user.points} نقطة${tasksInfo}\n\nاختر طريقة كسب النقاط:`;

  if (editMode) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}
