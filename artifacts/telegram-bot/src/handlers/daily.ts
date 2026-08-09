import type { Context } from 'telegraf';
import { getUserByTelegramId, claimDailyBonus, getUserById, getSetting } from '../db/queries.js';
import { DAILY_BONUS_POINTS } from '../config/pricing.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';

async function processDailyBonus(ctx: Context, isTextButton: boolean): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  if (!isTextButton && !ctx.callbackQuery) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) {
    if (isTextButton) await ctx.reply('⚠️ أرسل /start أولاً.');
    else await (ctx as any).answerCbQuery('⚠️ أرسل /start أولاً.');
    return;
  }

  const [bonusPointsStr, intervalStr] = await Promise.all([
    getSetting('daily_bonus_points'),
    getSetting('daily_bonus_interval'),
  ]);
  const bonusPoints = bonusPointsStr ? parseInt(bonusPointsStr, 10) : DAILY_BONUS_POINTS;
  const intervalHours = intervalStr ? parseFloat(intervalStr) : 24;

  const result = await claimDailyBonus(user.id, bonusPoints, intervalHours);

  if (!result.success) {
    const ms = result.msUntilNext ?? 0;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const timeStr = h > 0 ? `${h} ساعة و ${m} دقيقة` : `${m} دقيقة`;
    const text = `🎁 المكافأة ${intervalHours < 24 ? `كل ${intervalHours < 1 ? Math.round(intervalHours * 60) + ' دقيقة' : intervalHours + ' ساعة'}` : 'اليومية'}\n\n⏰ استلمتها بالفعل.\n\n🕐 العودة بعد: ${timeStr}\n💰 رصيدك: ${user.points} نقطة`;
    if (isTextButton) {
      await ctx.reply(text, mainMenuKeyboard);
    } else {
      await (ctx as any).answerCbQuery('⏰ استلمت مكافأتك!', { show_alert: true });
      await (ctx as any).editMessageText(text, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] },
      });
    }
    return;
  }

  const updated = (await getUserById(user.id))!;
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');

  const msgTemplate = await getSetting('daily_bonus_msg');
  const defaultMsg = `🎁 مبروك! استلمت مكافأتك\n\n💰 تمت إضافة: {points} نقاط\n🏦 رصيدك الكلي: {total} نقطة\n\n⏰ عُد بعد ${intervalHours < 1 ? Math.round(intervalHours * 60) + ' دقيقة' : intervalHours + ' ساعة'}!`;
  const text = (msgTemplate || defaultMsg)
    .replace(/{name}/g, name)
    .replace(/{points}/g, String(bonusPoints))
    .replace(/{total}/g, String(updated.points));

  if (isTextButton) {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup });
  } else {
    await (ctx as any).answerCbQuery(`✅ تم إضافة ${bonusPoints} نقاط!`);
    await (ctx as any).editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] },
    });
  }
}

/** من callback_query (زر داخل قائمة كسب النقاط) */
export async function handleDailyBonus(ctx: Context): Promise<void> {
  await processDailyBonus(ctx, false);
}

/** من القائمة الرئيسية النصية */
export async function handleDailyBonusMenu(ctx: Context): Promise<void> {
  await processDailyBonus(ctx, true);
}
