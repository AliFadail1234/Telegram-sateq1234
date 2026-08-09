import type { Context } from 'telegraf';
import { getOrCreateUser, getUserByTelegramId, getSetting, recordReferral, getUserById } from '../db/queries.js';
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
        // إشعار المُحيل بقالب مخصَّص
        try {
          const updatedReferrer = await getUserById(referrer.id);
          const msgTemplate = await getSetting('referral_notify_msg');
          const defMsg = `🎉 دعوة ناجحة!\n\nانضم <b>{name}</b> عبر رابطك!\n💰 تم إضافة {points} نقطة لك.\n🏦 رصيدك: {total} نقطة`;
          const inviteeName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
          const text = (msgTemplate || defMsg)
            .replace(/{name}/g, inviteeName)
            .replace(/{points}/g, String(rewardPoints))
            .replace(/{total}/g, String(updatedReferrer?.points ?? referrer.points + rewardPoints));
          await ctx.telegram.sendMessage(referrer.telegram_id, text, { parse_mode: 'HTML' });
        } catch { /* لا تُفشل /start إذا فشل الإشعار */ }
      }
    }
  }

  await ctx.reply(welcomeMessage(user, isNew), mainMenuKeyboard);
}
