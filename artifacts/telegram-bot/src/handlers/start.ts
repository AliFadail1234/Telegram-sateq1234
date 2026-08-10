import type { Context } from 'telegraf';
import { getOrCreateUser, getUserByTelegramId, getSetting, recordPendingReferral, getUserById } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { welcomeMessage } from '../utils/messages.js';
import { checkMandatoryChannel } from './mandatory.js';
import { handleGiftStart } from './gift.js';

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  // استخراج معامل من /start
  const text = (ctx.message as { text?: string } | undefined)?.text ?? '';

  // هدية نقاط: /start gift_<id>
  const giftMatch = text.match(/^\/start\s+gift_(\d+)$/);
  if (giftMatch) {
    // تسجيل المستخدم أولاً إذا لم يكن موجوداً
    await getOrCreateUser(from.id, from.first_name, from.last_name ?? null, from.username ?? null);
    await handleGiftStart(ctx, parseInt(giftMatch[1]!, 10));
    return;
  }

  // دعوة: /start ref_{telegramId}
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
      const [rewardStr, thresholdStr] = await Promise.all([
        getSetting('referral_reward'),
        getSetting('referral_task_threshold'),
      ]);
      const rewardPoints = rewardStr ? parseInt(rewardStr, 10) : 0;
      const requiredTasks = thresholdStr ? parseInt(thresholdStr, 10) : 3;
      if (rewardPoints > 0) {
        await recordPendingReferral(referrer.id, user.id, rewardPoints, requiredTasks);
        // إشعار المُحيل بقالب مخصَّص
        try {
          const updatedReferrer = await getUserById(referrer.id);
          const msgTemplate = await getSetting('referral_notify_msg');
          const defMsg = `🎉 دعوة ناجحة!\n\nانضم <b>{name}</b> عبر رابطك!\n⏳ ستحصل على <b>{points} نقطة</b> بعد إتمام صديقك المهام المطلوبة.\n🏦 رصيدك الحالي: {total} نقطة`;
          const inviteeName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
          const text = (msgTemplate || defMsg)
            .replace(/{name}/g, inviteeName)
            .replace(/{points}/g, String(rewardPoints))
            .replace(/{threshold}/g, String(requiredTasks))
            .replace(/{total}/g, String(updatedReferrer?.points ?? referrer.points));
          await ctx.telegram.sendMessage(referrer.telegram_id, text, { parse_mode: 'HTML' });
        } catch { /* لا تُفشل /start إذا فشل الإشعار */ }
      }
    }
  }

  // التحقق من الاشتراك الإجباري (المستخدمون الجدد والقدامى)
  const allowed = await checkMandatoryChannel(ctx);
  if (!allowed) return;

  await ctx.reply(welcomeMessage(user, isNew), mainMenuKeyboard);
}
