import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getUserByTelegramId, getSetting } from '../db/queries.js';

export async function handleReferral(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('👋 أرسل /start للبدء.');
    return;
  }

  const botUsername = ctx.botInfo.username;
  const referralLink = `https://t.me/${botUsername}?start=ref_${from.id}`;

  const rewardStr = await getSetting('referral_reward');
  const rewardPoints = rewardStr ? parseInt(rewardStr, 10) : 0;

  const message =
    `🎁 دعوة الأصدقاء\n\n` +
    `شارك رابطك الخاص مع أصدقائك وأكسب نقاط مجاناً!\n\n` +
    `💰 مكافأة كل دعوة: ${rewardPoints} نقطة\n` +
    `👥 عدد من دعوتهم: ${user.referral_count}\n\n` +
    `🔗 رابط دعوتك:\n${referralLink}`;

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.url('📤 مشاركة الرابط', `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('انضم معي واكسب نقاط مجاناً!')}`)]
    ]),
  );
}
