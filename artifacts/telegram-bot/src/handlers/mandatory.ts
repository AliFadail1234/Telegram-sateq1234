import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getActiveMandatoryChannels, recordMandatoryJoin, getSetting, MandatoryChannel } from '../db/queries.js';

/**
 * يتحقق من اشتراك المستخدم في جميع القنوات الإجبارية النشطة.
 * يُرجع true إذا مُنح الوصول، false إذا أُرسلت رسالة المنع.
 */
export async function checkMandatoryChannel(ctx: Context): Promise<boolean> {
  const channels = await getActiveMandatoryChannels();
  if (!channels.length) return true;

  const from = ctx.from;
  if (!from) return true;

  const name = from.first_name + (from.last_name ? ` ${from.last_name}` : '');

  // تحقق من الاشتراك في كل قناة — نجمع غير المشترك منها
  const missing: MandatoryChannel[] = [];
  for (const ch of channels) {
    const tag = ch.channel_username.startsWith('@') ? ch.channel_username : `@${ch.channel_username}`;
    try {
      const member = await ctx.telegram.getChatMember(tag, from.id);
      if (member.status === 'left' || member.status === 'kicked') missing.push(ch);
    } catch {
      // إذا تعذّر التحقق (البوت غير مشرف) → نسمح بالمرور لهذه القناة
    }
  }

  if (!missing.length) return true; // مشترك في الكل

  // بناء رسالة المنع
  const msgTemplate = await getSetting('mandatory_channel_msg');
  const channelsList = missing.map(ch => {
    const tag = ch.channel_username.startsWith('@') ? ch.channel_username : `@${ch.channel_username}`;
    return `• ${tag}`;
  }).join('\n');

  const defaultMsg = `🔒 يجب الاشتراك في القنوات التالية أولاً:\n\n{channels}\n\nاشترك ثم اضغط ✅ تحقق.`;
  const text = (msgTemplate || defaultMsg)
    .replace(/{name}/g, name)
    .replace(/{channel}/g, missing[0] ? (missing[0].channel_username.startsWith('@') ? missing[0].channel_username : `@${missing[0].channel_username}`) : '')
    .replace(/{channels}/g, channelsList);

  // أزرار الاشتراك لكل قناة غير مشترك فيها
  const subscribeButtons = missing.map(ch => {
    const tag = ch.channel_username.startsWith('@') ? ch.channel_username : `@${ch.channel_username}`;
    const clean = ch.channel_username.replace(/^@/, '');
    const label = ch.channel_name || tag;
    return [Markup.button.url(`📢 ${label}`, `https://t.me/${clean}`)];
  });

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      ...subscribeButtons,
      [Markup.button.callback('✅ تحققت من اشتراكي', 'mandatory_verify')],
    ]).reply_markup,
  });
  return false;
}

/**
 * يُستدعى عند ضغط المستخدم "✅ تحققت".
 * يُعيد: 'ok' | 'still_missing' (مع قائمة القنوات المتبقية) | 'no_channels'
 */
export async function verifyMandatoryChannels(
  ctx: Context,
  userId: number,
): Promise<'ok' | 'still_missing'> {
  const channels = await getActiveMandatoryChannels();
  if (!channels.length) return 'ok';

  const missing: MandatoryChannel[] = [];
  const justJoined: MandatoryChannel[] = [];

  for (const ch of channels) {
    const tag = ch.channel_username.startsWith('@') ? ch.channel_username : `@${ch.channel_username}`;
    try {
      const member = await ctx.telegram.getChatMember(tag, userId);
      if (member.status === 'left' || member.status === 'kicked') {
        missing.push(ch);
      } else {
        justJoined.push(ch);
      }
    } catch {
      justJoined.push(ch); // افتراض الاشتراك عند فشل التحقق
    }
  }

  // سجّل الانضمامات وتحقق من الحد الأقصى
  for (const ch of justJoined) {
    await recordMandatoryJoin(ch.id);
  }

  return missing.length > 0 ? 'still_missing' : 'ok';
}
