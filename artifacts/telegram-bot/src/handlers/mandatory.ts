import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getSetting } from '../db/queries.js';

/**
 * يتحقق من اشتراك المستخدم في قناة الاشتراك الإجباري.
 * يُرجع true إذا مُنح الوصول (مشترك أو لا توجد قناة إجبارية).
 * يُرجع false إذا أُرسلت رسالة المنع وجب إيقاف المعالجة.
 */
export async function checkMandatoryChannel(ctx: Context): Promise<boolean> {
  const channelUsername = await getSetting('mandatory_channel');
  if (!channelUsername || !channelUsername.trim()) return true; // لا توجد قناة إجبارية

  const from = ctx.from;
  if (!from) return true;

  const tag = channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`;
  const usernameClean = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;

  try {
    const member = await ctx.telegram.getChatMember(tag, from.id);
    if (member.status !== 'left' && member.status !== 'kicked') return true; // مشترك بالفعل
  } catch {
    // إذا تعذّر التحقق (البوت غير مشرف مثلاً) نسمح بالمرور
    return true;
  }

  // المستخدم غير مشترك — أرسل رسالة المنع
  const msgTemplate = await getSetting('mandatory_channel_msg');
  const name = from.first_name + (from.last_name ? ` ${from.last_name}` : '');
  const defaultMsg = `🔒 للوصول إلى البوت يجب الاشتراك في:\n${tag}\n\nاشترك ثم اضغط ✅ تحقق.`;
  const text = (msgTemplate || defaultMsg)
    .replace(/{name}/g, name)
    .replace(/{channel}/g, tag);

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.url(`📢 اشترك في ${tag}`, `https://t.me/${usernameClean}`)],
      [Markup.button.callback('✅ تحققت من اشتراكي', 'mandatory_verify')],
    ]).reply_markup,
  });
  return false;
}
