import type { Context } from 'telegraf';
import { getUserByTelegramId, getUserById, claimGift } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';

export async function handleGiftStart(ctx: Context, giftId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ أرسل /start للتسجيل أولاً.');
    return;
  }

  const result = await claimGift(giftId, user.id);

  switch (result.status) {
    case 'ok': {
      const updated = await getUserById(user.id);
      await ctx.reply(
        `🎁 <b>مبروك! استلمت هديتك</b>\n\n` +
        `✨ تمت إضافة: <b>${result.points.toLocaleString('ar-EG')} نقطة</b>\n` +
        `💰 رصيدك الحالي: <b>${(updated?.points ?? user.points).toLocaleString('ar-EG')} نقطة</b>`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
      );
      break;
    }
    case 'already_claimed':
      await ctx.reply('⚠️ لقد استلمت هذه الهدية مسبقاً.', mainMenuKeyboard);
      break;
    case 'exhausted':
      await ctx.reply('😔 عذراً، انتهت حصص هذه الهدية. كانت متاحة لعدد محدود من المستخدمين.', mainMenuKeyboard);
      break;
    case 'not_found':
      await ctx.reply('❌ رابط الهدية غير صالح أو منتهي الصلاحية.', mainMenuKeyboard);
      break;
  }
}
