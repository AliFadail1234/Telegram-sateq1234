import type { Context } from 'telegraf';
import { getOrCreateUser, getUserByTelegramId, getSetting, recordReferral } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { welcomeMessage } from '../utils/messages.js';

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  // استخراج معامل الدعوة من /start ref_{telegramId}
  const text = (ctx.message as { text?: string } | undefined)?.text ?? '';
  const paramMatch = text.match(/^\/start\s+ref_(\d+)$/);
  const referrerTelegramId = paramMatch ? parseInt(paramMatch[1]!, 10) : null;

  const { user, isNew } = await getOrCreateUser(
    from.id,
    from.first_name,
    from.last_name ?? null,
    from.username ?? null,
  );

  // معالجة الدعوة عند تسجيل مستخدم جديد
  if (isNew && referrerTelegramId && referrerTelegramId !== from.id) {
    const referrer = await getUserByTelegramId(referrerTelegramId);
    if (referrer) {
      const rewardStr = await getSetting('referral_reward');
      const rewardPoints = rewardStr ? parseInt(rewardStr, 10) : 0;
      if (rewardPoints > 0) {
        await recordReferral(referrer.id, user.id, rewardPoints);
      }
    }
  }

  await ctx.reply(welcomeMessage(user, isNew), mainMenuKeyboard);
}
