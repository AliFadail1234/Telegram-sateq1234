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
  const updated = await getUserById(user.id);

  switch (result) {
    case 'ok':
      await ctx.reply(
        `🎁 مبروك!\n\nتم إضافة نقاط الهدية إلى رصيدك.\n💰 رصيدك الحالي: ${updated?.points ?? user.points} نقطة`,
        mainMenuKeyboard,
      );
      break;
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
